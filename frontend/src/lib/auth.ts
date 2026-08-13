import api from "./api";
import { getDeviceId } from "./deviceId";
import type { DashboardSectionKey } from "./dashboardSettings";

export type UserRole = "ADMIN" | "MANAGER" | "EMPLOYEE" | "TRUSTEE";

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  isActive?: boolean;
  assignedWork?: string | null;
  allowedSections?: DashboardSectionKey[] | null;
  branchIds?: string[];
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface LoginResponse {
  message: string;
  accessToken: string;
  refreshToken: string;
  user: User;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>("/auth/login", {
    email,
    password,
    deviceId: getDeviceId(),
  });

  const { accessToken, refreshToken, user } = response.data;

  localStorage.setItem("accessToken", accessToken);
  localStorage.setItem("refreshToken", refreshToken);
  localStorage.setItem("user", JSON.stringify(user));

  return response.data;
}

export async function logout(): Promise<void> {
  const refreshToken = localStorage.getItem("refreshToken");

  if (refreshToken) {
    try {
      await api.post("/auth/logout", { refreshToken });
    } catch (error) {
      console.error("Logout API call failed:", error);
    }
  }

  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("user");
}

export function getCurrentUser(): User | null {
  const userJson = localStorage.getItem("user");
  if (!userJson) return null;
  try {
    return JSON.parse(userJson) as User;
  } catch {
    return null;
  }
}

export function updateStoredUser(user: User) {
  localStorage.setItem("user", JSON.stringify(user));
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem("accessToken");
}

export function canManageEmployeeAccounts(user: User | null | undefined) {
  return user?.role === "ADMIN" || user?.role === "MANAGER";
}

export function canEditEmployeeAccounts(user: User | null | undefined) {
  return user?.role === "ADMIN";
}
