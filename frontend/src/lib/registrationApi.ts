import api from "./api";

export type BranchOption = {
  id: string;
  name: string;
};

export type PendingEmployee = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "ADMIN" | "MANAGER" | "EMPLOYEE" | "TRUSTEE";
  assignedWork: string | null;
  registrationNote: string | null;
  allowedSections: string[] | null;
  branchIds: string[];
  lastLoginAt: string | null;
  createdAt: string;
};

export async function fetchPublicBranches(): Promise<BranchOption[]> {
  const response = await api.get<{ branches: BranchOption[] }>("/auth/branches");
  return response.data.branches;
}

export async function registerEmployee(input: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  branchId?: string;
  registrationNote?: string;
}): Promise<{ message: string }> {
  const response = await api.post<{ message: string }>("/auth/register", input);
  return response.data;
}

export async function fetchPendingEmployees(): Promise<PendingEmployee[]> {
  const response = await api.get<{ employees: PendingEmployee[] }>("/employees/pending");
  return response.data.employees;
}

export async function approveEmployee(
  id: string,
  input?: { branchIds?: string[]; assignedWork?: string }
): Promise<void> {
  await api.post(`/employees/${id}/approve`, input ?? {});
}

export async function rejectEmployee(id: string, reason?: string): Promise<void> {
  await api.post(`/employees/${id}/reject`, { reason });
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const response = await api.get<{ count: number }>("/notifications/unread-count");
  return response.data.count;
}
