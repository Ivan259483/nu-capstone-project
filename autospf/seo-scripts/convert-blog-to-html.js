import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { marked } from "./marked.esm.js";

// Get project root directory (parent directory of seo-scripts)
const currentFile = fileURLToPath(import.meta.url);
const __dirname = path.dirname(currentFile);
const projectRoot = path.resolve(__dirname, '..');

// Base URL of the website (should match the actual domain)
const baseUrl = "https://atoms.template.com";

// GA4 Measurement ID - set via site.config.json
// Format: "G-XXXXXXXXXX" or empty string if not needed
let GA4_MEASUREMENT_ID = "";

// Source markdown files directory
// First look for ./seo/content in the project, if not found, look for ../seo/content at the same level
const localBlogDir = path.resolve(projectRoot, 'seo', 'content');
const siblingBlogDir = path.resolve(projectRoot, '..', 'seo', 'content');
const blogDir = fs.existsSync(localBlogDir) ? localBlogDir : siblingBlogDir;
const distBlogDir = path.resolve(projectRoot, 'dist', 'blog');

function getHtmlTemplate(title, content, datePublished, dateModified, meta = {}) {
  const tags = meta.tags || [];
  const keywords = meta.keywords || tags.join(', ');
  const description = meta.description || title;
  const isoDatePublished = datePublished ? new Date(datePublished).toISOString() : '';
  const isoDateModified = dateModified ? new Date(dateModified).toISOString() : '';
  const displayDate = datePublished || dateModified;
  const isoDate = displayDate ? new Date(displayDate).toISOString() : '';
  const toc = meta.toc || '';
  const slug = meta.slug || '';
  const lang = meta.lang || 'en';

  const ogLocaleMap = {
    'zh': 'zh_CN',
    'zh-CN': 'zh_CN',
    'en': 'en_US',
    'ja': 'ja_JP',
    'ko': 'ko_KR',
    'fr': 'fr_FR',
    'de': 'de_DE',
    'es': 'es_ES',
    'pt': 'pt_PT',
    'ru': 'ru_RU',
    'ar': 'ar_AR',
    'hi': 'hi_IN',
  };

  const ogLocale = ogLocaleMap[lang] || 'en_US';
  const canonicalUrl = `${baseUrl}/blog/${slug}`;

  // Schema.org structured data for blog post
  const schemaData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": title,
    "description": description,
    "datePublished": isoDatePublished,
    "dateModified": isoDateModified,
    "author": {
      "@type": "Organization",
      "name": "AutoSPF+ Team"
    },
    "publisher": {
      "@type": "Organization",
      "name": "AutoSPF+",
      "logo": {
        "@type": "ImageObject",
        "url": `${baseUrl}/logo.png`
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": canonicalUrl
    }
  };

  if (meta.image) {
    schemaData.image = `${baseUrl}${meta.image}`;
  }

  if (tags.length > 0) {
    schemaData.keywords = tags.join(', ');
  }

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="keywords" content="${keywords}">
  <link rel="canonical" href="${canonicalUrl}">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="article">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:locale" content="${ogLocale}">
  ${meta.image ? `<meta property="og:image" content="${baseUrl}${meta.image}">` : ''}
  ${isoDatePublished ? `<meta property="article:published_time" content="${isoDatePublished}">` : ''}
  ${isoDateModified ? `<meta property="article:modified_time" content="${isoDateModified}">` : ''}
  ${tags.map(tag => `<meta property="article:tag" content="${tag}">`).join('\n  ')}
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${canonicalUrl}">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  ${meta.image ? `<meta name="twitter:image" content="${baseUrl}${meta.image}">` : ''}
  
  <!-- Schema.org structured data -->
  <script type="application/ld+json">
${JSON.stringify(schemaData, null, 2)}
  </script>
  
  ${GA4_MEASUREMENT_ID ? `<!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${GA4_MEASUREMENT_ID}');
  </script>` : ''}
  
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f9fafb;
    }
    
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 60px 20px;
      text-align: center;
      margin-bottom: 40px;
      border-radius: 0 0 20px 20px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    
    header h1 {
      font-size: 2.5rem;
      margin-bottom: 15px;
      font-weight: 700;
    }
    
    .meta-info {
      font-size: 0.9rem;
      opacity: 0.95;
      display: flex;
      justify-content: center;
      gap: 20px;
      flex-wrap: wrap;
      margin-top: 15px;
    }
    
    .meta-info span {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    
    .tags {
      display: flex;
      gap: 8px;
      justify-content: center;
      flex-wrap: wrap;
      margin-top: 15px;
    }
    
    .tag {
      background: rgba(255,255,255,0.2);
      padding: 5px 12px;
      border-radius: 15px;
      font-size: 0.85rem;
      backdrop-filter: blur(10px);
    }
    
    .toc {
      background: white;
      padding: 25px;
      border-radius: 10px;
      margin-bottom: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      border-left: 4px solid #667eea;
    }
    
    .toc h2 {
      color: #667eea;
      margin-bottom: 15px;
      font-size: 1.3rem;
    }
    
    .toc ul {
      list-style: none;
      padding-left: 0;
    }
    
    .toc li {
      margin: 8px 0;
      padding-left: 20px;
      position: relative;
    }
    
    .toc li:before {
      content: "→";
      position: absolute;
      left: 0;
      color: #667eea;
    }
    
    .toc a {
      color: #4a5568;
      text-decoration: none;
      transition: color 0.2s;
    }
    
    .toc a:hover {
      color: #667eea;
    }
    
    article {
      background: white;
      padding: 40px;
      border-radius: 10px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 30px;
    }
    
    article h1, article h2, article h3, article h4, article h5, article h6 {
      color: #2d3748;
      margin-top: 30px;
      margin-bottom: 15px;
      font-weight: 600;
    }
    
    article h1 { font-size: 2rem; border-bottom: 2px solid #667eea; padding-bottom: 10px; }
    article h2 { font-size: 1.7rem; }
    article h3 { font-size: 1.4rem; }
    article h4 { font-size: 1.2rem; }
    
    article p {
      margin-bottom: 20px;
      color: #4a5568;
      font-size: 1.05rem;
    }
    
    article a {
      color: #667eea;
      text-decoration: none;
      border-bottom: 1px solid transparent;
      transition: border-color 0.2s;
    }
    
    article a:hover {
      border-bottom-color: #667eea;
    }
    
    article ul, article ol {
      margin-bottom: 20px;
      padding-left: 30px;
      color: #4a5568;
    }
    
    article li {
      margin-bottom: 8px;
    }
    
    article blockquote {
      border-left: 4px solid #667eea;
      padding-left: 20px;
      margin: 20px 0;
      color: #718096;
      font-style: italic;
      background: #f7fafc;
      padding: 15px 20px;
      border-radius: 0 5px 5px 0;
    }
    
    article pre {
      background: #2d3748;
      color: #e2e8f0;
      padding: 20px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 20px 0;
      font-size: 0.9rem;
      line-height: 1.5;
    }
    
    article code {
      background: #edf2f7;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
      color: #e53e3e;
    }
    
    article pre code {
      background: transparent;
      padding: 0;
      color: #e2e8f0;
    }
    
    article img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 20px 0;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    
    article table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    article th, article td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
    }
    
    article th {
      background: #667eea;
      color: white;
      font-weight: 600;
    }
    
    article tr:hover {
      background: #f7fafc;
    }
    
    .back-link {
      display: inline-block;
      margin-top: 30px;
      padding: 12px 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      border-radius: 8px;
      transition: transform 0.2s, box-shadow 0.2s;
      font-weight: 500;
    }
    
    .back-link:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    
    footer {
      text-align: center;
      padding: 40px 20px;
      color: #718096;
      border-top: 1px solid #e2e8f0;
      margin-top: 60px;
    }
    
    @media (max-width: 768px) {
      header h1 {
        font-size: 1.8rem;
      }
      
      article {
        padding: 25px;
      }
      
      .container {
        padding: 15px;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <h1>${title}</h1>
      ${displayDate || tags.length > 0 ? `
      <div class="meta-info">
        ${displayDate ? `<span>📅 ${new Date(displayDate).toLocaleDateString(lang === 'zh' || lang === 'zh-CN' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>` : ''}
      </div>` : ''}
      ${tags.length > 0 ? `
      <div class="tags">
        ${tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
      </div>` : ''}
    </div>
  </header>
  
  <div class="container">
    ${toc ? `
    <div class="toc">
      <h2>📑 Table of Contents</h2>
      ${toc}
    </div>` : ''}
    
    <article>
      ${content}
    </article>
    
    <a href="/blog" class="back-link">← Back to Blog</a>
  </div>
  
  <footer>
    <div class="container">
      <p>&copy; ${new Date().getFullYear()} AutoSPF+. All rights reserved.</p>
    </div>
  </footer>
</body>
</html>`;
}

function extractMetadata(content) {
  const metadata = {};
  const metaRegex = /^---\s*\n([\s\S]*?)\n---/;
  const match = content.match(metaRegex);

  if (match) {
    const metaContent = match[1];
    const lines = metaContent.split('\n');

    lines.forEach(line => {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length > 0) {
        const value = valueParts.join(':').trim();
        const cleanKey = key.trim();

        if (cleanKey === 'tags') {
          metadata.tags = value
            .replace(/[\[\]]/g, '')
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag);
        } else if (cleanKey === 'keywords') {
          metadata.keywords = value;
        } else {
          metadata[cleanKey] = value;
        }
      }
    });

    // Remove metadata block from content
    content = content.replace(metaRegex, '').trim();
  }

  return { metadata, content };
}

function generateTableOfContents(content) {
  const headings = [];
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');

    headings.push({ level, text, id });
  }

  if (headings.length === 0) return '';

  let tocHtml = '<ul>';
  let currentLevel = 0;

  headings.forEach((heading, index) => {
    if (heading.level > currentLevel) {
      tocHtml += '<ul>'.repeat(heading.level - currentLevel);
    } else if (heading.level < currentLevel) {
      tocHtml += '</ul>'.repeat(currentLevel - heading.level);
    }

    tocHtml += `<li><a href="#${heading.id}">${heading.text}</a></li>`;
    currentLevel = heading.level;
  });

  tocHtml += '</ul>'.repeat(currentLevel);

  // Add IDs to headings in the content
  content = content.replace(headingRegex, (match, hashes, text) => {
    const id = text.trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    return `${hashes} ${text} {#${id}}`;
  });

  return tocHtml;
}

function convertMarkdownToHtml(markdownContent) {
  // Extract metadata
  const { metadata, content } = extractMetadata(markdownContent);

  // Generate table of contents
  const toc = generateTableOfContents(content);

  // Convert markdown to HTML
  const htmlContent = marked(content);

  // Get dates
  const datePublished = metadata.date || metadata.datePublished || null;
  const dateModified = metadata.dateModified || metadata.updated || null;

  // Create full HTML page
  const fullHtml = getHtmlTemplate(
    metadata.title || 'Untitled',
    htmlContent,
    datePublished,
    dateModified,
    { ...metadata, toc }
  );

  return fullHtml;
}

export function main(siteConfig = {}) {
  // Load GA4 ID from config
  if (siteConfig.ga4MeasurementId) {
    GA4_MEASUREMENT_ID = siteConfig.ga4MeasurementId;
  }

  if (!fs.existsSync(blogDir)) {
    console.log(`Blog source directory not found: ${blogDir}`);
    return;
  }

  // Create dist/blog directory if it doesn't exist
  if (!fs.existsSync(distBlogDir)) {
    fs.mkdirSync(distBlogDir, { recursive: true });
  }

  // Read all markdown files
  const files = fs.readdirSync(blogDir).filter(file => file.endsWith('.md'));

  if (files.length === 0) {
    console.log('No markdown files found in blog directory');
    return;
  }

  console.log(`Converting ${files.length} blog posts...`);

  // Convert each markdown file to HTML
  files.forEach(file => {
    const markdownPath = path.join(blogDir, file);
    const markdownContent = fs.readFileSync(markdownPath, 'utf-8');

    const html = convertMarkdownToHtml(markdownContent);

    // Create output filename (replace .md with .html)
    const outputFile = file.replace('.md', '.html');
    const outputPath = path.join(distBlogDir, outputFile);

    fs.writeFileSync(outputPath, html);
    console.log(`✓ Generated: ${outputFile}`);
  });

  // Generate blog index page
  generateBlogIndex(files);

  console.log('✓ Blog conversion complete!');
}

function generateBlogIndex(files) {
  const posts = files.map(file => {
    const markdownPath = path.join(blogDir, file);
    const markdownContent = fs.readFileSync(markdownPath, 'utf-8');
    const { metadata } = extractMetadata(markdownContent);

    return {
      title: metadata.title || 'Untitled',
      slug: file.replace('.md', ''),
      date: metadata.date || metadata.datePublished || new Date().toISOString(),
      description: metadata.description || '',
      tags: metadata.tags || [],
      image: metadata.image || ''
    };
  });

  // Sort by date (newest first)
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blog - AutoSPF+</title>
  <meta name="description" content="Automotive service tips, guides, and industry insights from AutoSPF+">
  <link rel="canonical" href="${baseUrl}/blog">
  
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f9fafb;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 80px 20px;
      text-align: center;
      margin-bottom: 60px;
      border-radius: 0 0 20px 20px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    
    header h1 {
      font-size: 3rem;
      margin-bottom: 15px;
      font-weight: 700;
    }
    
    header p {
      font-size: 1.2rem;
      opacity: 0.95;
    }
    
    .posts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 30px;
      margin-bottom: 60px;
    }
    
    .post-card {
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      transition: transform 0.3s, box-shadow 0.3s;
      display: flex;
      flex-direction: column;
    }
    
    .post-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
    }
    
    .post-image {
      width: 100%;
      height: 200px;
      object-fit: cover;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    
    .post-content {
      padding: 25px;
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    
    .post-date {
      color: #667eea;
      font-size: 0.9rem;
      margin-bottom: 10px;
      font-weight: 500;
    }
    
    .post-title {
      font-size: 1.5rem;
      margin-bottom: 12px;
      color: #2d3748;
      font-weight: 600;
    }
    
    .post-title a {
      color: inherit;
      text-decoration: none;
    }
    
    .post-title a:hover {
      color: #667eea;
    }
    
    .post-description {
      color: #4a5568;
      margin-bottom: 15px;
      flex: 1;
      line-height: 1.6;
    }
    
    .post-tags {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: auto;
    }
    
    .post-tag {
      background: #edf2f7;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 0.85rem;
      color: #667eea;
    }
    
    .read-more {
      display: inline-block;
      margin-top: 15px;
      color: #667eea;
      text-decoration: none;
      font-weight: 500;
      transition: color 0.2s;
    }
    
    .read-more:hover {
      color: #764ba2;
    }
    
    footer {
      text-align: center;
      padding: 40px 20px;
      color: #718096;
      border-top: 1px solid #e2e8f0;
    }
    
    @media (max-width: 768px) {
      header h1 {
        font-size: 2rem;
      }
      
      .posts-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <h1>📝 AutoSPF+ Blog</h1>
      <p>Automotive service tips, guides, and industry insights</p>
    </div>
  </header>
  
  <div class="container">
    <div class="posts-grid">
      ${posts.map(post => `
      <article class="post-card">
        ${post.image ? `<img src="${post.image}" alt="${post.title}" class="post-image">` : '<div class="post-image"></div>'}
        <div class="post-content">
          <div class="post-date">📅 ${new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          <h2 class="post-title">
            <a href="/blog/${post.slug}.html">${post.title}</a>
          </h2>
          <p class="post-description">${post.description}</p>
          ${post.tags.length > 0 ? `
          <div class="post-tags">
            ${post.tags.map(tag => `<span class="post-tag">${tag}</span>`).join('')}
          </div>` : ''}
          <a href="/blog/${post.slug}.html" class="read-more">Read More →</a>
        </div>
      </article>
      `).join('')}
    </div>
  </div>
  
  <footer>
    <div class="container">
      <p>&copy; ${new Date().getFullYear()} AutoSPF+. All rights reserved.</p>
    </div>
  </footer>
</body>
</html>`;

  const indexPath = path.join(distBlogDir, 'index.html');
  fs.writeFileSync(indexPath, indexHtml);
  console.log('✓ Generated: blog index');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}