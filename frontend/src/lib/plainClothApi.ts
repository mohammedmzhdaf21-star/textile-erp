import axios, { type AxiosError } from 'axios';
import api from './api';
import { normalizeStoredAmount, toPriceInputNumber } from './currency';

export type PlainClothType = {
  id: string;
  name: string;
  pricePerM: number;
  isActive: boolean;
};

export type PlainClothReconnectResult = {
  online: boolean;
  synced: number;
  reason: 'ok' | 'auth' | 'server_outdated' | 'failed';
};

const STORAGE_KEY = 'textile-erp-plain-cloth-types';

const LIST_PATHS = ['/commissions/plain-cloth', '/plain-cloth'] as const;

const DEFAULT_KURDISH_PLAIN_CLOTH: PlainClothType[] = [
  { id: 'default_atlas', name: 'ئەتڵەص', pricePerM: 12000, isActive: true },
  { id: 'default_baranjok', name: 'برنجۆک', pricePerM: 8000, isActive: true },
  { id: 'default_harir', name: 'حەریر', pricePerM: 25000, isActive: true },
  { id: 'default_french_silk', name: 'سلکی فەڕەنسی', pricePerM: 30000, isActive: true },
];

let offlineMode = false;

export function isPlainClothOfflineMode() {
  return offlineMode;
}

function isApi404(error: unknown) {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

function isApi401(error: unknown) {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

function shouldTryNextPath(error: unknown) {
  return isApi404(error);
}

export async function getServerPlainClothStatus(): Promise<'ready' | 'outdated' | 'unknown'> {
  try {
    const response = await fetch('/health', { cache: 'no-store' });
    if (!response.ok) return 'unknown';
    const data = (await response.json()) as { features?: { plainClothApi?: boolean } };
    return data.features?.plainClothApi ? 'ready' : 'outdated';
  } catch {
    return 'unknown';
  }
}

function readLocalTypes(): PlainClothType[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedLocalDefaultsIfEmpty();
    const parsed = JSON.parse(raw) as PlainClothType[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return seedLocalDefaultsIfEmpty();
    }
    return parsed;
  } catch {
    return seedLocalDefaultsIfEmpty();
  }
}

function seedLocalDefaultsIfEmpty(): PlainClothType[] {
  writeLocalTypes(DEFAULT_KURDISH_PLAIN_CLOTH);
  return [...DEFAULT_KURDISH_PLAIN_CLOTH];
}

function writeLocalTypes(items: PlainClothType[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function localId(name: string) {
  const slug = name.trim().slice(0, 20).replace(/\s+/g, '_') || 'cloth';
  return `local_${slug}_${Date.now().toString(36)}`;
}

function filterActive(items: PlainClothType[], includeInactive: boolean) {
  return includeInactive ? items : items.filter((item) => item.isActive);
}

function markOnline(items: PlainClothType[]) {
  offlineMode = false;
  writeLocalTypes(items.filter((item) => item.isActive));
}

function priceForApiRequest(storedPrice: number) {
  return storedPrice >= 500 ? toPriceInputNumber(storedPrice) : storedPrice;
}

async function requestListFromSettings(): Promise<PlainClothType[] | null> {
  try {
    const response = await api.get<{ plainClothTypes?: PlainClothType[]; rate?: unknown }>(
      '/commissions/settings'
    );
    if (Array.isArray(response.data.plainClothTypes)) {
      return response.data.plainClothTypes;
    }
    if (response.data.rate !== undefined) {
      return null;
    }
  } catch (error) {
    if (isApi401(error)) throw error;
    if (!shouldTryNextPath(error)) throw error;
  }
  return null;
}

async function requestList(includeInactive: boolean): Promise<PlainClothType[]> {
  let lastError: unknown;

  const fromSettings = await requestListFromSettings();
  if (fromSettings) {
    return fromSettings;
  }

  for (const path of LIST_PATHS) {
    try {
      const response = await api.get<{ items: PlainClothType[] }>(path, {
        params: includeInactive ? { includeInactive: true } : undefined,
      });
      return response.data.items || [];
    } catch (error) {
      lastError = error;
      if (isApi401(error)) throw error;
      if (!shouldTryNextPath(error)) throw error;
    }
  }

  throw lastError ?? new Error('Plain cloth API not found');
}

async function requestCreate(name: string, pricePerM: number): Promise<PlainClothType> {
  const body = { name, pricePerM: priceForApiRequest(pricePerM) };
  let lastError: unknown;

  for (const path of LIST_PATHS) {
    try {
      const response = await api.post<{ item: PlainClothType }>(path, body);
      return response.data.item;
    } catch (error) {
      lastError = error;
      if (isApi401(error)) throw error;
      if (!shouldTryNextPath(error)) throw error;
    }
  }

  try {
    const response = await api.post<{ item: PlainClothType }>(
      '/commissions/settings/plain-cloth',
      body
    );
    return response.data.item;
  } catch (error) {
    lastError = error;
    if (isApi401(error)) throw error;
    if (!shouldTryNextPath(error)) throw error;
  }

  throw lastError ?? new Error('Plain cloth API not found');
}

async function requestUpdate(
  id: string,
  input: { name?: string; pricePerM?: number }
): Promise<PlainClothType> {
  const payload = {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.pricePerM !== undefined
      ? { pricePerM: priceForApiRequest(normalizeStoredAmount(input.pricePerM)) }
      : {}),
  };
  let lastError: unknown;

  for (const basePath of LIST_PATHS) {
    try {
      const response = await api.put<{ item: PlainClothType }>(`${basePath}/${id}`, payload);
      return response.data.item;
    } catch (error) {
      lastError = error;
      if (isApi401(error)) throw error;
      if (!shouldTryNextPath(error)) throw error;
    }
  }

  try {
    const response = await api.put<{ item: PlainClothType }>(
      `/commissions/settings/plain-cloth/${id}`,
      payload
    );
    return response.data.item;
  } catch (error) {
    lastError = error;
    if (isApi401(error)) throw error;
    if (!shouldTryNextPath(error)) throw error;
  }

  throw lastError ?? new Error('Plain cloth API not found');
}

async function requestDelete(id: string): Promise<void> {
  let lastError: unknown;

  for (const basePath of LIST_PATHS) {
    try {
      await api.delete(`${basePath}/${id}`);
      return;
    } catch (error) {
      lastError = error;
      if (isApi401(error)) throw error;
      if (!shouldTryNextPath(error)) throw error;
    }
  }

  try {
    await api.delete(`/commissions/settings/plain-cloth/${id}`);
    return;
  } catch (error) {
    lastError = error;
    if (isApi401(error)) throw error;
    if (!shouldTryNextPath(error)) throw error;
  }

  throw lastError ?? new Error('Plain cloth API not found');
}

export async function syncLocalPlainClothTypesToServer(): Promise<number> {
  const localOnly = readLocalTypes().filter(
    (item) => item.isActive && (item.id.startsWith('local_') || item.id.startsWith('default_'))
  );
  if (localOnly.length === 0) return 0;

  let synced = 0;
  for (const item of localOnly) {
    try {
      await requestCreate(item.name, item.pricePerM);
      synced += 1;
    } catch (error) {
      if (isApi404(error)) break;
      const axiosError = error as AxiosError<{ error?: string }>;
      const message = axiosError.response?.data?.error ?? '';
      if (message.toLowerCase().includes('already exists')) {
        synced += 1;
      }
    }
  }

  if (synced > 0) {
    const items = await requestList(true);
    markOnline(items);
  }

  return synced;
}

export async function fetchPlainClothTypes(includeInactive = false) {
  try {
    const items = await requestList(includeInactive);
    markOnline(items);
    void syncLocalPlainClothTypesToServer().catch(() => undefined);
    return filterActive(items, includeInactive);
  } catch (error) {
    if (isApi401(error)) throw error;
    offlineMode = true;
    return filterActive(readLocalTypes(), includeInactive);
  }
}

export async function createPlainClothType(name: string, pricePerM: number) {
  const trimmedName = name.trim();
  const storedPrice = normalizeStoredAmount(pricePerM);

  try {
    const item = await requestCreate(trimmedName, storedPrice);
    markOnline([...readLocalTypes().filter((entry) => entry.id !== item.id), item]);
    return item;
  } catch (error) {
    if (isApi401(error)) throw error;
    if (!isApi404(error) && !(error instanceof Error && error.message.includes('not found'))) {
      throw error;
    }

    offlineMode = true;
    const duplicate = readLocalTypes().find(
      (item) => item.isActive && item.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      throw new Error('A plain cloth type with this name already exists');
    }

    const item: PlainClothType = {
      id: localId(trimmedName),
      name: trimmedName,
      pricePerM: storedPrice,
      isActive: true,
    };
    writeLocalTypes([...readLocalTypes(), item]);
    return item;
  }
}

export async function updatePlainClothType(
  id: string,
  input: { name?: string; pricePerM?: number }
) {
  const payload = {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.pricePerM !== undefined
      ? { pricePerM: normalizeStoredAmount(input.pricePerM) }
      : {}),
  };

  try {
    const item = await requestUpdate(id, payload);
    writeLocalTypes(readLocalTypes().map((entry) => (entry.id === item.id ? item : entry)));
    offlineMode = false;
    return item;
  } catch (error) {
    if (isApi401(error)) throw error;
    if (!isApi404(error) && !(error instanceof Error && error.message.includes('not found'))) {
      throw error;
    }

    offlineMode = true;
    const items = readLocalTypes();
    const index = items.findIndex((entry) => entry.id === id);
    if (index < 0) throw new Error('Plain cloth type not found');

    const nextName = input.name !== undefined ? input.name.trim() : items[index].name;
    if (!nextName) throw new Error('Plain cloth name is required');

    const nextPrice =
      input.pricePerM !== undefined
        ? normalizeStoredAmount(input.pricePerM)
        : items[index].pricePerM;

    const updated: PlainClothType = {
      ...items[index],
      name: nextName,
      pricePerM: nextPrice,
    };
    items[index] = updated;
    writeLocalTypes(items);
    return updated;
  }
}

export async function deletePlainClothType(id: string) {
  try {
    await requestDelete(id);
    offlineMode = false;
    writeLocalTypes(
      readLocalTypes().map((entry) =>
        entry.id === id ? { ...entry, isActive: false } : entry
      )
    );
  } catch (error) {
    if (isApi401(error)) throw error;
    if (!isApi404(error) && !(error instanceof Error && error.message.includes('not found'))) {
      throw error;
    }

    offlineMode = true;
    writeLocalTypes(
      readLocalTypes().map((entry) =>
        entry.id === id ? { ...entry, isActive: false } : entry
      )
    );
  }
}

export async function reconnectPlainClothApi(): Promise<PlainClothReconnectResult> {
  const serverStatus = await getServerPlainClothStatus();

  try {
    const items = await requestList(true);
    markOnline(items);
    const synced = await syncLocalPlainClothTypesToServer();
    return { online: true, synced, reason: 'ok' };
  } catch (error) {
    offlineMode = true;
    if (isApi401(error)) {
      return { online: false, synced: 0, reason: 'auth' };
    }
    if (serverStatus === 'outdated') {
      return { online: false, synced: 0, reason: 'server_outdated' };
    }
    return { online: false, synced: 0, reason: 'failed' };
  }
}
