import api from './api';
import { parsePriceInput } from './currency';

export type TailorMeasurement = {
  id: string;
  code: number;
  customerName: string;
  phone: string;
  shoulderCm: number;
  armCm: number;
  waistCm: number;
  chestCm: number;
  heightCm: number;
  buttCm: number;
  costIqd: number;
  paidIqd: number;
  remainingIqd: number;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
};

export type TailorMeasurementDraft = {
  customerName: string;
  phone: string;
  shoulderCm: string;
  armCm: string;
  waistCm: string;
  chestCm: string;
  heightCm: string;
  buttCm: string;
  cost: string;
  paid: string;
};

export async function fetchTailorMeasurements(query: string) {
  const { data } = await api.get<{ items: TailorMeasurement[]; nextCode: number }>(
    '/tailor-measurements',
    { params: query.trim() ? { q: query.trim() } : {} }
  );
  return data;
}

export async function createTailorMeasurement(draft: TailorMeasurementDraft) {
  const { data } = await api.post<{ item: TailorMeasurement }>('/tailor-measurements', toPayload(draft));
  return data.item;
}

export async function updateTailorMeasurement(id: string, draft: TailorMeasurementDraft) {
  const { data } = await api.patch<{ item: TailorMeasurement }>(
    `/tailor-measurements/${id}`,
    toPayload(draft)
  );
  return data.item;
}

export async function deleteTailorMeasurement(id: string) {
  const { data } = await api.delete<{ code: number }>(`/tailor-measurements/${id}`);
  return data;
}

function toPayload(draft: TailorMeasurementDraft) {
  return {
    customerName: draft.customerName,
    phone: draft.phone,
    shoulderCm: Number(draft.shoulderCm),
    armCm: Number(draft.armCm),
    waistCm: Number(draft.waistCm),
    chestCm: Number(draft.chestCm),
    heightCm: Number(draft.heightCm),
    buttCm: Number(draft.buttCm),
    costIqd: parsePriceInput(draft.cost),
    paidIqd: parsePriceInput(draft.paid || 0),
  };
}
