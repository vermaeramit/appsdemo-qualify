/**
 * Website settings (D-101), all from VITE_SITE_* so a white-label partner can rebrand the site
 * without code changes.
 */
const env = import.meta.env;

function trimSlash(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '');
}

export const site = {
  productName: env.VITE_SITE_PRODUCT_NAME?.trim() || 'AppsDemo Qualify',
  /** Short name used in running text ("Qualify asks…"). */
  shortName:
    (env.VITE_SITE_PRODUCT_NAME?.trim() || 'AppsDemo Qualify').split(' ').at(-1) ?? 'Qualify',
  url: trimSlash(env.VITE_SITE_URL),
  appUrl: trimSlash(env.VITE_SITE_APP_URL),
  whatsappNumber: (env.VITE_SITE_WHATSAPP_NUMBER ?? '').replace(/\D/g, ''),
  /** The company behind the product, for search engines (D-103). Empty: no Organization data. */
  companyName: env.VITE_SITE_COMPANY_NAME?.trim() ?? '',
  /** The company's public profiles (LinkedIn, Facebook, YouTube…), comma-separated https URLs. */
  socialLinks: (env.VITE_SITE_SOCIAL_LINKS ?? '')
    .split(',')
    .map((link) => link.trim())
    .filter((link) => link.startsWith('https://')),
};

/** The first message a visitor sends from the site, so the sales agent knows where they came from. */
export const DEMO_MESSAGE =
  "Hi! I saw your website and I'd like to see how it qualifies leads for my business.";

/** Opens WhatsApp with our number and a ready message; without a number, the sign-up page. */
export function demoHref(message: string = DEMO_MESSAGE): string {
  if (!site.whatsappNumber) return appHref('/signup');
  return `https://wa.me/${site.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

/** A dashboard page: same domain in production, the dashboard's dev server in development. */
export function appHref(path: string): string {
  return `${site.appUrl}${path}`;
}
