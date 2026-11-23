import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from './App';
import { site } from './config';
import { FAQ } from './content';
import { industryPage } from './industries';
import { DESCRIPTION, LONG_DESCRIPTION, TITLE } from './meta';
import { isIndustry, PAGES, type SitePage } from './pages';

export { renderLlmsTxt } from './llms';
export { PAGES };
export const siteUrl = site.url;

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A page, rendered once at build time and hydrated in the browser. */
export function render(page: SitePage = PAGES[0]!): string {
  return renderToString(
    <StrictMode>
      <App page={page.id} />
    </StrictMode>,
  );
}

/** Title and meta description of a page (search results show about 155 characters of it). */
export function pageMeta(page: SitePage): { title: string; description: string } {
  if (!isIndustry(page.id)) return { title: TITLE, description: DESCRIPTION };
  const industry = industryPage(page.id);
  return { title: `${industry.title} — ${site.productName}`, description: industry.description };
}

/** Title, description, link previews and structured data (absolute URLs only with VITE_SITE_URL). */
export function renderHead(page: SitePage = PAGES[0]!): string {
  const { title, description } = pageMeta(page);
  const url = site.url ? `${site.url}${page.path === '/' ? '/' : page.path}` : '';
  const tags = [
    `<title>${escape(title)}</title>`,
    `<meta name="description" content="${escape(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escape(site.productName)}" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta property="og:title" content="${escape(title)}" />`,
    `<meta property="og:description" content="${escape(description)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ];
  if (url) {
    tags.push(
      `<link rel="canonical" href="${escape(url)}" />`,
      `<meta property="og:url" content="${escape(url)}" />`,
      `<meta property="og:image" content="${escape(site.url)}/site/og.png" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta property="og:image:alt" content="${escape(TITLE)}" />`,
    );
  }
  tags.push(
    `<script type="application/ld+json">${JSON.stringify(structuredData(page, url, title, description)).replace(/</g, '\\u003c')}</script>`,
  );
  return tags.join('\n    ');
}

function faqPage(items: readonly { question: string; answer: string }[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

function structuredData(page: SitePage, url: string, title: string, description: string) {
  const home = site.url ? `${site.url}/` : '';
  const id = (name: string) => (home ? { '@id': `${home}#${name}` } : {});
  // The company behind the product (D-103), with its logo and public profiles. Needs the public
  // address (absolute URLs) and VITE_SITE_COMPANY_NAME.
  const organization =
    home && site.companyName
      ? {
          '@type': 'Organization',
          ...id('organization'),
          name: site.companyName,
          url: home,
          logo: `${site.url}/site/logo.png`,
          ...(site.socialLinks.length ? { sameAs: site.socialLinks } : {}),
        }
      : null;
  const publisher = organization ? { publisher: id('organization') } : {};
  const graph: object[] = [
    ...(organization ? [organization] : []),
    // Lets search engines show the product name as the site name in results.
    {
      '@type': 'WebSite',
      ...id('website'),
      name: site.productName,
      ...(home ? { url: home } : {}),
      ...publisher,
    },
    {
      '@type': 'SoftwareApplication',
      ...id('product'),
      name: site.productName,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: LONG_DESCRIPTION,
      ...(home ? { url: home, image: `${site.url}/site/og.png` } : {}),
      ...publisher,
    },
  ];

  if (!isIndustry(page.id)) {
    graph.push(faqPage(FAQ));
    return { '@context': 'https://schema.org', '@graph': graph };
  }

  const industry = industryPage(page.id);
  graph.push(
    {
      '@type': 'WebPage',
      name: title,
      description,
      ...(url ? { url } : {}),
      ...(home ? { isPartOf: id('website'), about: id('product') } : {}),
      ...publisher,
    },
    ...(home
      ? [
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: home },
              { '@type': 'ListItem', position: 2, name: industry.name, item: url },
            ],
          },
        ]
      : []),
    faqPage(industry.faq),
  );
  return { '@context': 'https://schema.org', '@graph': graph };
}
