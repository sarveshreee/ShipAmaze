import { afterEach, describe, expect, it } from "vitest";
import { buildNodemailerTransportOptions, resolveSmtp } from "./emailClient.js";

describe("emailClient", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("buildNodemailerTransportOptions uses explicit Gmail SMTP with IPv4 and timeouts", () => {
    process.env.EMAIL_FROM = "user@gmail.com";
    process.env.EMAIL_PASS = "app-password";
    const cfg = resolveSmtp();
    expect(cfg?.kind).toBe("gmail");

    const opts = buildNodemailerTransportOptions(cfg!);
    expect(opts.host).toBe("smtp.gmail.com");
    expect(opts.port).toBe(587);
    expect(opts.secure).toBe(false);
    expect(opts.family).toBe(4);
    expect(opts.connectionTimeout).toBe(30_000);
    expect(opts.requireTLS).toBe(true);
  });

  it("buildNodemailerTransportOptions supports Gmail SSL port 465", () => {
    process.env.GMAIL_SMTP_PORT = "465";
    const opts = buildNodemailerTransportOptions({
      kind: "gmail",
      from: "ShipAmaze <user@gmail.com>",
      auth: { user: "user@gmail.com", pass: "secret" },
    });
    expect(opts.port).toBe(465);
    expect(opts.secure).toBe(true);
  });
});
