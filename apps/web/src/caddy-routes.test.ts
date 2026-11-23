import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Production Caddy serves the dashboard's HTML only for the app's own pages and answers anything
// else with a real 404 (D-103). A new route missing from that list would be a 404 in production,
// so every route in the generated route tree must match it.
const repo = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repo), 'utf8');

function appPaths(): string[] {
  const block = /interface FileRoutesByFullPath \{([^}]*)\}/.exec(
    read('apps/web/src/routeTree.gen.ts'),
  )?.[1];
  if (!block) throw new Error('FileRoutesByFullPath not found in routeTree.gen.ts');
  // "/" is the marketing website in production, not a dashboard page.
  return [...block.matchAll(/'(\/[^']*)'/g)].map((match) => match[1]!).filter((p) => p !== '/');
}

function appPagesMatcher(caddyfile: string): RegExp {
  const line = /@appPages path_regexp (\S+)/.exec(read(`deploy/prod/${caddyfile}`))?.[1];
  if (!line) throw new Error(`@appPages not found in ${caddyfile}`);
  const caseInsensitive = line.startsWith('(?i)');
  return new RegExp(line.replace('(?i)', ''), caseInsensitive ? 'i' : '');
}

describe.each(['Caddyfile', 'Caddyfile.behind-proxy'])('%s', (caddyfile) => {
  const matcher = appPagesMatcher(caddyfile);

  it('serves every dashboard route', () => {
    const paths = appPaths();
    expect(paths.length).toBeGreaterThan(5);
    for (const path of paths) expect(path).toMatch(matcher);
  });

  it('leaves the website and unknown paths out', () => {
    for (const path of ['/', '/xyz', '/dashboards', '/site/', '/llms.txt', '/api/health']) {
      expect(path).not.toMatch(matcher);
    }
  });
});
