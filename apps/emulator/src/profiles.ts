// The image profiles of this server: kept in a JSON file (a volume, so they
// outlive the emulator's container) and built as local images. A profile's
// state says whether its image is there and built from what it says now.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dockerfileOf, IMAGES, profileHash, profileTag, type ImageProfile } from "@visual-tracert/model";
import { docker } from "./docker";
import { tar } from "./tar";

const FILE = join(process.env.DATA_DIR ?? "/data", "profiles.json");

export type ProfileState = "built" | "outdated" | "missing";

export interface ProfileStatus {
  profile: ImageProfile;
  state: ProfileState;
  size?: number;
}

export async function loadProfiles(): Promise<ImageProfile[]> {
  try{
    const saved = JSON.parse(await readFile(FILE, "utf8"));
    return Array.isArray(saved) ? saved : [];
  }catch(_){
    return [];
  }
}

// one change of the file at a time
let writing: Promise<unknown> = Promise.resolve();
function change(update: (profiles: ImageProfile[]) => ImageProfile[]): Promise<ImageProfile[]> {
  const next = writing.catch(() => undefined).then(async () => {
    const profiles = update(await loadProfiles());
    await mkdir(join(FILE, ".."), { recursive: true });
    await writeFile(`${FILE}.tmp`, JSON.stringify(profiles, null, 2));
    await rename(`${FILE}.tmp`, FILE);
    return profiles;
  });
  writing = next;
  return next;
}

export const saveProfile = (profile: ImageProfile) =>
  change(profiles => [...profiles.filter(item => item.id !== profile.id), profile].sort((p, q) => p.name.localeCompare(q.name)));

export async function removeProfile(id: string): Promise<void> {
  await change(profiles => profiles.filter(item => item.id !== id));
  await docker.removeImage(profileTag(id)).catch(() => undefined);
}

export async function profileStatus(profile: ImageProfile): Promise<ProfileStatus> {
  const image = await docker.image(profileTag(profile.id));
  if(!image) return { profile, state: "missing" };
  const hash = (image as { Config?: { Labels?: Record<string, string> } }).Config?.Labels?.["visual-tracert.profile-hash"];
  return { profile, state: hash === profileHash(profile) ? "built" : "outdated", size: image.Size };
}

export async function buildProfile(profile: ImageProfile): Promise<{ ok: boolean; log: string }> {
  await docker.ensureImage(IMAGES[profile.base].ref);
  return docker.build(profileTag(profile.id), tar({ Dockerfile: dockerfileOf(profile) }));
}
