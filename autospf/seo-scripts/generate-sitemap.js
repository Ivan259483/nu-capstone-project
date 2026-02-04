import fs from "fs";
import path from "path";

const baseUrl = "https://atoms.template.com";
const distDir = "./dist";
const outFile = "./dist/sitemap.xml";
const contentDir = "./seo/content";

function collectHtmlFiles(dir, basePath = "") {
  const results = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const list = fs.readdirSync(dir);

  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);

    if (stat && stat.isDirectory()) {
      const subPath = path.join(basePath, file);
      results.push(...collectHtmlFiles(full, subPath));
    } else if (file.endsWith('.html')) {
      const relativePath = path.join(basePath, file).replace(/\\/g, '/');
      let url = `${baseUrl}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;

      // If it's index.html, remove filename and keep directory path (ending with /)
      if (file === 'index.html') {
        url = url.replace(/\/index\.html$/, '/');
      }

      let lastmod = stat.mtime.toISOString();

      // Use markdown file's mtime for blog posts (HTML is regenerated each build)
      if (basePath.includes('/blog') && file !== 'index.html') {
        const pathParts = relativePath.split('/');
        const slug = pathParts[pathParts.length - 1].replace('.html', '');
        const mdPath = path.join(contentDir, `${slug}.md`);
        
        if (fs.existsSync(mdPath)) {
          const mdStat = fs.statSync(mdPath);
          lastmod = mdStat.mtime.toISOString();
        }
      }

      results.push({ url, lastmod });
    }
  });

  return results;
}

function generateSitemap() {
  const pages = collectHtmlFiles(distDir);

  if (pages.length === 0) {
    console.log('No HTML files found to generate sitemap');
    return;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(page => `  <url>
    <loc>${page.url}</loc>
    <lastmod>${page.lastmod}</lastmod>
  </url>`).join('\n')}
</urlset>`;

  // Ensure dist directory exists
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  fs.writeFileSync(outFile, xml);
  console.log(`✓ Sitemap generated: ${outFile} (${pages.length} pages)`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    generateSitemap();
  } catch (error) {
    console.error('Error generating sitemap:', error);
    process.exit(1);
  }
}

export { generateSitemap };