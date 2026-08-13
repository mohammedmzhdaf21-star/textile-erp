import axios from 'axios';
import api from './api';
import { normalizeStoredAmount } from './currency';

export type PlainClothType = {
  id: string;
  name: string;
  pricePerM: number;
  isActive: boolean;
};

const STORAGE_KEY = 'textile-erp-plain-cloth-types';

let offlineMode = false;

export function isPlainClothOfflineMode() {
  return offlineMode;
}

function isApi404(error: unknown) {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

function readLocalTypes(): PlainClothType[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PlainClothType[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

export async function fetchPlainClothTypes(includeInactive = false) {
  try {
    const response = await api.get<{ items: PlainClothType[] }>('/plain-cloth', {
      params: includeInactive ? { includeInactive: true } : undefined,
    });
    offlineMode = false;
    const items = response.data.items || [];
    writeLocalTypes(items.filter((item) => item.isActive));
    return filterActive(items, includeInactive);
  } catch (error) {
    if (isApi404(error)) {
      offlineMode = true;
      return filterActive(readLocalTypes(), includeInactive);
    }
    throw error;
  }
}

export async function createPlainClothType(name: string, pricePerM: number) {
  const trimmedName = name.trim();
  const storedPrice = normalizeStoredAmount(pricePerM);

  try {
    const response = await api.post<{ item: PlainClothType }>('/plain-cloth', {
      name: trimmedName,
      pricePerM: storedPrice,
    });
    offlineMode = false;
    const item = response.data.item;
    writeLocalTypes([...readLocalTypes().filter((entry) => entry.id !== item.id), item]);
    return item;
  } catch (error) {
    if (!isApi404(error)) throw error;

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
  try {
    const response = await api.put<{ item: PlainClothType }>(`/plain-cloth/${id}`, input);
    offlineMode = false;
    const item = response.data.item;
    writeLocalTypes(
      readLocalTypes().map((entry) => (entry.id === item.id ? item : entry))
    );
    return item;
  } catch (error) {
    if (!isApi404(error)) throw error;

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
    await api.delete(`/plain-cloth/${id}`);
    offlineMode = false;
    writeLocalTypes(
      readLocalTypes().map((entry) =>
        entry.id === id ? { ...entry, isActive: false } : entry
      )
    );
  } catch (error) {
    if (!isApi404(error)) throw error;

    offlineMode = true;
    writeLocalTypes(
      readLocalTypes().map((entry) =>
        entry.id === id ? { ...entry, isActive: false } : entry
      )
    );
  }
}
