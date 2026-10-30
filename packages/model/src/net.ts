// IPv4 and MAC helpers shared by the editor, the document validation and the
// simulator.

export const BROADCAST_MAC = "ff:ff:ff:ff:ff:ff";

const IP_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const MAC_RE = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i;

export const isIp = (value: unknown): value is string => typeof value === "string" && IP_RE.test(value);
export const isMac = (value: unknown): value is string => typeof value === "string" && MAC_RE.test(value);

export function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc * 256 + Number(part)) >>> 0, 0);
}

export function intToIp(value: number): string {
  return [24, 16, 8, 0].map(shift => (value >>> shift) & 255).join(".");
}

export function maskOf(prefix: number): number {
  return prefix <= 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export function sameSubnet(a: string, b: string, prefix: number): boolean {
  const mask = maskOf(prefix);
  return ((ipToInt(a) & mask) >>> 0) === ((ipToInt(b) & mask) >>> 0);
}

/** "10.0.0.0/24" → { network, prefix } or null when it is not valid */
export function parseCidr(cidr: string): { network: string; prefix: number } | null {
  const [ip, length] = String(cidr).split("/");
  const prefix = Number(length);
  if(!isIp(ip) || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  return { network: intToIp((ipToInt(ip) & maskOf(prefix)) >>> 0), prefix };
}

export function inCidr(ip: string, cidr: string): boolean {
  const parsed = parseCidr(cidr);
  return Boolean(parsed) && sameSubnet(ip, parsed!.network, parsed!.prefix);
}

/** A locally administered unicast MAC ("02:…"), random */
export function randomMac(): string {
  const bytes = [0x02, ...Array.from({ length: 5 }, () => Math.floor(Math.random() * 256))];
  return bytes.map(byte => byte.toString(16).padStart(2, "0")).join(":");
}
