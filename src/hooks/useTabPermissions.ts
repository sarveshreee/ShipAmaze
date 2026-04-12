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
      setPermissions({});
      setIsLoading(false);
      return;
    }

    const load = async () => {
      const { data: defaults } = await supabase
        .from("tab_permissions")
        .select("tab_key, enabled")
        .eq("role", role)
        .is("user_id", null);

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

// Hook for admin to manage per-user permissions
export function useUserTabPermissions(userId: string | null, role: "dropshipper" | "vendor") {
  const [userPerms, setUserPerms] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setIsLoading(false); return; }
    const { data } = await supabase
      .from("tab_permissions")
      .select("tab_key, enabled")
      .eq("user_id", userId)
      .eq("role", role);

    const map: Record<string, boolean> = {};
    (data || []).forEach((d: any) => { map[d.tab_key] = d.enabled; });
    setUserPerms(map);
    setIsLoading(false);
  }, [userId, role]);

  useEffect(() => { load(); }, [load]);

  const toggleUserPerm = async (tabKey: string, enabled: boolean) => {
    if (!userId) return { error: new Error("No user") };
    // Delete existing then insert (partial unique index doesn't support upsert)
    await supabase
      .from("tab_permissions")
      .delete()
      .eq("user_id", userId)
      .eq("role", role)
      .eq("tab_key", tabKey);
    const { error } = await supabase.from("tab_permissions").insert(
      { role, user_id: userId, tab_key: tabKey, enabled }
    );
    if (!error) {
      setUserPerms(prev => ({ ...prev, [tabKey]: enabled }));
    }
    return { error };
  };

  const resetUserPerms = async () => {
    if (!userId) return;
    await supabase
      .from("tab_permissions")
      .delete()
      .eq("user_id", userId)
      .eq("role", role);
    setUserPerms({});
  };

  return { userPerms, isLoading, toggleUserPerm, resetUserPerms, reload: load };
}
