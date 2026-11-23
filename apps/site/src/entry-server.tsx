import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from './App';
import { site } from './config';
import { FAQ } from './content';
import { DESCRIPTION, LONG_DESCRIPTION, TITLE } from './meta';

export { renderLlmsTxt } from './llms';
export const siteUrl = site.url;

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The page, rendered once at build time and hydrated in the browser. */
export function render(): string {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

/** Title, description, link previews and structured data (absolute URLs only with VITE_SITE_URL). */
export function renderHead(): string {
  const tags = [
    `<title>${escape(TITLE)}</title>`,
    `<meta name="description" content="${escape(DESCRIPTION)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escape(site.productName)}" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta property="og:title" content="${escape(TITLE)}" />`,
    `<meta property="og:description" content="${escape(DESCRIPTION)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ];
  if (site.url) {
    tags.push(
      `<link rel="canonical" href="${escape(site.url)}/" />`,
      `<meta property="og:url" content="${escape(site.url)}/" />`,
      `<meta property="og:image" content="${escape(site.url)}/site/og.png" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta property="og:image:alt" content="${escape(TITLE)}" />`,
    );
  }
  // The company behind the product (D-103), with its logo and public profiles. Needs the public
  // address (absolute URLs) and VITE_SITE_COMPANY_NAME.
  const organization =
    site.url && site.companyName
      ? {
          '@type': 'Organization',
          '@id': `${site.url}/#organization`,
          name: site.companyName,
          url: `${site.url}/`,
          logo: `${site.url}/site/logo.png`,
          ...(site.socialLinks.length ? { sameAs: site.socialLinks } : {}),
        }
      : null;
  const publisher = organization ? { publisher: { '@id': organization['@id'] } } : {};
  const structured = {
    '@context': 'https://schema.org',
    '@graph': [
      ...(organization ? [organization] : []),
      // Lets search engines show the product name as the site name in results.
      {
        '@type': 'WebSite',
        name: site.productName,
        ...(site.url ? { url: `${site.url}/` } : {}),
        ...publisher,
      },
      {
        '@type': 'SoftwareApplication',
        name: site.productName,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: LONG_DESCRIPTION,
        ...(site.url ? { url: `${site.url}/`, image: `${site.url}/site/og.png` } : {}),
        ...publisher,
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQ.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
    ],
  };
  tags.push(
    `<script type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script>`,
  );
  return tags.join('\n    ');
}
