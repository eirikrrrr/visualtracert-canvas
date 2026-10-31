// The images that are virtual machines (RouterOS): built on this server, in
// the manner of vrnetlab, from the emulator's vrnetlab/<dir> (a Dockerfile,
// the launcher that wires and configures the machine, its CLI scripts). The
// build downloads the vendor's disk image, for this server's architecture.
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fnv1a, IMAGES } from "@visual-tracert/model";
import { docker } from "./docker";
import { tar } from "./tar";

const DIR = process.env.VRNETLAB_DIR ?? fileURLToPath(new URL("./vrnetlab/", import.meta.url));

/** what a machine's container needs of the host: tap NICs, and KVM if there is */
export const vmDevices = () => ["/dev/net/tun", ...(existsSync("/dev/kvm") ? ["/dev/kvm"] : [])]
  .map(path => ({ PathOnHost: path, PathInContainer: path, CgroupPermissions: "rwm" }));

// the image says which context it was built from: a newer emulator (a
// changed launcher) builds it again, though its tag is the same; and its
// containers say it too (they carry its labels), so an older one is known
export const HASH = "visual-tracert.vrnetlab-hash";

async function contextOf(dir: string): Promise<Record<string, string>> {
  const root = join(DIR, dir);
  const entries = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isFile()).sort((p, q) => p.name.localeCompare(q.name));
  return Object.fromEntries(await Promise.all(entries.map(async ({ name }) => [name, await readFile(join(root, name), "utf8")] as const)));
}

const hashes = new Map<string, Promise<string>>();

/** the hash of the context a machine's image is built from now */
export function contextHash(dir: string): Promise<string> {
  if(!hashes.has(dir)) hashes.set(dir, contextOf(dir).then(files => fnv1a(JSON.stringify(files))));
  return hashes.get(dir)!;
}

/** an image ready to run: built here (a machine), or pulled */
export async function ensureImage(ref: string): Promise<void> {
  const own = Object.values(IMAGES).find(info => info.ref === ref && info.vrnetlab);
  if(!own) return docker.ensureImage(ref);
  const files = await contextOf(own.vrnetlab!);
  const hash = await contextHash(own.vrnetlab!);
  const image = await docker.image(ref) as { Config?: { Labels?: Record<string, string> } } | null;
  if(image?.Config?.Labels?.[HASH] === hash) return;
  const built = await docker.build(ref, tar(files), { [HASH]: hash });
  if(!built.ok) throw new Error(built.log.trim().split("\n").slice(-6).join("\n"));
}
