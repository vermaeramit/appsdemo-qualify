import { describe, expect, it } from 'vitest';
import { appHref, demoHref, site } from './config';

describe('website links (D-101)', () => {
  it('opens WhatsApp with the number and a ready message, or the sign-up page without one', () => {
    const href = demoHref('Hi there');
    if (site.whatsappNumber) {
      expect(href).toBe(`https://wa.me/${site.whatsappNumber}?text=Hi%20there`);
    } else {
      expect(href).toBe(appHref('/signup'));
    }
  });

  it('keeps dashboard links on the same domain unless an app address is set', () => {
    expect(appHref('/login')).toBe(`${site.appUrl}/login`);
    expect(appHref('/login').startsWith('//')).toBe(false);
  });
});
