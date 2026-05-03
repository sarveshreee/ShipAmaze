import { apiClient, setStoredToken } from "@/lib/apiClient";

export type UserRole = "admin" | "vendor" | "dropshipper";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  permissions: string[];
  companyName: string;
  phone: string;
  address: string;
  avatarUrl: string | null;
}

export async function login(email: string, password: string) {
  const res = await apiClient.post<{ user: AuthUser; token: string }>("/auth/login", { email, password });
  setStoredToken(res.token);
  return res;
}

export async function register(payload: {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  companyName?: string;
  phone?: string;
}) {
  const res = await apiClient.post<{ user: AuthUser; token: string }>("/auth/register", payload);
  setStoredToken(res.token);
  return res;
}

export async function logout() {
  try {
    await apiClient.post("/auth/logout");
  } catch {
    /* offline */
  }
  setStoredToken(null);
}

export async function getCurrentUser() {
  return apiClient.get<{ user: AuthUser }>("/auth/me");
}

export async function updateProfile(payload: {
  name?: string;
  phone?: string;
  companyName?: string;
  address?: string;
  avatarUrl?: string | null;
}) {
  return apiClient.put<{ user: AuthUser }>("/users/profile", payload);
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return apiClient.post<{ ok: boolean }>("/auth/change-password", { currentPassword, newPassword });
}
