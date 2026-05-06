// ============================================================
// QR在庫管理システム — Google Apps Script メインロジック
// ============================================================

// ============================================================
// ★ 設定エリア（変更はここだけ）
// ============================================================

/** スプレッドシートID（空欄 → スクリプトに紐づくSSを自動使用） */
const SS_ID = '';

/** シート名 */
const MASTER_SHEET_NAME  = '部品マスタ';
const HISTORY_SHEET_NAME = '入出庫履歴';

/** 部品マスタ の列番号（A列=1 から始まる） */
const COL_ITEM_ID   = 1; // 部品ID
const COL_ITEM_NAME = 2; // 部品名
const COL_UNIT      = 3; // 単位
const COL_STOCK     = 4; // 現在庫数
const COL_MIN_STOCK = 5; // 最小在庫数
const COL_SHELF     = 6; // 棚番号
const COL_MEMO      = 7; // 備考

/** 入出庫履歴 の列番号 */
const COL_H_TIMESTAMP   = 1; // タイムスタンプ
const COL_H_ITEM_ID     = 2; // 部品ID
const COL_H_ITEM_NAME   = 3; // 部品名
const COL_H_TYPE        = 4; // 種別（入庫/出庫）
const COL_H_QTY         = 5; // 数量
const COL_H_AFTER_STOCK = 6; // 処理後在庫数
const COL_H_OPERATOR    = 7; // 担当者

/** 一度に取得する履歴件数 */
const HISTORY_LIMIT = 30;

// ============================================================
// ユーティリティ
// ============================================================

/**
 * スプレッドシートオブジェクトを返す
 * SS_ID が設定されていればそのSS、なければアクティブなSSを使用
 */
function getSpreadsheet() {
  return SS_ID
    ? SpreadsheetApp.openById(SS_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * JSON文字列を ContentService のレスポンスに変換するヘルパー
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 部品IDの形式バリデーション（セキュリティ対策）
 * 英数字・ハイフン・アンダースコアのみ許可、1〜30文字
 */
function validateItemId(id) {
  if (!id || typeof id !== 'string') return false;
  return /^[A-Za-z0-9\-_]{1,30}$/.test(id.trim());
}

// ============================================================
// WebApp HTTP ハンドラー
// ============================================================

/**
 * GETリクエスト処理 — HTML画面を返す
 * デプロイURLにアクセスすると呼ばれる
 */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('QR在庫管理')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * POSTリクエスト処理 — 外部システムからのJSON API用
 * WebアプリUI内からは google.script.run 経由で handleRequest() を呼ぶ
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: 'リクエストボディが空です' });
    }
    const body = JSON.parse(e.postData.contents);
    return jsonResponse(handleRequest(body));
  } catch (err) {
    console.error('doPost エラー:', err.toString());
    return jsonResponse({ success: false, error: 'サーバーエラー: ' + err.message });
  }
}

/**
 * アクションディスパッチャー
 * google.script.run と doPost の両方から呼ばれる共通エントリーポイント
 * @param {Object} body - { action, ...params }
 */
function handleRequest(body) {
  try {
    const action = body && body.action;
    switch (action) {
      case 'get_item':          return getItem(body.itemId);
      case 'stock_transaction': return processTransaction(body);
      case 'get_low_stock':     return getLowStock();
      case 'get_all_items':     return getAllItems();
      case 'get_history':       return getHistory();
      default:
        return { success: false, error: '不明なアクション: ' + action };
    }
  } catch (err) {
    console.error('handleRequest エラー:', err.toString());
    return { success: false, error: 'サーバーエラー: ' + err.message };
  }
}

// ============================================================
// 部品マスタ 検索・取得
// ============================================================

/**
 * 部品IDで部品マスタを検索して部品情報を返す
 * @param {string} id - 検索する部品ID
 * @return {Object} { success, item } | { success, error }
 */
function getItem(id) {
  // セキュリティ：IDの形式チェック
  if (!validateItemId(id)) {
    return { success: false, error: '部品IDの形式が正しくありません（英数字・ハイフン・アンダースコアのみ使用可）' };
  }

  const sheet = getSpreadsheet().getSheetByName(MASTER_SHEET_NAME);
  if (!sheet) {
    return { success: false, error: 'シート「' + MASTER_SHEET_NAME + '」が見つかりません。initializeSheets() を実行してください。' };
  }

  const data = sheet.getDataRange().getValues();

  // 1行目はヘッダーなのでスキップ
  for (let i = 1; i < data.length; i++) {
    const rowId = String(data[i][COL_ITEM_ID - 1]).trim();
    if (rowId === id.trim()) {
      const stock    = Number(data[i][COL_STOCK     - 1]);
      const minStock = Number(data[i][COL_MIN_STOCK - 1]);
      return {
        success: true,
        item: {
          id:       rowId,
          name:     String(data[i][COL_ITEM_NAME - 1]),
          unit:     String(data[i][COL_UNIT      - 1]),
          stock,
          minStock,
          shelf:    String(data[i][COL_SHELF - 1]),
          memo:     String(data[i][COL_MEMO  - 1]),
          isLow:    stock < minStock,
          row:      i + 1  // スプレッドシートの実際の行番号（updateStock で使用）
        }
      };
    }
  }

  return { success: false, error: '部品ID「' + id + '」は登録されていません' };
}

/**
 * 部品マスタの全件を返す（在庫一覧タブ用）
 * @return {Object} { success, items: [] }
 */
function getAllItems() {
  const sheet = getSpreadsheet().getSheetByName(MASTER_SHEET_NAME);
  if (!sheet) {
    return { success: false, error: 'シート「' + MASTER_SHEET_NAME + '」が見つかりません' };
  }

  const data  = sheet.getDataRange().getValues();
  const items = [];

  for (let i = 1; i < data.length; i++) {
    const itemId = String(data[i][COL_ITEM_ID - 1]).trim();
    if (!itemId) continue; // 空行はスキップ

    const stock    = Number(data[i][COL_STOCK     - 1]);
    const minStock = Number(data[i][COL_MIN_STOCK - 1]);
    items.push({
      id:       itemId,
      name:     String(data[i][COL_ITEM_NAME - 1]),
      unit:     String(data[i][COL_UNIT      - 1]),
      stock,
      minStock,
      shelf:    String(data[i][COL_SHELF - 1]),
      memo:     String(data[i][COL_MEMO  - 1]),
      isLow:    stock < minStock
    });
  }

  return { success: true, items };
}

/**
 * 最小在庫数を下回っている部品の一覧を返す
 * @return {Object} { success, items: [] }
 */
function getLowStock() {
  const result = getAllItems();
  if (!result.success) return result;
  return {
    success: true,
    items: result.items.filter(item => item.isLow)
  };
}

/**
 * 部品マスタの在庫数を更新する
 * @param {number} row      - スプレッドシートの行番号（1始まり）
 * @param {number} newStock - 新しい在庫数
 * @return {Object} { success } | { success, error }
 */
function updateStock(row, newStock) {
  try {
    const sheet = getSpreadsheet().getSheetByName(MASTER_SHEET_NAME);
    sheet.getRange(row, COL_STOCK).setValue(newStock);
    return { success: true };
  } catch (err) {
    console.error('updateStock エラー:', err.toString());
    return { success: false, error: '在庫更新に失敗しました: ' + err.message };
  }
}

// ============================================================
// 入出庫処理
// ============================================================

/**
 * 入出庫トランザクションを実行する
 * バリデーション → 在庫更新 → 履歴記録 の順に処理する
 * @param {Object} body - { itemId, type('入庫'|'出庫'), qty, operator }
 * @return {Object} { success, message, newStock, unit, isLow } | { success, error }
 */
function processTransaction(body) {
  const { itemId, type, qty, operator } = body;

  // 入力バリデーション（セキュリティ対策）
  if (!validateItemId(itemId)) {
    return { success: false, error: '部品IDの形式が正しくありません' };
  }
  if (type !== '入庫' && type !== '出庫') {
    return { success: false, error: '種別は「入庫」または「出庫」を指定してください' };
  }
  const quantity = parseInt(qty, 10);
  if (isNaN(quantity) || quantity <= 0 || quantity > 999999) {
    return { success: false, error: '数量は 1〜999,999 の整数を入力してください' };
  }

  // 部品情報を取得
  const itemResult = getItem(itemId);
  if (!itemResult.success) return itemResult;

  const item = itemResult.item;
  let newStock;

  if (type === '入庫') {
    newStock = item.stock + quantity;
  } else {
    // 出庫時：在庫不足チェック
    if (quantity > item.stock) {
      return {
        success: false,
        error: `在庫不足です。現在庫: ${item.stock}${item.unit}、出庫要求: ${quantity}${item.unit}`
      };
    }
    newStock = item.stock - quantity;
  }

  // 在庫数を更新
  const updateResult = updateStock(item.row, newStock);
  if (!updateResult.success) return updateResult;

  // 履歴に追記
  const histResult = appendHistory({
    itemId:     item.id,
    itemName:   item.name,
    type,
    qty:        quantity,
    afterStock: newStock,
    operator:   String(operator || '不明').slice(0, 50) // 最大50文字
  });
  if (!histResult.success) return histResult;

  return {
    success:  true,
    message:  `${type}完了：${item.name}  ${quantity}${item.unit}`,
    itemName: item.name,
    newStock,
    unit:     item.unit,
    isLow:    newStock < item.minStock,
    minStock: item.minStock
  };
}

/**
 * 入出庫履歴シートに1行追記する
 * @param {Object} params - { itemId, itemName, type, qty, afterStock, operator }
 */
function appendHistory({ itemId, itemName, type, qty, afterStock, operator }) {
  try {
    const sheet = getSpreadsheet().getSheetByName(HISTORY_SHEET_NAME);
    if (!sheet) {
      return { success: false, error: 'シート「' + HISTORY_SHEET_NAME + '」が見つかりません' };
    }
    sheet.appendRow([
      new Date(),   // タイムスタンプ
      itemId,
      itemName,
      type,
      qty,
      afterStock,
      operator
    ]);
    return { success: true };
  } catch (err) {
    console.error('appendHistory エラー:', err.toString());
    return { success: false, error: '履歴の書き込みに失敗しました: ' + err.message };
  }
}

// ============================================================
// 履歴取得
// ============================================================

/**
 * 直近 HISTORY_LIMIT 件の入出庫履歴を新しい順に返す
 * @return {Object} { success, history: [] }
 */
function getHistory() {
  try {
    const sheet = getSpreadsheet().getSheetByName(HISTORY_SHEET_NAME);
    if (!sheet) {
      return { success: false, error: 'シート「' + HISTORY_SHEET_NAME + '」が見つかりません' };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return { success: true, history: [] }; // データなし
    }

    // 最終行から最大 HISTORY_LIMIT 件分の範囲を取得
    const startRow = Math.max(2, lastRow - HISTORY_LIMIT + 1);
    const numRows  = lastRow - startRow + 1;
    const data     = sheet.getRange(startRow, 1, numRows, 7).getValues();

    const history = data
      .reverse() // 新しい順（降順）に並べ替え
      .map(row => ({
        timestamp:  row[COL_H_TIMESTAMP - 1] instanceof Date
          ? Utilities.formatDate(row[COL_H_TIMESTAMP - 1], 'Asia/Tokyo', 'MM/dd HH:mm')
          : String(row[COL_H_TIMESTAMP - 1]),
        itemId:     String(row[COL_H_ITEM_ID     - 1]),
        itemName:   String(row[COL_H_ITEM_NAME   - 1]),
        type:       String(row[COL_H_TYPE        - 1]),
        qty:        Number(row[COL_H_QTY         - 1]),
        afterStock: Number(row[COL_H_AFTER_STOCK - 1]),
        operator:   String(row[COL_H_OPERATOR    - 1])
      }));

    return { success: true, history };
  } catch (err) {
    console.error('getHistory エラー:', err.toString());
    return { success: false, error: '履歴の取得に失敗しました: ' + err.message };
  }
}

// ============================================================
// 初期設定（初回のみ GASエディタから手動実行）
// ============================================================

/**
 * スプレッドシートのシートとヘッダー行を自動作成する
 * 初回セットアップ時に GAS スクリプトエディタから1度だけ実行してください
 */
function initializeSheets() {
  const ss = getSpreadsheet();

  // ── 部品マスタシートの作成 ──────────────────
  let masterSheet = ss.getSheetByName(MASTER_SHEET_NAME);
  if (!masterSheet) {
    masterSheet = ss.insertSheet(MASTER_SHEET_NAME);
  }
  if (masterSheet.getLastRow() === 0) {
    masterSheet.appendRow(['部品ID', '部品名', '単位', '現在庫数', '最小在庫数', '棚番号', '備考']);
    // サンプルデータ（P-005 は在庫不足のサンプル）
    masterSheet.appendRow(['P-001', 'ボルト M8×20',   '個', 500, 100, 'A-01', 'ステンレス製']);
    masterSheet.appendRow(['P-002', 'ナット M8',       '個', 480, 100, 'A-02', '']);
    masterSheet.appendRow(['P-003', 'ワッシャー M8',   '個', 200,  50, 'A-03', '']);
    masterSheet.appendRow(['P-004', 'ベアリング 6201', '個',  30,  20, 'B-01', '単列深溝']);
    masterSheet.appendRow(['P-005', 'Oリング P-10',    '個',  15,  30, 'B-02', '★在庫不足アラートのサンプル']);
    masterSheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#BBDEFB');
    masterSheet.setFrozenRows(1);
    masterSheet.autoResizeColumns(1, 7);
  }

  // ── 入出庫履歴シートの作成 ──────────────────
  let histSheet = ss.getSheetByName(HISTORY_SHEET_NAME);
  if (!histSheet) {
    histSheet = ss.insertSheet(HISTORY_SHEET_NAME);
  }
  if (histSheet.getLastRow() === 0) {
    histSheet.appendRow(['タイムスタンプ', '部品ID', '部品名', '種別', '数量', '処理後在庫数', '担当者']);
    histSheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#BBDEFB');
    histSheet.setFrozenRows(1);
    histSheet.autoResizeColumns(1, 7);
  }

  SpreadsheetApp.getUi().alert(
    '✅ 初期設定が完了しました！\n\n' +
    '・「部品マスタ」にサンプルデータ5件を作成しました。\n' +
    '・P-005 は在庫不足サンプル（在庫15、最小30）です。\n\n' +
    '次のステップ：\n' +
    '「デプロイ」→「新しいデプロイ」からWebアプリを公開してください。'
  );
}
