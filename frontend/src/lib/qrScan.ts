/** Normalize raw QR / barcode text into an inventory item ID or search query. */
export function normalizeQrScanValue(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      const idParam =
        url.searchParams.get('id') ??
        url.searchParams.get('item') ??
        url.searchParams.get('code');
      if (idParam?.trim()) return idParam.trim();

      const pathSegment = url.pathname.split('/').filter(Boolean).pop();
      if (pathSegment) return decodeURIComponent(pathSegment).trim();
    }
  } catch {
    // Not a URL — use the raw value.
  }

  return trimmed;
}
