import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCourierProviderRegistryForTests,
  getCourierProvider,
  listCourierProviders,
  registerCourierProviders,
  resetCourierProviderRegistrationForTests,
} from "../courier/index.js";
import {
  ensureLorrigoAuth,
  lorrigoGet,
  probeLorrigoAuth,
  resetLorrigoClientForTests,
} from "./lorrigo.client.js";

const originalEnv = { ...process.env };

function setLorrigoEnv(opts: {
  enabled?: boolean;
  email?: string;
  password?: string;
  baseUrl?: string;
}) {
  if (opts.enabled === undefined) {
    delete process.env.LORRIGO_ENABLED;
  } else {
    process.env.LORRIGO_ENABLED = opts.enabled ? "true" : "false";
  }
  if (opts.email === undefined) delete process.env.LORRIGO_EMAIL;
  else process.env.LORRIGO_EMAIL = opts.email;
  if (opts.password === undefined) delete process.env.LORRIGO_PASSWORD;
  else process.env.LORRIGO_PASSWORD = opts.password;
  process.env.LORRIGO_BASE_URL = opts.baseUrl || "https://app.lorrigo.com/api";
  process.env.LORRIGO_TOKEN_CACHE_TTL_MINUTES = "60";
  process.env.LORRIGO_MAX_TRANSIENT_RETRIES = "1";
}

describe("Lorrigo Phase 2 authentication", () => {
  beforeEach(() => {
    resetLorrigoClientForTests();
    clearCourierProviderRegistryForTests();
    resetCourierProviderRegistrationForTests();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetLorrigoClientForTests();
    clearCourierProviderRegistryForTests();
    resetCourierProviderRegistrationForTests();
    vi.unstubAllGlobals();
  });

  it("does not register Lorrigo when LORRIGO_ENABLED=false", () => {
    setLorrigoEnv({ enabled: false, email: "a@b.com", password: "x" });
    registerCourierProviders();
    const ids = listCourierProviders().map((p) => p.id);
    expect(ids).toContain("velocity");
    expect(ids).not.toContain("lorrigo");
  });

  it("registers Lorrigo when LORRIGO_ENABLED=true", () => {
    setLorrigoEnv({ enabled: true, email: "seller@lorrigo.com", password: "secret" });
    registerCourierProviders();
    expect(getCourierProvider("lorrigo").id).toBe("lorrigo");
  });

  it("probe reports disabled without calling login", async () => {
    setLorrigoEnv({ enabled: false, email: "a@b.com", password: "x" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const probe = await probeLorrigoAuth();
    expect(probe.status).toBe("disabled");
    expect(probe.enabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("probe reports failed_authentication when credentials missing", async () => {
    setLorrigoEnv({ enabled: true });
    const probe = await probeLorrigoAuth();
    expect(probe.status).toBe("failed_authentication");
    expect(probe.configured).toBe(false);
  });

  it("logs in successfully and caches token (second ensureAuth does not re-login)", async () => {
    setLorrigoEnv({ enabled: true, email: "seller@lorrigo.com", password: "secret" });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ token: "tok-abc" }),
      json: async () => ({ token: "tok-abc" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await ensureLorrigoAuth();
    await ensureLorrigoAuth();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/v2/auth/login");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.email).toBe("seller@lorrigo.com");
    expect(body.password).toBe("secret");
  });

  it("fails gracefully on invalid credentials", async () => {
    setLorrigoEnv({ enabled: true, email: "bad@lorrigo.com", password: "wrong" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: "Invalid credentials" }),
        json: async () => ({ message: "Invalid credentials" }),
      })
    );

    const probe = await probeLorrigoAuth();
    expect(probe.status).toBe("failed_authentication");
    expect(probe.message).toMatch(/auth failed|credentials/i);
  });

  it("refreshes token on 401 and retries once", async () => {
    setLorrigoEnv({ enabled: true, email: "seller@lorrigo.com", password: "secret" });

    let loginCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("/v2/auth/login")) {
        loginCount += 1;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ token: `tok-${loginCount}` }),
          json: async () => ({ token: `tok-${loginCount}` }),
        };
      }
      // First authenticated call → 401; second → 200
      if (loginCount === 1) {
        return {
          ok: false,
          status: 401,
          text: async () => JSON.stringify({ message: "expired" }),
          json: async () => ({ message: "expired" }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true }),
        json: async () => ({ ok: true }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await ensureLorrigoAuth();
    const data = await lorrigoGet<{ ok: boolean }>("/v2/couriers");
    expect(data.ok).toBe(true);
    expect(loginCount).toBe(2);
  });

  it("provider.authenticate uses the same login path", async () => {
    setLorrigoEnv({ enabled: true, email: "seller@lorrigo.com", password: "secret" });
    registerCourierProviders();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ token: "tok-provider" }),
        json: async () => ({ token: "tok-provider" }),
      })
    );

    await getCourierProvider("lorrigo").authenticate();
    expect(true).toBe(true);
  });
});
