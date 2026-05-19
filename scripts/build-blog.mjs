import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const siteUrl = (process.env.SITE_URL || 'https://credesia.net').replace(/\/$/, '');
const postsDir = join(process.cwd(), 'posts');
const blogDir = join(process.cwd(), 'blog');

const categoryDefinitions = [
  {
    name: 'Excel管理',
    slug: 'excel',
    description: 'Excel管理表、集計、転記、確認作業など、日々の表計算まわりを扱いやすくするための実務メモです。'
  },
  {
    name: '業務改善',
    slug: 'business-improvement',
    description: '小さな手作業、確認漏れ、属人化、引き継ぎなど、仕事の流れを少しずつ見直すための実務メモです。'
  },
  {
    name: '商品ページ改善',
    slug: 'product-page',
    description: '商品画像、説明文、売り場づくりなど、買う前の不安を減らし、商品の良さを伝えるための実務メモです。'
  },
  {
    name: '情報発信',
    slug: 'information',
    description: 'ホームページ、SNS、社内用語、伝え方など、お客様に伝わる情報発信を考えるための実務メモです。'
  },
  {
    name: '製造業',
    slug: 'manufacturing',
    description: '機械、交換記録、現場の管理、製造業まわりの小さな見直しについての実務メモです。'
  },
  {
    name: 'EC改善',
    slug: 'ec',
    description: 'ECページ、商品説明、画像、購入前の不安など、ネット販売の見せ方を考える実務メモです。'
  },
  {
    name: 'ふるさと納税',
    slug: 'furusato',
    description: '返礼品画像、農産物、地域商品の伝え方など、ふるさと納税ページを考える実務メモです。'
  }
];

const categoryByName = new Map(categoryDefinitions.map((category) => [category.name, category]));

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function parseFrontMatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error('Front matter is required.');

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!item) continue;
    const [, key, rawValue] = item;
    const value = rawValue.trim().replace(/^["']|["']$/g, '');
    data[key] = value === 'true' ? true : value === 'false' ? false : value;
  }

  return { data, body: match[2].trim() };
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let listOpen = false;
  let codeBlock = null;

  const inline = (text) => escapeHtml(text)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!listOpen) return;
    html.push('</ul>');
    listOpen = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (codeBlock) {
        html.push(`<pre><code>${escapeHtml(codeBlock.join('\n'))}</code></pre>`);
        codeBlock = null;
      } else {
        flushParagraph();
        closeList();
        codeBlock = [];
      }
      continue;
    }

    if (codeBlock) {
      codeBlock.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }

    if (trimmed.startsWith('### ')) {
      flushParagraph();
      closeList();
      html.push(`<h3>${inline(trimmed.slice(4))}</h3>`);
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flushParagraph();
      closeList();
      html.push(`<h2>${inline(trimmed.slice(3))}</h2>`);
      continue;
    }

    if (trimmed.startsWith('- ')) {
      flushParagraph();
      if (!listOpen) {
        html.push('<ul>');
        listOpen = true;
      }
      html.push(`<li>${inline(trimmed.slice(2))}</li>`);
      continue;
    }

    if (trimmed.startsWith('![')) {
      flushParagraph();
      closeList();
      html.push(inline(trimmed));
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  closeList();
  if (codeBlock) {
    html.push(`<pre><code>${escapeHtml(codeBlock.join('\n'))}</code></pre>`);
  }
  return html.join('\n');
}

function readPosts() {
  return readdirSync(postsDir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      const source = readFileSync(join(postsDir, file), 'utf8');
      const { data, body } = parseFrontMatter(source);
      const slug = data.slug || basename(file, '.md');
      const required = ['title', 'description', 'date', 'category', 'published'];
      for (const key of required) {
        if (data[key] === undefined || data[key] === '') {
          throw new Error(`${file}: "${key}" is required.`);
        }
      }
      return { ...data, slug, body, html: markdownToHtml(body) };
    })
    .filter((post) => post.published === true || post.published === 'true')
    .sort((a, b) => {
      const byDate = String(b.date).localeCompare(String(a.date));
      return byDate || String(b.slug).localeCompare(String(a.slug));
    });
}

function imageUrl(post) {
  if (!post.image) return `${siteUrl}/22_36_05.png`;
  if (String(post.image).startsWith('http')) return post.image;
  return `${siteUrl}${post.image}`;
}

function categoryUrl(categoryName) {
  const category = categoryByName.get(categoryName);
  return category ? `/blog/category/${category.slug}/` : '';
}

function postsByCategory(posts) {
  return categoryDefinitions
    .map((category) => ({
      ...category,
      posts: posts.filter((post) => post.category === category.name)
    }))
    .filter((category) => category.posts.length > 0);
}

function renderCategoryNav(categories, currentSlug = '') {
  if (!categories.length) return '';
  const links = categories.map((category) => `
        <a href="/blog/category/${category.slug}/" class="${category.slug === currentSlug ? 'is-current' : ''}">${escapeHtml(category.name)}</a>`).join('');
  return `<nav class="category-nav" aria-label="カテゴリ">
      <span>カテゴリ</span>
      <div>
        ${links}
      </div>
    </nav>`;
}

function renderPostCards(posts) {
  return posts.map((post) => {
    const categoryHref = categoryUrl(post.category);
    const categoryLabel = categoryHref
      ? `<a href="${categoryHref}" class="post-category">${escapeHtml(post.category)}</a>`
      : `<span>${escapeHtml(post.category)}</span>`;

    return `
    <article class="post-card">
      ${post.image ? `<a href="/blog/${post.slug}/" class="post-image-link" aria-label="${escapeHtml(post.title)}"><img src="${escapeHtml(post.image)}" alt="" loading="lazy" class="post-card-image"></a>` : ''}
      <div class="post-card-body">
        <div class="post-meta"><time datetime="${escapeHtml(post.date)}">${escapeHtml(post.date)}</time>${categoryLabel}</div>
        <h2><a href="/blog/${post.slug}/" class="post-title-link">${escapeHtml(post.title)}</a></h2>
        <p>${escapeHtml(post.description)}</p>
      </div>
    </article>`;
  }).join('\n');
}

function pageShell({ title, description, canonical, type = 'website', image, body }) {
  const fullTitle = `${title} | クレデシアワークス`;
  const ogImage = image || `${siteUrl}/22_36_05.png`;
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="${type}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:title" content="${escapeHtml(fullTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:locale" content="ja_JP">
  <meta property="og:site_name" content="クレデシアワークス">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(fullTitle)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${ogImage}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700;900&family=Rajdhani:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles/blog.css">
</head>
<body>
  <header class="site-header">
    <a href="/" class="nav-logo">クレデシアワークス<span>Credesia Works</span></a>
    <nav class="site-nav" aria-label="主要ナビゲーション">
      <a href="/">トップ</a>
      <a href="/blog/">ブログ</a>
    </nav>
  </header>
  ${body}
  <footer class="site-footer">
    <div>
      <strong>クレデシアワークス</strong>
      <span>商品ページ・Excel管理・小さな業務改善</span>
    </div>
    <p>© 2025 クレデシアワークス. All rights reserved.</p>
  </footer>
</body>
</html>
`;
}

function renderIndex(posts, categories) {
  const cards = renderPostCards(posts);
  return pageShell({
    title: '実務メモ',
    description: '中小企業の業務改善、Excel管理、連絡と進捗管理の小さな気づきをまとめるクレデシアワークスのブログです。',
    canonical: `${siteUrl}/blog/`,
    body: `<main>
    <section class="blog-hero">
      <p class="eyebrow">WORK NOTE</p>
      <h1>現場の小さな見直しを、実務メモとして残します。</h1>
      <p>売り込みよりも、日々の管理表、連絡、確認作業を少し楽にするための気づきを中心にまとめています。</p>
    </section>
    ${renderCategoryNav(categories)}
    <section class="post-list" aria-label="ブログ記事一覧">
      ${cards}
    </section>
  </main>`
  });
}

function renderCategoryPage(category, categories) {
  const cards = renderPostCards(category.posts);
  return pageShell({
    title: `${category.name}の実務メモ`,
    description: category.description,
    canonical: `${siteUrl}/blog/category/${category.slug}/`,
    body: `<main>
    <article class="article category-page">
      <a href="/blog/" class="back-link">ブログ一覧へ</a>
      <header class="article-header">
        <p class="eyebrow">CATEGORY</p>
        <h1>${escapeHtml(category.name)}</h1>
        <p>${escapeHtml(category.description)}</p>
      </header>
      ${renderCategoryNav(categories, category.slug)}
      <section class="post-list" aria-label="${escapeHtml(category.name)}の記事一覧">
        ${cards}
      </section>
    </article>
  </main>`
  });
}

function renderPost(post, posts) {
  const related = posts
    .filter((item) => item.slug !== post.slug)
    .slice(0, 2)
    .map((item) => `<li><a href="/blog/${item.slug}/">${escapeHtml(item.title)}</a></li>`)
    .join('');

  const categoryHref = categoryUrl(post.category);
  const categoryLabel = categoryHref
    ? `<a href="${categoryHref}" class="post-category">${escapeHtml(post.category)}</a>`
    : `<span>${escapeHtml(post.category)}</span>`;

  return pageShell({
    title: post.title,
    description: post.description,
    canonical: `${siteUrl}/blog/${post.slug}/`,
    type: 'article',
    image: imageUrl(post),
    body: `<main>
    <article class="article">
      <a href="/blog/" class="back-link">ブログ一覧へ</a>
      <header class="article-header">
        <div class="post-meta"><time datetime="${escapeHtml(post.date)}">${escapeHtml(post.date)}</time>${categoryLabel}</div>
        <h1>${escapeHtml(post.title)}</h1>
        <p>${escapeHtml(post.description)}</p>
      </header>
      ${post.image ? `<img src="${escapeHtml(post.image)}" alt="" loading="lazy" class="article-cover">` : ''}
      <div class="article-body">
        ${post.html}
      </div>
      <nav class="related" aria-label="関連記事">
        <h2>ほかの実務メモ</h2>
        <ul>${related}</ul>
      </nav>
    </article>
  </main>`
  });
}

function writeSitemap(posts, categories) {
  const urls = [
    { loc: `${siteUrl}/`, priority: '1.0' },
    { loc: `${siteUrl}/machlog.html`, priority: '0.6' },
    { loc: `${siteUrl}/blog/`, priority: '0.8' },
    ...categories.map((category) => ({ loc: `${siteUrl}/blog/category/${category.slug}/`, priority: '0.7' })),
    ...posts.map((post) => ({ loc: `${siteUrl}/blog/${post.slug}/`, priority: '0.7', lastmod: post.date }))
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url>
    <loc>${url.loc}</loc>
    ${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : '<lastmod>2026-05-13</lastmod>'}
    <changefreq>monthly</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

  writeFileSync(join(process.cwd(), 'sitemap.xml'), xml);
}

const posts = readPosts();
const categories = postsByCategory(posts);
rmSync(blogDir, { recursive: true, force: true });
mkdirSync(blogDir, { recursive: true });

writeFileSync(join(blogDir, 'index.html'), renderIndex(posts, categories));
for (const category of categories) {
  const categoryDir = join(blogDir, 'category', category.slug);
  mkdirSync(categoryDir, { recursive: true });
  writeFileSync(join(categoryDir, 'index.html'), renderCategoryPage(category, categories));
}
for (const post of posts) {
  const postDir = join(blogDir, post.slug);
  mkdirSync(postDir, { recursive: true });
  writeFileSync(join(postDir, 'index.html'), renderPost(post, posts));
}

writeSitemap(posts, categories);
console.log(`Generated ${posts.length} blog posts and ${categories.length} category pages.`);
