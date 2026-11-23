import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { FAQ, FEATURES, STEPS } from './content';
import { renderLlmsTxt } from './llms';
import { SECTION_IDS } from './meta';

describe('llms.txt', () => {
  const text = renderLlmsTxt();

  it('starts with the product name and a one-line summary', () => {
    expect(text).toMatch(/^# \S.*\n\n> \S.*\n/);
  });

  it('carries the same content as the page', () => {
    for (const step of STEPS) expect(text).toContain(step.title);
    for (const feature of FEATURES) expect(text).toContain(feature.title);
    for (const item of FAQ) expect(text).toContain(`### ${item.question}`);
    expect(text).not.toMatch(/undefined|\[object /);
  });

  it('links only to sections the page has', () => {
    const html = renderToString(<App />);
    const ids = Object.values(SECTION_IDS) as string[];
    for (const id of ids) expect(html).toContain(`id="${id}"`);
    const anchors = [...text.matchAll(/\/#([\w-]+)\)/g)].map((match) => match[1]);
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) expect(ids).toContain(anchor);
  });
});
