/**
 * Every page of the website (D-104). Each is pre-rendered to `<path>/index.html`, listed in the
 * sitemap and served by Caddy at its clean path.
 */
export const INDUSTRY_SLUGS = ['real-estate', 'education', 'travel', 'clinics'] as const;
export type IndustrySlug = (typeof INDUSTRY_SLUGS)[number];
export type PageId = 'home' | IndustrySlug;

export interface SitePage {
  id: PageId;
  /** The page's address: "/" or "/<slug>", never with a trailing slash. */
  path: string;
}

export const PAGES: readonly SitePage[] = [
  { id: 'home', path: '/' },
  ...INDUSTRY_SLUGS.map((slug) => ({ id: slug, path: `/${slug}` })),
];

/** The page for an address ("/travel/" too); unknown addresses show the home page (dev only). */
export function pageForPath(pathname: string): SitePage {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return PAGES.find((page) => page.path === clean) ?? PAGES[0]!;
}

export function isIndustry(id: PageId): id is IndustrySlug {
  return id !== 'home';
}
