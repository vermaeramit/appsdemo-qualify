import { describe, expect, it } from 'vitest';
import {
  contentDisposition,
  isInlineMime,
  parseRange,
  safeDownloadMime,
  withFile,
} from './inbound-files';

describe('files leads send (D-100)', () => {
  it('opens only types a browser shows without running anything', () => {
    expect(isInlineMime('image/jpeg')).toBe(true);
    expect(isInlineMime('audio/ogg; codecs=opus')).toBe(true);
    expect(isInlineMime('application/pdf')).toBe(true);
    expect(isInlineMime('image/svg+xml')).toBe(false);
    expect(isInlineMime('text/html')).toBe(false);
    expect(isInlineMime('application/vnd.ms-excel')).toBe(false);
  });

  it('never serves a download as something a browser could run', () => {
    expect(safeDownloadMime('image/svg+xml')).toBe('application/octet-stream');
    expect(safeDownloadMime('text/html; charset=utf-8')).toBe('application/octet-stream');
    expect(safeDownloadMime('application/vnd.ms-excel')).toBe('application/vnd.ms-excel');
  });

  it('keeps the lead’s file name, safely encoded', () => {
    expect(contentDisposition(false, 'Passport "copy".pdf', 'application/pdf')).toBe(
      `attachment; filename="Passport _copy_.pdf"; filename*=UTF-8''Passport%20%22copy%22.pdf`,
    );
    expect(contentDisposition(true, 'यात्रा.pdf', 'application/pdf')).toBe(
      `inline; filename="______.pdf"; filename*=UTF-8''${encodeURIComponent('यात्रा.pdf')}`,
    );
    expect(contentDisposition(true, null, 'audio/ogg; codecs=opus')).toBe(
      `inline; filename="whatsapp-file.ogg"; filename*=UTF-8''whatsapp-file.ogg`,
    );
  });

  it('adds the file state, with a link only once it is stored', () => {
    const display = {
      kind: 'image' as const,
      label: 'Photo',
      detail: null,
      metaError: null,
      media: null,
    };
    const base = {
      id: 'f1',
      tenantId: 'org',
      leadId: 'lead-1',
      waMediaId: 'M1',
      mime: 'image/jpeg',
      fileName: null,
      size: 10,
      sha256: null,
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const files = new Map([
      ['m1', { ...base, messageId: 'm1', status: 'stored' as const }],
      ['m2', { ...base, messageId: 'm2', status: 'pending' as const }],
    ]);
    expect(withFile(display, 'lead-1', 'm1', files).media).toEqual({
      status: 'stored',
      url: '/api/conversations/lead-1/media/m1',
      mime: 'image/jpeg',
      size: 10,
      fileName: null,
    });
    expect(withFile(display, 'lead-1', 'm2', files).media?.url).toBeNull();
    expect(withFile(display, 'lead-1', 'm3', files).media).toBeNull();
  });
});

describe('parts of a file (Range)', () => {
  it('answers the part a player asks for', () => {
    expect(parseRange(undefined, 100)).toBeNull();
    expect(parseRange('bytes=0-', 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
    expect(parseRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-500', 100)).toEqual({ start: 0, end: 99 });
  });

  it('refuses a part outside the file and sends the whole file for odd requests', () => {
    expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=20-10', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=-0', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=0-1,5-6', 100)).toBeNull();
    expect(parseRange('items=0-1', 100)).toBeNull();
  });
});
