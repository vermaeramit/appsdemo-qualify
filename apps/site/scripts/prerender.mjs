// Pre-renders the website to static HTML (D-101): fast first paint, and search engines and link
// previews read the full page without running JavaScript. Run after the client and SSR builds.
// Every page in PAGES becomes <path>/index.html (D-104), which Caddy serves at the clean path.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const ssrDir = path.join(root, 'dist-ssr');
const { PAGES, render, renderHead, renderLlmsTxt, siteUrl } = await import(
  pathToFileURL(path.join(ssrDir, 'entry-server.js')).href
);

const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
if (!template.includes('<!--app-->') || !template.includes('<!--head-->')) {
  throw new Error('dist/index.html has no <!--app--> or <!--head--> placeholder');
}
for (const page of PAGES) {
  const html = template
    .replace('<!--head-->', renderHead(page))
    .replace('<!--app-->', render(page));
  const dir = path.join(dist, page.path);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  console.log(`Pre-rendered ${page.path} (${Math.round(html.length / 1024)} KB)`);
}
// The same content as plain Markdown for AI assistants (llmstxt.org, D-103).
fs.writeFileSync(path.join(dist, 'llms.txt'), renderLlmsTxt());

// A sitemap needs the public address; without VITE_SITE_URL (local builds) it is left out.
if (siteUrl) {
  // lastmod = build date, so search engines know when the pages changed.
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = PAGES.map(
    (page) =>
      `  <url><loc>${siteUrl}${page.path === '/' ? '/' : page.path}</loc><lastmod>${lastmod}</lastmod></url>`,
  );
  fs.writeFileSync(
    path.join(dist, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
  );
  fs.appendFileSync(path.join(dist, 'robots.txt'), `Sitemap: ${siteUrl}/sitemap.xml\n`);
}
fs.rmSync(ssrDir, { recursive: true, force: true });
