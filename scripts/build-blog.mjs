import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const siteUrl = (process.env.SITE_URL || 'https://credesiaworks.pages.dev').replace(/\/$/, '');
const postsDir = join(process.cwd(), 'posts');
const blogDir = join(process.cwd(), 'blog');

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

function renderIndex(posts) {
  const cards = posts.map((post) => `
    <article class="post-card">
      <a href="/blog/${post.slug}/">
        ${post.image ? `<img src="${escapeHtml(post.image)}" alt="" loading="lazy" class="post-card-image">` : ''}
        <div class="post-card-body">
          <div class="post-meta"><time datetime="${escapeHtml(post.date)}">${escapeHtml(post.date)}</time><span>${escapeHtml(post.category)}</span></div>
          <h2>${escapeHtml(post.title)}</h2>
          <p>${escapeHtml(post.description)}</p>
        </div>
      </a>
    </article>`).join('\n');

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
    <section class="post-list" aria-label="ブログ記事一覧">
      ${cards}
    </section>
  </main>`
  });
}

function renderPost(post, posts) {
  const related = posts
    .filter((item) => item.slug !== post.slug)
    .slice(0, 2)
    .map((item) => `<li><a href="/blog/${item.slug}/">${escapeHtml(item.title)}</a></li>`)
    .join('');

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
        <div class="post-meta"><time datetime="${escapeHtml(post.date)}">${escapeHtml(post.date)}</time><span>${escapeHtml(post.category)}</span></div>
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

function writeSitemap(posts) {
  const urls = [
    { loc: `${siteUrl}/`, priority: '1.0' },
    { loc: `${siteUrl}/machlog.html`, priority: '0.6' },
    { loc: `${siteUrl}/blog/`, priority: '0.8' },
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
rmSync(blogDir, { recursive: true, force: true });
mkdirSync(blogDir, { recursive: true });

writeFileSync(join(blogDir, 'index.html'), renderIndex(posts));
for (const post of posts) {
  const postDir = join(blogDir, post.slug);
  mkdirSync(postDir, { recursive: true });
  writeFileSync(join(postDir, 'index.html'), renderPost(post, posts));
}

writeSitemap(posts);
console.log(`Generated ${posts.length} blog posts.`);
