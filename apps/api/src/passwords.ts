// Passwords, kept as scrypt hashes: "scrypt$N$r$p$salt$hash" (base64). The
// cost (N = 2^15, r = 8, p = 3: 32 MB, about a tenth of a second on a
// Raspberry Pi) is one OWASP recommends; a stored hash keeps its own, so it
// can be raised later.
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const COST = { N: 2 ** 15, r: 8, p: 3 };
const KEY_LENGTH = 32;

function derive(password: string, salt: Buffer, options: { N: number; r: number; p: number }): Promise<Buffer> {
  const settings: ScryptOptions = { ...options, maxmem: 256 * options.N * options.r * options.p + 1024 * 1024 };
  return new Promise((resolve, reject) => scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, settings, (error, key) => error ? reject(error) : resolve(key)));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST);
  return `scrypt$${COST.N}$${COST.r}$${COST.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, N, r, p, salt, hash] = stored.split("$");
  if(kind !== "scrypt" || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await derive(password, Buffer.from(salt, "base64"), { N: Number(N), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** a hash of nothing: checked when the user does not exist, so it takes as long */
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString("hex"));
