import api from "./api";

export type DeviceSignInRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  employeeRole: string;
  deviceLabel: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
};

export async function fetchPendingSignInRequests(): Promise<DeviceSignInRequest[]> {
  const response = await api.get<{ requests: DeviceSignInRequest[] }>("/sign-in-requests/pending");
  return response.data.requests;
}

export async function approveSignInRequest(id: string): Promise<void> {
  await api.post(`/sign-in-requests/${id}/approve`);
}

export async function rejectSignInRequest(id: string): Promise<void> {
  await api.post(`/sign-in-requests/${id}/reject`);
}
