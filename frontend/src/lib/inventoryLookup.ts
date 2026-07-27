import api from './api';

export async function resolveInventoryItem<T = unknown>(
  rawCode: string,
  sourceBranch: string,
  branchMap: Record<string, string>
): Promise<T | null> {
  const code = rawCode.trim();
  if (!code) return null;

  try {
    const response = await api.get(`/inventory/${encodeURIComponent(code)}`);
    return response.data as T;
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status;
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
  const item = response.data?.items?.[0];
  if (!item) {
    throw new Error(`Inventory code ${code} was not found for branch ${sourceBranch}`);
  }
  return item as T;
}
