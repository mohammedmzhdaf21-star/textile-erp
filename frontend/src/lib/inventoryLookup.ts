import api from './api';
import { normalizeQrScanValue } from './qrScan';

type InventoryListResponse<T> = {
  items?: T[];
};

export async function resolveInventoryItem<T = unknown>(
  rawCode: string,
  sourceBranch: string,
  branchMap: Record<string, string>
): Promise<T | null> {
  const code = normalizeQrScanValue(rawCode);
  if (!code) return null;

  try {
    const response = await api.get(`/inventory/${encodeURIComponent(code)}`);
    return response.data as T;
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      const fallback = await lookupInventoryItemByCode<T>(code);
      if (fallback) return fallback;
    }
    if (status !== 404 || !/^\d+$/.test(code)) {
      throw error;
    }
  }

  const response = await api.get('/inventory', {
    params: {
      branchId: branchMap[sourceBranch] ?? sourceBranch,
      code,
      pageSize: 1,
    },
  });
  const item = (response.data as InventoryListResponse<T>)?.items?.[0];
  if (!item) {
    throw new Error(`Inventory code ${code} was not found for branch ${sourceBranch}`);
  }
  return item;
}

async function lookupInventoryItemByCode<T>(code: string): Promise<T | null> {
  const response = await api.get('/inventory', {
    params: {
      itemId: code,
      includeArchived: true,
      pageSize: 5,
    },
  });
  const items = (response.data as InventoryListResponse<T>)?.items ?? [];
  if (items.length === 1) {
    return items[0] as T;
  }

  const upper = code.toUpperCase();
  const exact = items.find((item) => {
    const record = item as { id?: string; qrCodeValue?: string | null };
    return record.id?.toUpperCase() === upper || record.qrCodeValue?.toUpperCase() === upper;
  });
  return (exact as T | undefined) ?? null;
}
