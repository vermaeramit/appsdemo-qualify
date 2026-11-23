import { describe, expect, it } from 'vitest';
import { safeRedirect } from './session';
import { initials, workspaceSlug } from './workspace';

describe('safeRedirect', () => {
  it('keeps internal paths', () => {
    expect(safeRedirect('/leads?grade=hot')).toBe('/leads?grade=hot');
  });

  it('blocks external and protocol-relative targets', () => {
    expect(safeRedirect('https://evil.example')).toBe('/dashboard');
    expect(safeRedirect('//evil.example')).toBe('/dashboard');
    expect(safeRedirect('/\\evil.example')).toBe('/dashboard');
    expect(safeRedirect(undefined)).toBe('/dashboard');
  });
});

describe('workspace helpers', () => {
  it('builds a url-safe slug with a suffix', () => {
    expect(workspaceSlug('Sunrise Holidays!')).toMatch(/^sunrise-holidays-[a-z0-9]{1,4}$/);
    expect(workspaceSlug('ॐ')).toMatch(/^workspace-/);
  });

  it('builds initials', () => {
    expect(initials('Amit Kumar')).toBe('AK');
    expect(initials('amit')).toBe('A');
    expect(initials('  ')).toBe('?');
  });
});
