import { useState, createContext, useContext, ReactNode, useEffect, useCallback } from "react";
import {
  getStoredToken,
  setStoredToken,
  getAdminToken,
  setAdminToken,
  clearAdminToken,
  getStoredUserJson,
  setStoredUserJson,
  ApiError,
} from "@/lib/apiClient";
import { clearUserScopedQueries, queryClient, queryKeys, resetSessionQueries } from "@/lib/queryClient";
import * as authService from "@/services/authService";
import type { AuthUser, SignupRole, UserRole } from "@/services/authService";

interface AuthContextType {
  isAuthenticated: boolean;
  user: AuthUser | null;
  role: UserRole;
  userName: string;
  userId: string | null;
  isLoading: boolean;
  /** True when viewing the app as another user via admin impersonation. */
  isImpersonating: boolean;
  loginWithEmail: (email: string, password: string) => Promise<{ error?: string; user?: AuthUser }>;
  signupWithEmail: (
    email: string,
    password: string,
    fullName: string,
    businessName: string,
    phone: string,
    role: SignupRole
  ) => Promise<{ error?: string; user?: AuthUser; needsVerification?: boolean; verifyEmail?: string }>;
  logout: () => void;
  /** Replace session user from API (e.g. after profile save). */
  applyUser: (u: AuthUser) => void;
  /** Reload user from GET /auth/profile */
  refreshUser: () => Promise<void>;
  /**
   * Switch into a target user session. Stashes the current admin JWT as adminToken,
   * installs the impersonation token, and updates auth state — no login page.
   */
  startImpersonation: (token: string, user: AuthUser) => void;
  /**
   * Restore the stashed admin JWT, refresh auth state, and return to admin dashboard.
   * Returns the restored admin user (or null if restore failed).
   */
  stopImpersonation: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  user: null,
  role: "admin",
  userName: "",
  userId: null,
  isLoading: true,
  isImpersonating: false,
  loginWithEmail: async () => ({}),
  signupWithEmail: async () => ({}),
  logout: () => {},
  applyUser: () => {},
  refreshUser: async () => {},
  startImpersonation: () => {},
  stopImpersonation: async () => null,
});

export const useAuth = () => useContext(AuthContext);

function errMessage(e: unknown) {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

function parseStoredUser(): AuthUser | null {
  const raw = getStoredUserJson();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

async function prefetchDashboard(userId: string) {
  try {
    const { apiRequest } = await import("@/lib/apiClient");
    await queryClient.prefetchQuery({
      queryKey: queryKeys.dashboard(userId),
      queryFn: () => apiRequest<Record<string, unknown>>("/dashboard/summary"),
      staleTime: 60 * 1000,
    });
  } catch {
    /* non-blocking */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => parseStoredUser());
  const [isLoading, setIsLoading] = useState(() => !!getStoredToken() && !parseStoredUser());
  const [isImpersonating, setIsImpersonating] = useState(() => !!getAdminToken());

  useEffect(() => {
    if (!getStoredToken()) {
      setIsLoading(false);
      setIsImpersonating(!!getAdminToken());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { user: u } = await authService.getCurrentUser();
        if (!cancelled) {
          setUser(u);
          setStoredUserJson(JSON.stringify(u));
          queryClient.setQueryData(queryKeys.profile(u.id), { user: u });
          setIsImpersonating(!!getAdminToken() || !!u.isImpersonation);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setStoredUserJson(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = () => {
      setUser(null);
      setStoredUserJson(null);
      setIsImpersonating(false);
    };
    window.addEventListener("shipamaze:unauthorized", handler);
    return () => window.removeEventListener("shipamaze:unauthorized", handler);
  }, []);

  const loginWithEmail = async (email: string, password: string) => {
    try {
      clearAdminToken();
      setIsImpersonating(false);
      const { user: u } = await authService.login(email, password);
      clearUserScopedQueries();
      queryClient.setQueryData(queryKeys.profile(u.id), { user: u });
      setUser(u);
      void prefetchDashboard(u.id);
      return { user: u };
    } catch (e: unknown) {
      return { error: errMessage(e) };
    }
  };

  const signupWithEmail = async (
    email: string,
    password: string,
    fullName: string,
    businessName: string,
    phone: string,
    role: SignupRole
  ) => {
    try {
      const res = await authService.register({
        email,
        password,
        name: fullName,
        role,
        companyName: businessName,
        phone,
        termsAccepted: role === "dropshipper" ? true : undefined,
      });
      if ("needsEmailVerification" in res && res.needsEmailVerification) {
        return { needsVerification: true, verifyEmail: res.user.email, user: res.user };
      }
      if ("token" in res && res.token) {
        const u = res.user;
        setUser(u);
        setStoredUserJson(JSON.stringify(u));
        return { user: u };
      }
      return { error: "Unexpected registration response" };
    } catch (e: unknown) {
      return { error: errMessage(e) };
    }
  };

  const logout = () => {
    void authService.logout().finally(() => {
      resetSessionQueries();
      setUser(null);
      setStoredUserJson(null);
      setIsImpersonating(false);
      const pathOnly = window.location.pathname;
      if (!/^\/(login|signup|verify-email)(\/|$)/i.test(pathOnly)) {
        window.location.replace(`${window.location.origin}/login`);
      }
    });
  };

  const applyUser = (u: AuthUser) => {
    setUser(u);
    setStoredUserJson(JSON.stringify(u));
    queryClient.setQueryData(queryKeys.profile(u.id), { user: u });
    setIsImpersonating(!!getAdminToken() || !!u.isImpersonation);
  };

  const refreshUser = async () => {
    try {
      const { user: u } = await authService.getCurrentUser();
      setUser(u);
      setStoredUserJson(JSON.stringify(u));
      queryClient.setQueryData(queryKeys.profile(u.id), { user: u });
      setIsImpersonating(!!getAdminToken() || !!u.isImpersonation);
    } catch {
      setUser(null);
      setStoredUserJson(null);
      setIsImpersonating(false);
    }
  };

  const startImpersonation = useCallback((token: string, nextUser: AuthUser) => {
    const current = getStoredToken();
    if (!current) {
      throw new Error("No admin session to stash for impersonation");
    }
    setAdminToken(current);
    setStoredToken(token);
    clearUserScopedQueries();
    setUser(nextUser);
    setStoredUserJson(JSON.stringify(nextUser));
    setIsImpersonating(true);
  }, []);

  const stopImpersonation = useCallback(async (): Promise<AuthUser | null> => {
    const adminJwt = getAdminToken();
    if (!adminJwt) {
      setIsImpersonating(false);
      return null;
    }
    setStoredToken(adminJwt);
    clearAdminToken();
    setIsImpersonating(false);
    clearUserScopedQueries();
    try {
      const { user: u } = await authService.getCurrentUser();
      setUser(u);
      setStoredUserJson(JSON.stringify(u));
      return u;
    } catch {
      setUser(null);
      setStoredUserJson(null);
      return null;
    }
  }, []);

  const value: AuthContextType = {
    isAuthenticated: !!user,
    user,
    role: user?.role ?? "admin",
    userName: user?.name ?? "",
    userId: user?.id ?? null,
    isLoading,
    isImpersonating,
    loginWithEmail,
    signupWithEmail,
    logout,
    applyUser,
    refreshUser,
    startImpersonation,
    stopImpersonation,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
