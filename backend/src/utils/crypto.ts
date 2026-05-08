import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

function getKey(): Buffer {
  const enc = process.env.ENCRYPTION_SECRET?.trim();
  if (enc) return scryptSync(enc, "shipamaze-salt", 32) as Buffer;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_SECRET is required in production for token encryption");
  }
  const dev = process.env.JWT_SECRET?.trim() || "dev-only-encryption-fallback";
  return scryptSync(dev, "shipamaze-salt", 32) as Buffer;
}

export function encrypt(text: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(encryptedText: string): string {
  const [ivHex, encHex] = encryptedText.split(":");
  if (!ivHex || !encHex) throw new Error("Invalid encrypted format");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
