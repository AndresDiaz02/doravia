import { createHash, randomBytes } from "node:crypto";

const REGISTRATION_SECRET_TTL_MS = 30 * 60 * 1000;

export function createRegistrationSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRegistrationSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function registrationSecretExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + REGISTRATION_SECRET_TTL_MS);
}
