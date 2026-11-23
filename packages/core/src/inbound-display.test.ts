import { describe, expect, it } from 'vitest';
import { describeInboundMessage } from './inbound-display.ts';

// Payloads as Meta sends them in the webhook's messages[] (the shape we store per message).
describe('describeInboundMessage (D-099)', () => {
  it('explains a message WhatsApp did not pass on, with Meta’s error', () => {
    expect(
      describeInboundMessage('unsupported', {
        id: 'wamid.1',
        type: 'unsupported',
        errors: [
          {
            code: 131051,
            title: 'Message type unknown',
            message: 'Message type unknown',
            error_data: { details: 'Message type is currently not supported.' },
          },
        ],
        unsupported: { type: 'unknown', raw_type: 'unknown' },
      }),
    ).toEqual({
      kind: 'unsupported',
      label: "A message WhatsApp didn't pass on",
      detail: null,
      metaError: '131051: Message type is currently not supported.',
      media: null,
    });
  });

  it('names media with its caption or file name, and tells voice notes from audio files', () => {
    expect(
      describeInboundMessage('image', { image: { caption: 'Our hotel', mime_type: 'image/jpeg' } }),
    ).toMatchObject({
      kind: 'image',
      label: 'Photo',
      detail: 'Our hotel',
    });
    expect(describeInboundMessage('audio', { audio: { voice: true } })).toMatchObject({
      kind: 'voice',
      label: 'Voice message',
    });
    expect(describeInboundMessage('audio', { audio: {} })).toMatchObject({ label: 'Audio file' });
    expect(
      describeInboundMessage('document', {
        document: { filename: 'passport.pdf', caption: 'Mine' },
      }),
    ).toMatchObject({ label: 'Document: passport.pdf', detail: 'Mine' });
    expect(describeInboundMessage('sticker', { sticker: { animated: true } })).toMatchObject({
      label: 'Animated sticker',
    });
  });

  it('reads locations, contact cards, reactions and orders', () => {
    expect(
      describeInboundMessage('location', {
        location: {
          latitude: 28.6139,
          longitude: 77.209,
          name: 'India Gate',
          address: 'New Delhi',
        },
      }),
    ).toMatchObject({ label: 'Location: India Gate, New Delhi', detail: '28.61390, 77.20900' });
    expect(
      describeInboundMessage('contacts', {
        contacts: [{ name: { formatted_name: 'Asha' }, phones: [{ phone: '+91 98100 00000' }] }],
      }),
    ).toMatchObject({ label: 'Contact: Asha', detail: '+91 98100 00000' });
    expect(
      describeInboundMessage('reaction', { reaction: { emoji: '👍', message_id: 'w' } }),
    ).toMatchObject({
      label: 'Reacted 👍 to a message',
    });
    expect(describeInboundMessage('reaction', { reaction: { message_id: 'w' } })).toMatchObject({
      label: 'Removed a reaction',
    });
    expect(
      describeInboundMessage('order', { order: { product_items: [{}, {}], text: 'Two please' } }),
    ).toMatchObject({ label: 'Order: 2 items', detail: 'Two please' });
  });

  it('falls back to the type for anything else, and never throws on odd payloads', () => {
    expect(describeInboundMessage('button_new', null)).toMatchObject({
      kind: 'other',
      label: 'button_new message',
    });
    expect(describeInboundMessage('location', 'garbage')).toMatchObject({
      label: 'Location',
      detail: null,
    });
  });
});
