const DASH_VARIANTS = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;
const INVISIBLE_CHARS = /[\uFEFF\u200B-\u200D\u2060\u00A0]/g;

export type ParsedAttendanceQr = {
  branchId: string;
  attendanceDay: string;
  token: string;
};

/** Parse daily branch attendance QR payloads (`ATT|B001|2026-09-10|token`). */
export function parseAttendanceQrValue(raw: string): ParsedAttendanceQr | null {
  const cleaned = raw.replace(INVISIBLE_CHARS, '').replace(/[\r\n\t]+/g, '').trim();
  if (!cleaned) return null;

  let value = cleaned;
  try {
    if (/^https?:\/\//i.test(cleaned)) {
      const url = new URL(cleaned);
      const param =
        url.searchParams.get('attendance') ??
        url.searchParams.get('token') ??
        url.searchParams.get('code');
      if (param?.trim()) {
        value = param.trim();
      } else {
        const segment = url.pathname.split('/').filter(Boolean).pop();
        if (segment) value = decodeURIComponent(segment);
      }
    }
  } catch {
    // keep cleaned value
  }

  const pipeMatch = value.match(/^ATT\|([A-Z]\d{3})\|(\d{4}-\d{2}-\d{2})\|([a-f0-9]+)$/i);
  if (pipeMatch) {
    return {
      branchId: pipeMatch[1].toUpperCase(),
      attendanceDay: pipeMatch[2],
      token: pipeMatch[3].toLowerCase(),
    };
  }

  const colonMatch = value.match(/^ATT:([A-Z]\d{3}):(\d{4}-\d{2}-\d{2}):([a-f0-9]+)$/i);
  if (colonMatch) {
    return {
      branchId: colonMatch[1].toUpperCase(),
      attendanceDay: colonMatch[2],
      token: colonMatch[3].toLowerCase(),
    };
  }

  return null;
}

/** Normalize raw QR / barcode text into an inventory item ID or search query. */
export function normalizeQrScanValue(raw: string): string {
  let value = raw
    .replace(INVISIBLE_CHARS, '')
    .replace(/[\r\n\t]+/g, '')
    .trim();

  if (!value) return '';

  if (parseAttendanceQrValue(value)) {
    return value.trim();
  }

  value = value.replace(DASH_VARIANTS, '-');

  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      const idParam =
        url.searchParams.get('id') ??
        url.searchParams.get('item') ??
        url.searchParams.get('code');
      if (idParam?.trim()) {
        value = idParam.trim().replace(DASH_VARIANTS, '-');
      } else {
        const pathSegment = url.pathname.split('/').filter(Boolean).pop();
        if (pathSegment) {
          value = decodeURIComponent(pathSegment).trim().replace(DASH_VARIANTS, '-');
        }
      }
    }
  } catch {
    // Not a URL — continue with the cleaned value.
  }

  const idPrefix = value.match(/^[^:\s]+[:\s]+(.+)$/);
  if (idPrefix?.[1] && /^[A-Z]\d{3}-\d{3}-/i.test(idPrefix[1])) {
    value = idPrefix[1].trim();
  }

  if (/^[A-Za-z]\d{3}-\d{3}-/.test(value)) {
    value = value.toUpperCase();
  }

  return value.trim();
}
