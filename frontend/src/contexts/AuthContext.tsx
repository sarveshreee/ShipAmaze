import { useState, createContext, useContext, ReactNode, useEffect } from "react";
import { getStoredToken, ApiError } from "@/lib/apiClient";
import { resetSessionQueries } from "@/lib/queryClient";
import * as authService from "@/services/authService";
import type { AuthUser, SignupRole, UserRole } from "@/services/authService";

interface AuthContextType {
  isAuthenticated: boolean;
  user: AuthUser | null;
  role: UserRole;
  userName: string;
  userId: string | null;
  isLoading: boolean;
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
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  user: null,
  role: "admin",
  userName: "",
  userId: null,
  isLoading: true,
  loginWithEmail: async () => ({}),
  signupWithEmail: async () => ({}),
  logout: () => {},
  applyUser: () => {},
  refreshUser: async () => {},
});

export const useAuth = () => useContext(AuthContext);

function errMessage(e: unknown) {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!getStoredToken()) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { user: u } = await authService.getCurrentUser();
        if (!cancelled) setUser(u);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = () => setUser(null);
    window.addEventListener("shipamaze:unauthorized", handler);
    return () => window.removeEventListener("shipamaze:unauthorized", handler);
  }, []);

  const loginWithEmail = async (email: string, password: string) => {
    try {
      const { user: u } = await authService.login(email, password);
      resetSessionQueries();
      setUser(u);
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
      const pathOnly = window.location.pathname;
      if (!/^\/(login|signup|verify-email)(\/|$)/i.test(pathOnly)) {
        window.location.replace(`${window.location.origin}/login`);
      }
    });
  };

  const applyUser = (u: AuthUser) => {
    setUser(u);
  };

  const refreshUser = async () => {
    try {
      const { user: u } = await authService.getCurrentUser();
      setUser(u);
    } catch {
      setUser(null);
    }
  };

  const value: AuthContextType = {
    isAuthenticated: !!user,
    user,
    role: user?.role ?? "admin",
    userName: user?.name ?? "",
    userId: user?.id ?? null,
    isLoading,
    loginWithEmail,
    signupWithEmail,
    logout,
    applyUser,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
