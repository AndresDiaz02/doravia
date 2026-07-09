import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const KEY_LEN = 32; // bytes

function getMasterKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? "";
  if (!raw) throw new Error("ENCRYPTION_KEY no configurada — necesaria para cifrar credenciales Plemsi.");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_LEN) throw new Error(`ENCRYPTION_KEY debe ser 32 bytes en base64 (recibido: ${buf.length} bytes).`);
  return buf;
}

export function encrypt(text: string): string {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // formato: iv(12):tag(16):ciphertext — todo en hex concatenado con ":"
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(stored: string): string {
  // Si no está en formato cifrado (migración legacy — texto plano), devuélvelo tal cual
  if (!stored.includes(":")) return stored;
  const [ivHex, tagHex, cipherHex] = stored.split(":");
  if (!ivHex || !tagHex || !cipherHex) throw new Error("Formato de credencial inválido.");
  const key = getMasterKey();
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(cipherHex, "hex");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}
