import { useState, createContext, useContext, ReactNode } from "react";

type Role = "admin" | "vendor" | "dropshipper";

interface AuthContextType {
  isAuthenticated: boolean;
  role: Role;
  login: (role: Role) => void;
  logout: () => void;
  userName: string;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  role: "admin",
  login: () => {},
  logout: () => {},
  userName: "",
});

export const useAuth = () => useContext(AuthContext);

const roleNames: Record<Role, string> = {
  admin: "Admin User",
  vendor: "Vendor User",
  dropshipper: "Seller User",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<Role>("admin");

  const login = (r: Role) => {
    setRole(r);
    setIsAuthenticated(true);
  };
  const logout = () => setIsAuthenticated(false);

  return (
    <AuthContext.Provider value={{ isAuthenticated, role, login, logout, userName: roleNames[role] }}>
      {children}
    </AuthContext.Provider>
  );
}
