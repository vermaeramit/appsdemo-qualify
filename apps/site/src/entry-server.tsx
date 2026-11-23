import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from './App';
import { site } from './config';
import { FAQ } from './content';

export const siteUrl = site.url;

const TITLE = `${site.productName} — AI lead qualification on WhatsApp`;
// Search results show about 155 characters, so the meta description stays under that.
const DESCRIPTION =
  'An AI agent on your own WhatsApp number replies to every Meta ad and form lead in seconds, asks your questions and scores each lead Hot, Warm or Cold.';
// The structured data has room for the full sentence.
const LONG_DESCRIPTION =
  'An AI agent on your own WhatsApp number talks to every new lead from Meta ads, lead forms and your website in seconds, asks your questions, scores each lead Hot, Warm or Cold, and sends your team only the ones worth calling.';

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
  const structured = {
    '@context': 'https://schema.org',
    '@graph': [
      // Lets search engines show the product name as the site name in results.
      {
        '@type': 'WebSite',
        name: site.productName,
        ...(site.url ? { url: `${site.url}/` } : {}),
      },
      {
        '@type': 'SoftwareApplication',
        name: site.productName,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: LONG_DESCRIPTION,
        ...(site.url ? { url: `${site.url}/` } : {}),
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
    `<script type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\u003c')}</script>`,
  );
  return tags.join('\n    ');
}
