import { apiClient, setStoredToken } from "@/lib/apiClient";

export type UserRole = "admin" | "vendor" | "dropshipper";

/** Post-login dashboard/analytics path for each role. */
export function roleDashboardPath(role: UserRole): string {
  return `/${role}/dashboard`;
}

/** Marketplace / sidebar “Home” destination (matches AppLayout home link). */
export function roleHomePath(role: UserRole): string {
  if (role === "dropshipper") return "/dropshipper/home";
  return `/${role}/home`;
}

/** Sidebar “Add Order” page (dropshipper only; route exists in App.tsx). */
export function roleAddOrderPath(role: UserRole): string {
  return `/${role}/add-order`;
}

export type DropshipperAccessType = "FULL" | "RESTRICTED";

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
  /** False when signup verification is still required. */
  emailVerified?: boolean;
  /** Present for dropshipper accounts — RESTRICTED limits vendors/warehouses/processing. */
  dropshipperAccessType?: DropshipperAccessType;
}

export type RegisterResult =
  | { needsEmailVerification: true; message?: string; user: AuthUser }
  | { user: AuthUser; token: string };

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
}): Promise<RegisterResult> {
  const res = await apiClient.post<RegisterResult>("/auth/register", payload);
  if ("token" in res && res.token) setStoredToken(res.token);
  return res;
}

export async function verifyEmailOtp(email: string, otp: string) {
  const res = await apiClient.post<{ user: AuthUser; token: string }>("/auth/verify-email-otp", { email, otp });
  setStoredToken(res.token);
  return res;
}

export async function resendEmailVerificationOtp(email: string) {
  return apiClient.post<{ ok: boolean; message: string }>("/auth/resend-email-otp", { email });
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
