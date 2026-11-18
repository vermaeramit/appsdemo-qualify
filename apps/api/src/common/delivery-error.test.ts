import { describe, expect, it } from 'vitest';
import { deliveryErrorMessage } from './delivery-error';

describe('deliveryErrorMessage', () => {
  it('explains known Meta error codes', () => {
    expect(
      deliveryErrorMessage({ errors: [{ code: 131026, title: 'Message undeliverable' }] }),
    ).toBe(
      'Not delivered: this number may not be on WhatsApp, or its WhatsApp app needs an update.',
    );
  });

  it('falls back to the title and code, then to a generic text', () => {
    expect(
      deliveryErrorMessage({ errors: [{ code: 131000, title: 'Something went wrong' }] }),
    ).toBe('Not delivered: Something went wrong (Meta 131000)');
    expect(deliveryErrorMessage({ message: 'Blocked by the dev safety switch' })).toBe(
      'Blocked by the dev safety switch',
    );
    expect(deliveryErrorMessage({ errors: [] })).toBe('Not delivered');
    expect(deliveryErrorMessage(null)).toBe('Not delivered');
  });
});
