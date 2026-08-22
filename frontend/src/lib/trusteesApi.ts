import api from './api';

export type TrusteeRule = {
  id: string;
  trusteeName: string;
  contactInfo: string;
  branches: string[];
  percentage: number;
  isActive: boolean;
  updatedAt: string;
};

export type TrusteeRuleInput = {
  trusteeName: string;
  contactInfo?: string;
  branches: string[];
  percentage: number;
  isActive?: boolean;
};

export async function fetchTrusteeRules(includeInactive = true) {
  const response = await api.get<{ rules: TrusteeRule[] }>('/trustees', {
    params: includeInactive ? { includeInactive: true } : undefined,
  });
  return response.data.rules || [];
}

export async function createTrusteeRule(input: TrusteeRuleInput) {
  const response = await api.post<{ rule: TrusteeRule }>('/trustees', input);
  return response.data.rule;
}

export async function updateTrusteeRule(id: string, input: TrusteeRuleInput) {
  const response = await api.put<{ rule: TrusteeRule }>(`/trustees/${encodeURIComponent(id)}`, input);
  return response.data.rule;
}

export async function deleteTrusteeRule(id: string) {
  await api.delete(`/trustees/${encodeURIComponent(id)}`);
}
