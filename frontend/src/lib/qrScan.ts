const DASH_VARIANTS = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;
const INVISIBLE_CHARS = /[\uFEFF\u200B-\u200D\u2060\u00A0]/g;

/** Normalize raw QR / barcode text into an inventory item ID or search query. */
export function normalizeQrScanValue(raw: string): string {
  let value = raw
    .replace(INVISIBLE_CHARS, '')
    .replace(/[\r\n\t]+/g, '')
    .trim();

  if (!value) return '';

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
