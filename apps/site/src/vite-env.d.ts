/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public address of the website, e.g. https://qualify.appsdemo.in (canonical URL, link previews). */
  readonly VITE_SITE_URL?: string;
  /** The WhatsApp number the "Try it on WhatsApp" buttons open, digits with country code. */
  readonly VITE_SITE_WHATSAPP_NUMBER?: string;
  /** Product name shown on the site (white-label later). */
  readonly VITE_SITE_PRODUCT_NAME?: string;
  /** Where the dashboard lives. Empty in production (same domain); http://localhost:5173 in dev. */
  readonly VITE_SITE_APP_URL?: string;
}

/** The build's year, for the footer (see vite.config.ts). */
declare const __BUILD_YEAR__: number;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
