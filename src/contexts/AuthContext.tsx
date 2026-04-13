import { useState, createContext, useContext, ReactNode, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Role = "admin" | "vendor" | "dropshipper";

interface AuthContextType {
  isAuthenticated: boolean;
  role: Role;
  userName: string;
  userId: string | null;
  isLoading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<{ error?: string }>;
  signupWithEmail: (email: string, password: string, fullName: string, businessName: string, phone: string, role: Role) => Promise<{ error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  role: "admin",
  userName: "",
  userId: null,
  isLoading: true,
  loginWithEmail: async () => ({}),
  signupWithEmail: async () => ({}),
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<Role>("admin");
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        setIsAuthenticated(true);

        // Fetch role and profile
        setTimeout(async () => {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', session.user.id)
            .single();
          
          if (roleData) {
            setRole(roleData.role as Role);
          }

          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('user_id', session.user.id)
            .single();
          
          setUserName(profile?.full_name || session.user.email?.split('@')[0] || 'User');
        }, 0);
      } else {
        setIsAuthenticated(false);
        setUserId(null);
        setUserName("");
      }
      setIsLoading(false);
    });

    supabase.auth.getSession();

    return () => subscription.unsubscribe();
  }, []);

  const loginWithEmail = async (email: string, password: string): Promise<{ error?: string }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  };

  const signupWithEmail = async (
    email: string, password: string, fullName: string, businessName: string, phone: string, selectedRole: Role
  ): Promise<{ error?: string }> => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName, role: selectedRole },
      },
    });
    if (error) return { error: error.message };

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ business_name: businessName, phone }).eq('user_id', user.id);
    }

    return {};
  };

  const logout = () => {
    supabase.auth.signOut();
    setIsAuthenticated(false);
    setUserId(null);
    setUserName("");
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, role, userName, userId, isLoading, loginWithEmail, signupWithEmail, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
