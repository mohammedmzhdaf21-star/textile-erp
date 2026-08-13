import api from './api';

export type PlainClothType = {
  id: string;
  name: string;
  pricePerM: number;
  isActive: boolean;
};

export async function fetchPlainClothTypes(includeInactive = false) {
  const response = await api.get<{ items: PlainClothType[] }>('/plain-cloth', {
    params: includeInactive ? { includeInactive: true } : undefined,
  });
  return response.data.items || [];
}

export async function createPlainClothType(name: string, pricePerM: number) {
  const response = await api.post<{ item: PlainClothType }>('/plain-cloth', { name, pricePerM });
  return response.data.item;
}

export async function updatePlainClothType(
  id: string,
  input: { name?: string; pricePerM?: number }
) {
  const response = await api.put<{ item: PlainClothType }>(`/plain-cloth/${id}`, input);
  return response.data.item;
}

export async function deletePlainClothType(id: string) {
  await api.delete(`/plain-cloth/${id}`);
}
