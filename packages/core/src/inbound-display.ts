import type { InboundDisplay } from '@qualify/shared';

/**
 * What an incoming non-text WhatsApp message was (D-099), read from the payload we store with it
 * (the message object of Meta's webhook). Text, button and list replies have a body and need none.
 */
export function describeInboundMessage(type: string, payload: unknown): InboundDisplay {
  const message = record(payload);
  const part = record(message[type]);
  const caption = text(part.caption);

  switch (type) {
    case 'image':
      return display('image', 'Photo', caption);
    case 'video':
      return display('video', 'Video', caption);
    case 'audio':
      return part.voice === true
        ? display('voice', 'Voice message', null)
        : display('audio', 'Audio file', null);
    case 'document': {
      const file = text(part.filename);
      return display('document', file ? `Document: ${file}` : 'Document', caption);
    }
    case 'sticker':
      return display('sticker', part.animated === true ? 'Animated sticker' : 'Sticker', null);
    case 'location': {
      const place = [text(part.name), text(part.address)].filter(Boolean).join(', ');
      const latitude = number(part.latitude);
      const longitude = number(part.longitude);
      const point =
        latitude !== null && longitude !== null
          ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
          : null;
      return display(
        'location',
        place ? `Location: ${place}` : 'Location',
        [point, text(part.url)].filter(Boolean).join(' · ') || null,
      );
    }
    case 'contacts': {
      const contacts = Array.isArray(message.contacts) ? message.contacts.map(record) : [];
      const names = contacts
        .map((contact) => text(record(contact.name).formatted_name))
        .filter((name): name is string => Boolean(name));
      const phones = contacts
        .flatMap((contact) => (Array.isArray(contact.phones) ? contact.phones.map(record) : []))
        .map((phone) => text(phone.phone) ?? text(phone.wa_id))
        .filter((phone): phone is string => Boolean(phone));
      const label =
        names.length === 1
          ? `Contact: ${names[0]}`
          : contacts.length > 1
            ? `${contacts.length} contacts`
            : 'Contact card';
      return display('contacts', label, phones.join(', ') || null);
    }
    case 'reaction': {
      const emoji = text(part.emoji);
      return display(
        'reaction',
        emoji ? `Reacted ${emoji} to a message` : 'Removed a reaction',
        null,
      );
    }
    case 'order': {
      const items = Array.isArray(part.product_items) ? part.product_items.length : 0;
      return display(
        'order',
        items ? `Order: ${items} ${items === 1 ? 'item' : 'items'}` : 'Order',
        text(part.text),
      );
    }
    case 'unsupported': {
      const error = record(Array.isArray(message.errors) ? message.errors[0] : undefined);
      const code = number(error.code);
      const reason =
        text(record(error.error_data).details) ?? text(error.message) ?? text(error.title);
      const kind = text(part.type);
      return {
        kind: 'unsupported',
        label: "A message WhatsApp didn't pass on",
        detail: kind && kind !== 'unknown' ? `Type: ${kind}` : null,
        metaError: code !== null || reason ? [code, reason].filter(Boolean).join(': ') : null,
        media: null,
      };
    }
    case 'request_welcome':
      return display('other', 'Opened the chat', null);
    case 'interactive':
      return display('other', 'Reply from an interactive message', null);
    default:
      return display('other', `${type} message`, null);
  }
}

function display(
  kind: InboundDisplay['kind'],
  label: string,
  detail: string | null,
): InboundDisplay {
  return { kind, label, detail, metaError: null, media: null };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 500) : null;
}

function number(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}
