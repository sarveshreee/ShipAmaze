import { apiClient, setStoredToken } from "@/lib/apiClient";

export type UserRole = "admin" | "vendor" | "dropshipper";

/** Post-login home path for each role (used for redirects and guards). */
export function roleDashboardPath(role: UserRole): string {
  return `/${role}/dashboard`;
}

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
  return apiClient.get<{ user: AuthUser }>("/auth/profile");
}

export async function updateProfile(payload: {
  name?: string;
  phone?: string;
  companyName?: string;
  address?: string;
  avatarUrl?: string | null;
}) {
  return apiClient.patch<{ user: AuthUser }>("/auth/profile", payload);
}

export async function changePassword(payload: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  return apiClient.patch<{ ok: boolean }>("/auth/change-password", payload);
}

export async function requestPasswordReset(email: string) {
  return apiClient.post<{ ok: boolean; message: string }>("/auth/forgot-password", { email });
}

export async function resetPasswordWithOtp(payload: {
  email: string;
  otp: string;
  newPassword: string;
  confirmPassword: string;
}) {
  return apiClient.post<{ ok: boolean }>("/auth/reset-password", payload);
}
