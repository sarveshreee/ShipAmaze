import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface TabPermission {
  tab_key: string;
  enabled: boolean;
}

export function useTabPermissions() {
  const { role, userId, isDemoMode } = useAuth();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isDemoMode || role === "admin") {
      // Admin sees everything, demo mode sees everything
      setPermissions({});
      setIsLoading(false);
      return;
    }

    const load = async () => {
      // Get defaults for role
      const { data: defaults } = await supabase
        .from("tab_permissions")
        .select("tab_key, enabled")
        .eq("role", role)
        .is("user_id", null);

      // Get user-specific overrides
      let userOverrides: TabPermission[] = [];
      if (userId) {
        const { data } = await supabase
          .from("tab_permissions")
          .select("tab_key, enabled")
          .eq("role", role)
          .eq("user_id", userId);
        userOverrides = (data || []) as TabPermission[];
      }

      const map: Record<string, boolean> = {};
      (defaults || []).forEach((d: TabPermission) => { map[d.tab_key] = d.enabled; });
      userOverrides.forEach((d: TabPermission) => { map[d.tab_key] = d.enabled; });
      setPermissions(map);
      setIsLoading(false);
    };

    load();
  }, [role, userId, isDemoMode]);

  const isTabEnabled = useCallback((tabKey: string): boolean => {
    if (role === "admin") return true;
    // If no permission record exists, default to enabled
    return permissions[tabKey] !== false;
  }, [role, permissions]);

  return { isTabEnabled, isLoading, permissions };
}

// Hook for admin to manage permissions
export function useAdminTabPermissions() {
  const [defaults, setDefaults] = useState<Record<string, Record<string, boolean>>>({});
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("tab_permissions")
      .select("*")
      .is("user_id", null);

    const map: Record<string, Record<string, boolean>> = { dropshipper: {}, vendor: {} };
    (data || []).forEach((d: any) => {
      if (!map[d.role]) map[d.role] = {};
      map[d.role][d.tab_key] = d.enabled;
    });
    setDefaults(map);
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleDefault = async (role: "dropshipper" | "vendor", tabKey: string, enabled: boolean) => {
    // Upsert using the unique constraint
    const { error } = await supabase.from("tab_permissions").upsert(
      { role, user_id: null, tab_key: tabKey, enabled },
      { onConflict: "role,tab_key" }
    );
    if (!error) {
      setDefaults(prev => ({
        ...prev,
        [role]: { ...prev[role], [tabKey]: enabled }
      }));
    }
    return { error };
  };

  return { defaults, isLoading, toggleDefault, reload: load };
}
