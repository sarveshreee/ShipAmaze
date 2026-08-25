/**
 * Share the current tab session with newly opened tabs, but require login
 * again after every tab/window of the app has been closed.
 *
 * Tokens stay in sessionStorage (cleared when the tab closes). A new tab
 * asks any still-open tab for a copy via BroadcastChannel + localStorage.
 */

const AUTH_KEYS = [
  "shipamaze_token",
  "shipamaze_user",
  "adminToken",
  "shipamaze_impersonation_return",
] as const;

const CHANNEL = "shipamaze-auth";
const REQUEST_KEY = "shipamaze_session_request";
const RESPONSE_KEY = "shipamaze_session_response";
const RESTORE_MS = 220;

type SessionKeys = Partial<Record<(typeof AUTH_KEYS)[number], string>>;

function readSessionKeys(): SessionKeys | null {
  const token = sessionStorage.getItem("shipamaze_token");
  if (!token) return null;
  const keys: SessionKeys = { shipamaze_token: token };
  for (const k of AUTH_KEYS) {
    if (k === "shipamaze_token") continue;
    const v = sessionStorage.getItem(k);
    if (v) keys[k] = v;
  }
  return keys;
}

function writeSessionKeys(keys: SessionKeys) {
  for (const k of AUTH_KEYS) {
    const v = keys[k];
    if (v) sessionStorage.setItem(k, v);
  }
}

let shareListenerStarted = false;

/** Existing tabs answer "give me the session" from newly opened tabs. */
export function startSessionShareListener() {
  if (shareListenerStarted || typeof window === "undefined") return;
  shareListenerStarted = true;

  const reply = () => readSessionKeys();

  if ("BroadcastChannel" in window) {
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (ev: MessageEvent) => {
      const data = ev.data as { type?: string } | null;
      if (data?.type === "request-session") {
        const keys = reply();
        if (keys) ch.postMessage({ type: "session", keys });
        return;
      }
      if (data?.type === "logout") {
        for (const k of AUTH_KEYS) sessionStorage.removeItem(k);
        const pathOnly = window.location.pathname;
        if (!/^\/(login|signup|forgot-password|verify-email)(\/|$)/i.test(pathOnly)) {
          window.location.replace(`${window.location.origin}/login`);
        }
      }
    };
  }

  window.addEventListener("storage", (e) => {
    if (e.key !== REQUEST_KEY || !e.newValue) return;
    const keys = reply();
    if (!keys) return;
    localStorage.setItem(RESPONSE_KEY, JSON.stringify({ requestId: e.newValue, keys }));
    localStorage.removeItem(RESPONSE_KEY);
  });
}

/**
 * If this tab has no token, ask other open tabs to copy theirs.
 * Resolves immediately on reload (sessionStorage already populated).
 */
export function restoreSharedSession(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (sessionStorage.getItem("shipamaze_token")) {
    startSessionShareListener();
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener("storage", onStorage);
      startSessionShareListener();
      resolve();
    };

    const apply = (keys: SessionKeys | undefined) => {
      if (!keys?.shipamaze_token) return;
      writeSessionKeys(keys);
      finish();
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key !== RESPONSE_KEY || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue) as { keys?: SessionKeys };
        apply(parsed.keys);
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("storage", onStorage);

    let ch: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      ch = new BroadcastChannel(CHANNEL);
      ch.onmessage = (ev: MessageEvent) => {
        const data = ev.data as { type?: string; keys?: SessionKeys } | null;
        if (data?.type === "session") apply(data.keys);
      };
      ch.postMessage({ type: "request-session" });
    }

    try {
      localStorage.setItem(REQUEST_KEY, String(Date.now()));
    } catch {
      /* private mode */
    }

    window.setTimeout(() => {
      ch?.close();
      finish();
    }, RESTORE_MS);
  });
}

export function notifyTabsLoggedOut() {
  if (typeof window === "undefined") return;
  try {
    if ("BroadcastChannel" in window) {
      const ch = new BroadcastChannel(CHANNEL);
      ch.postMessage({ type: "logout" });
      ch.close();
    }
  } catch {
    /* ignore */
  }
}
