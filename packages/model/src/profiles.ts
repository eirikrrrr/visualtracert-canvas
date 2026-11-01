// Image profiles: an image of the catalog with the user's own changes (the
// packages installed on it, commands run while it is built, commands run on
// each device when the lab starts). The emulator builds each one as a local
// image; a device chooses one with `profile:` in the document.
import { fnv1a } from "./topology";
import { spanish, type T } from "./i18n";
import { IMAGES, type ImageId } from "./images";

export interface ImageProfile {
  id: string;
  name: string;
  base: ImageId;
  description?: string;
  /** installed with the image's package manager (apk or apt) */
  packages: string[];
  /** shell commands run while the image is built (RUN) */
  setup: string[];
  /** shell commands run on each device once the lab is wired */
  startup: string[];
}

export const PROFILE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const PACKAGE = /^[A-Za-z0-9][A-Za-z0-9+._:=~-]{0,99}$/;
const MAX_LINES = 50;

/** the local image a profile is built as */
export const profileTag = (id: string) => `visual-tracert/profile-${id}:latest`;

/** what decides the built image: a changed one has to be built again */
export const profileHash = (profile: ImageProfile) =>
  fnv1a(JSON.stringify([IMAGES[profile.base].ref, profile.packages, profile.setup]));

export function dockerfileOf(profile: ImageProfile): string {
  const image = IMAGES[profile.base];
  const lines = [`FROM ${image.ref}`];
  if(profile.packages.length && image.packages === "apk") lines.push(`RUN apk add --no-cache ${profile.packages.join(" ")}`);
  if(profile.packages.length && image.packages === "apt"){
    lines.push(`RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ${profile.packages.join(" ")} && rm -rf /var/lib/apt/lists/*`);
  }
  // each command as written, one layer each: what fails is the line that says so
  for(const command of profile.setup) lines.push(`RUN ${command}`);
  lines.push(`LABEL visual-tracert.profile="${profile.id}" visual-tracert.profile-hash="${profileHash(profile)}"`);
  return lines.join("\n") + "\n";
}

const lines = (value: unknown) => (Array.isArray(value) ? value : typeof value === "string" ? value.split("\n") : [])
  .map(line => String(line).trim()).filter(Boolean);

/** A profile as it comes from the page, checked. */
export function checkProfile(raw: unknown, t: T = spanish): { profile: ImageProfile; problems: [] } | { profile: null; problems: string[] } {
  const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const problems: string[] = [];
  const id = String(item.id ?? "").trim();
  if(!PROFILE_ID.test(id)) problems.push(t("El id del perfil va en minúsculas, números y guiones (hasta 40)."));
  const name = String(item.name ?? "").trim();
  if(!name) problems.push(t("El perfil necesita un nombre."));
  const base = String(item.base ?? "") as ImageId;
  const image = IMAGES[base];
  if(!image || !Object.hasOwn(IMAGES, base)) problems.push(t("La imagen base \"{base}\" no existe.", { base }));
  const packages = lines(item.packages).flatMap(line => line.split(/[\s,]+/)).filter(Boolean);
  const wrong = packages.filter(name => !PACKAGE.test(name));
  if(wrong.length) problems.push(t("Paquetes con nombres no válidos: {packages}.", { packages: wrong.join(", ") }));
  if(packages.length && image && !image.packages) problems.push(t("{image} no tiene gestor de paquetes: usa otra imagen base.", { image: image.name }));
  const setup = lines(item.setup), startup = lines(item.startup);
  if(setup.length > MAX_LINES || startup.length > MAX_LINES || packages.length > 100) problems.push(t("Demasiadas líneas: como mucho {n} comandos.", { n: MAX_LINES }));
  if(problems.length) return { profile: null, problems };
  return {
    profile: {
      id, name, base,
      ...(item.description ? { description: String(item.description).trim() } : {}),
      packages: [...new Set(packages)], setup, startup,
    },
    problems: [],
  };
}

/** the image the emulator builds by itself (once) and runs every Alpine device
 * as, when a device has no profile of its own: Alpine with what the machines
 * need in medium difficulty — bridge (a switch's VLANs), dnsmasq (DHCP, DNS
 * and DHCP relay), httpd (a web server), tcpdump and dig */
export const LAB_PROFILE: ImageProfile = {
  id: "vt-lab",
  name: "Laboratorio (visual-tracert)",
  base: "alpine",
  description: "Alpine Linux con iproute2 (bridge), dnsmasq, httpd, tcpdump y dig.",
  packages: ["iproute2", "dnsmasq", "busybox-extras", "tcpdump", "bind-tools"],
  setup: [],
  startup: [],
};
