import { useState, useEffect, useCallback } from "react";
import * as tabPermissionService from "@/services/tabPermissionService";
import { useAuth } from "@/contexts/AuthContext";

interface TabPermission {
  tab_key: string;
  enabled: boolean;
}

export function useTabPermissions() {
  const { role, userId } = useAuth();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (role === "admin") {
      setPermissions({});
      setIsLoading(false);
      return;
    }

    const load = async () => {
      try {
        const data = await tabPermissionService.getMyTabPermissions();
        const map: Record<string, boolean> = {};
        (data || []).forEach((d: TabPermission) => {
          map[d.tab_key] = d.enabled;
        });
        setPermissions(map);
      } catch {
        setPermissions({});
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [role, userId]);

  const isTabEnabled = useCallback(
    (tabKey: string): boolean => {
      if (role === "admin") return true;
      return permissions[tabKey] !== false;
    },
    [role, permissions]
  );

  return { isTabEnabled, isLoading, permissions };
}

export function useAdminTabPermissions() {
  const [defaults, setDefaults] = useState<Record<string, Record<string, boolean>>>({});
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const rows = await tabPermissionService.listTabDefaults();
      const map: Record<string, Record<string, boolean>> = { dropshipper: {}, vendor: {} };
      for (const r of rows) {
        const role = r.role as "vendor" | "dropshipper";
        if (role === "vendor" || role === "dropshipper") {
          if (!map[role]) map[role] = {};
          map[role][r.tabKey] = r.enabled;
        }
      }
      setDefaults(map);
    } catch {
      setDefaults({ dropshipper: {}, vendor: {} });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleDefault = async (role: "dropshipper" | "vendor", tabKey: string, enabled: boolean) => {
    try {
      await tabPermissionService.upsertTabDefault(role, tabKey, enabled);
      setDefaults((prev) => ({
        ...prev,
        [role]: { ...prev[role], [tabKey]: enabled },
      }));
      return { error: undefined as Error | undefined };
    } catch (e) {
      return { error: e instanceof Error ? e : new Error("Failed") };
    }
  };

  return { defaults, isLoading, toggleDefault, reload: load };
}

export function useUserTabPermissions(userId: string | null, role: "dropshipper" | "vendor") {
  const [userPerms, setUserPerms] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }
    try {
      const data = await tabPermissionService.listUserTabOverrides(userId, role);
      const map: Record<string, boolean> = {};
      (data || []).forEach((d: TabPermission) => {
        map[d.tab_key] = d.enabled;
      });
      setUserPerms(map);
    } catch {
      setUserPerms({});
    } finally {
      setIsLoading(false);
    }
  }, [userId, role]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleUserPerm = async (tabKey: string, enabled: boolean) => {
    if (!userId) return { error: new Error("No user") };
    try {
      await tabPermissionService.upsertUserTabOverride({ userId, role, tabKey, enabled });
      setUserPerms((prev) => ({ ...prev, [tabKey]: enabled }));
      return { error: undefined as Error | undefined };
    } catch (e) {
      return { error: e instanceof Error ? e : new Error("Failed") };
    }
  };

  const resetUserPerms = async () => {
    if (!userId) return;
    await tabPermissionService.resetUserTabOverrides(userId, role);
    setUserPerms({});
  };

  return { userPerms, isLoading, toggleUserPerm, resetUserPerms, reload: load };
}
