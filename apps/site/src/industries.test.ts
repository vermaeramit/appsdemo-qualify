import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pageMeta } from './entry-server';
import { INDUSTRY_PAGES } from './industries';
import { PAGES, pageForPath } from './pages';

describe.each(INDUSTRY_PAGES.map((page) => [page.slug, page] as const))('%s page', (_, page) => {
  it('scores its example with every rule of the ready-made agent', () => {
    // One row per scoring rule, then "all required answers", then AI intent: if an answer is
    // missing, the rows no longer line up with the rules.
    expect(page.result.rows).toHaveLength(page.scoring.rules.length + 2);
    const total = page.result.rows.reduce((sum, row) => sum + row.points, 0);
    expect(page.result.score).toBe(Math.min(100, total));
    expect(page.result.grade).toBe('Hot');
  });

  it('plays a chat a real WhatsApp conversation could have', () => {
    let buttons: string[] = [];
    for (const event of page.chat) {
      if (event.kind === 'ai') {
        buttons = event.buttons ?? [];
        // WhatsApp reply buttons: at most three (longer choices become a list).
        expect(buttons.length).toBeLessThanOrEqual(3);
      }
      if (event.kind === 'tap') expect(buttons).toContain(event.text);
    }
    expect(page.demo.events.at(-1)).toMatchObject({ kind: 'score', score: page.result.score });
  });

  it('fits search results', () => {
    const meta = pageMeta({ id: page.slug, path: `/${page.slug}` });
    expect(meta.description.length).toBeLessThanOrEqual(155);
    expect(page.title.length).toBeLessThanOrEqual(60);
    expect(page.faq.length).toBeGreaterThanOrEqual(3);
  });
});

describe('pages', () => {
  it('have one address each', () => {
    const paths = PAGES.map((page) => page.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(pageForPath('/travel/').id).toBe('travel');
    expect(pageForPath('/nope').id).toBe('home');
  });

  it('never take a path the dashboard uses', () => {
    // Caddy serves dashboard routes first (D-103), so a page there would never be seen.
    const routeTree = readFileSync(
      new URL('../../web/src/routeTree.gen.ts', import.meta.url),
      'utf8',
    );
    const block = /interface FileRoutesByFullPath \{([^}]*)\}/.exec(routeTree)?.[1] ?? '';
    const dashboard = [...block.matchAll(/'(\/[^']+)'/g)].map((match) => match[1]);
    expect(dashboard.length).toBeGreaterThan(5);
    for (const page of PAGES.filter((item) => item.path !== '/')) {
      expect(dashboard).not.toContain(page.path);
    }
  });
});
