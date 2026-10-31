// A lab running for real: its plan executed (containers started, veth
// pairs moved into their namespaces, each device configured), its state read
// back from Docker, and the few commands a user can run on its devices. The
// containers carry the lab's labels, so the state survives a restart of the
// emulator and a lab can always be cleaned up.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { IMAGES, isIp, spanish, type ImageId, type ImageInfo, type T, type Topology } from "@visual-tracert/model";
import { docker, DockerError, type ContainerSummary } from "./docker";
import { LABELS, planLab, type LinkPlan, type NodePlan, type Plan, type ProfileCatalog } from "./plan";
import { loadProfiles, profileStatus } from "./profiles";
import { contextHash, ensureImage, HASH, vmDevices } from "./vrnetlab";

const run = promisify(execFile);
/** a host command (ip, nsenter): its error says what failed */
async function host(args: string[]): Promise<void> {
  try{
    await run(args[0], args.slice(1), { timeout: 30_000 });
  }catch(error){
    const detail = (error as { stderr?: string }).stderr?.trim() || (error as Error).message;
    throw new Error(`${args.slice(0, 4).join(" ")}: ${detail}`);
  }
}

// a device's container: small, without a network, stopped at once; it may
// change its own network (NET_ADMIN, in its namespace only) from its CLI.
// Temporary (--rm): stopped, it is gone with what it wrote, since the lab's
// configuration lives in its document and is applied at every deployment
const MB = 1024 * 1024;

/** whether images that need a privileged container (SR Linux) may run: off
 * unless the server says so, since a privileged container is root here */
export const ALLOW_PRIVILEGED = /^(1|true|yes|on)$/i.test(process.env.ALLOW_PRIVILEGED ?? "");

// one change of a lab at a time
const queues = new Map<string, Promise<unknown>>();
function serial<R>(lab: string, task: () => Promise<R>): Promise<R> {
  const next = (queues.get(lab) ?? Promise.resolve()).catch(() => undefined).then(task);
  queues.set(lab, next);
  return next;
}

export interface DeviceState {
  device: string;
  container: string;
  state: string;
  /** it runs an older build of its image (a machine's): deploying again updates it */
  outdated: boolean;
}

export interface LabState {
  lab: string;
  deployed: boolean;
  fingerprint: string | null;
  devices: DeviceState[];
}

const containersOf = (lab: string) => docker.list({ [LABELS.lab]: lab });

/** who deployed a lab: the account's id and its username */
export interface Owner { id: string; name: string }

/** what a lab's containers carry besides the lab: its time limit, its owner */
export interface Meta {
  expires?: number;
  owner?: Owner;
  /** false: its owner has no quota (an admin) */
  limited?: boolean;
}

const metaOf = (containers: ContainerSummary[]): Meta => {
  const labels = containers[0]?.Labels ?? {};
  const expires = Number(containers.find(item => item.Labels[LABELS.expires])?.Labels[LABELS.expires]) || undefined;
  return { expires, ...(labels[LABELS.owner] ? { owner: { id: labels[LABELS.owner], name: labels[LABELS.ownerName] ?? "" } } : {}) };
};

/** a lab's owner (undefined: nobody's, or it has no containers) */
export async function ownerOf(lab: string): Promise<Owner | undefined> {
  return metaOf(await containersOf(lab)).owner;
}

/** what one account may have running at once: labs, and containers in all of them */
export const QUOTA = {
  labs: Math.max(1, Number(process.env.MAX_LABS_PER_USER) || 3),
  containers: Math.max(1, Number(process.env.MAX_CONTAINERS_PER_USER) || 24),
};

export class QuotaError extends Error {}

/** refuses what would take an account past its quota: `adding` containers to
 * the lab (`fresh`: the lab is deployed anew, what it had does not count) */
async function checkQuota(lab: string, owner: Owner, adding: number, t: T, fresh: boolean): Promise<void> {
  const mine = await docker.list({ [LABELS.owner]: owner.id });
  const others = mine.filter(container => container.Labels[LABELS.lab] !== lab);
  const labs = new Set(others.map(container => container.Labels[LABELS.lab]));
  if(fresh && labs.size >= QUOTA.labs){
    throw new QuotaError(t("Ya tienes {n} laboratorios encendidos, el máximo: detén alguno antes de iniciar otro.", { n: labs.size }));
  }
  const used = others.length + (fresh ? 0 : mine.length - others.length);
  if(used + adding > QUOTA.containers){
    throw new QuotaError(t("Pasarías de {max} equipos encendidos entre todos tus laboratorios (tienes {n}): detén alguno.", { max: QUOTA.containers, n: used }));
  }
}

async function stateOf(lab: string, containers: ContainerSummary[]): Promise<LabState> {
  const devices = await Promise.all(containers.map(async container => {
    const own = IMAGES[container.Labels[LABELS.image] as ImageId]?.vrnetlab;
    return {
      device: container.Labels[LABELS.device],
      container: container.Names[0]?.replace(/^\//, "") ?? container.Id.slice(0, 12),
      state: container.State,
      outdated: Boolean(own) && container.Labels[HASH] !== await contextHash(own!),
    };
  }));
  return {
    lab,
    deployed: containers.length > 0,
    fingerprint: containers[0]?.Labels[LABELS.fingerprint] ?? null,
    devices: devices.sort((p, q) => p.device.localeCompare(q.device)),
  };
}

/** Stops the labs whose time is up (an exercise's), every so often: they go
 * even when no page is open to stop them. */
export function sweepExpired(every = 30_000): () => void {
  const sweep = async () => {
    try{
      const due = new Set((await docker.list({ [LABELS.expires]: null }))
        .filter(container => Number(container.Labels[LABELS.expires]) <= Date.now())
        .map(container => container.Labels[LABELS.lab]));
      for(const lab of due){
        await destroy(lab);
        console.log(`visual-tracert emulator: ${lab} stopped, its time is up`);
      }
    }catch(error){
      console.error(`visual-tracert emulator: sweep: ${(error as Error).message}`);
    }
  };
  const timer = setInterval(sweep, every);
  void sweep();
  return () => clearInterval(timer);
}

export interface RunningLab {
  lab: string;
  containers: number;
  running: number;
  owner?: Owner;
  expires?: number;
  /** when its first container was created, in ms since the epoch */
  since: number;
}

/** the labs that have containers on this server (only an account's, with
 * owner), with how many run, whose they are and since when */
export async function runningLabs(owner?: string): Promise<RunningLab[]> {
  const labs = new Map<string, RunningLab>();
  for(const container of await docker.list(owner ? { [LABELS.owner]: owner } : { [LABELS.lab]: null })){
    const lab = container.Labels[LABELS.lab];
    const entry = labs.get(lab) ?? { lab, containers: 0, running: 0, since: Infinity, ...metaOf([container]) };
    entry.containers += 1;
    if(container.State === "running") entry.running += 1;
    entry.since = Math.min(entry.since, Number(container.Created) * 1000 || Date.now());
    labs.set(lab, entry);
  }
  return [...labs.values()].sort((p, q) => p.lab.localeCompare(q.lab));
}

export async function status(lab: string): Promise<LabState> {
  return stateOf(lab, await containersOf(lab));
}

/** a container gone; a temporary one may be going already, on its own */
const removeOne = (id: string) => docker.remove(id).catch(error => {
  if(!(error instanceof DockerError && (error.status === 404 || error.status === 409))) throw error;
});

async function removeAll(lab: string): Promise<void> {
  await Promise.all((await containersOf(lab)).map(container => removeOne(container.Id)));
}

export function destroy(lab: string): Promise<LabState> {
  return serial(lab, async () => {
    await removeAll(lab);
    return status(lab);
  });
}

// the plan of a lab: the profiles it can use, and what this server allows
async function planOf(lab: string, topology: Topology, t: T, include: string[] = []): Promise<Plan> {
  const profiles: ProfileCatalog = new Map(await Promise.all((await loadProfiles()).map(async profile =>
    [profile.id, { profile, ready: (await profileStatus(profile)).state === "built" }] as const)));
  return planLab(lab, topology, t, profiles, { allowPrivileged: ALLOW_PRIVILEGED, include });
}

/** a device's container, created and started: its id, and its process as the host sees it */
async function startNode(lab: string, plan: Plan, node: NodePlan, meta: Meta): Promise<{ id: string; pid: number }> {
  const id = await docker.create(node.container, {
    Image: node.image,
    // a shell kept alive; or what the image runs (a server, a router's
    // daemons, a virtual machine's launcher)
    ...(node.run === "sleep" ? { Entrypoint: ["sleep"], Cmd: ["2147483647"] } : node.cmd ? { Cmd: node.cmd } : {}),
    ...(node.user ? { User: node.user } : {}),
    ...(node.env ? { Env: node.env } : {}),
    Hostname: node.hostname,
    Labels: {
      [LABELS.lab]: lab, [LABELS.device]: node.device, [LABELS.fingerprint]: plan.fingerprint, [LABELS.image]: node.imageId,
      ...(meta.expires ? { [LABELS.expires]: String(meta.expires) } : {}),
      ...(meta.owner ? { [LABELS.owner]: meta.owner.id, [LABELS.ownerName]: meta.owner.name } : {}),
    },
    HostConfig: {
      NetworkMode: "none", AutoRemove: true, Init: node.run !== "image", Memory: node.memory * MB, CapAdd: ["NET_ADMIN", ...node.caps], Privileged: node.privileged,
      ...(node.run === "vm" ? { Devices: vmDevices() } : {}),
    },
  });
  await docker.start(id);
  return { id, pid: await docker.pid(id) };
}

/** the cables: for each, a veth pair here and its ends moved into their
 * devices, all in a single ip process (ip -batch) */
function cables(links: LinkPlan[], pids: Map<string, number>): Promise<void> {
  if(!links.length) return Promise.resolve();
  const lines = links.flatMap(link => [
    `link add ${link.a.temp} type veth peer name ${link.b.temp}`,
    `link set ${link.a.temp} netns ${pids.get(link.a.device)}`,
    `link set ${link.b.temp} netns ${pids.get(link.b.device)}`,
  ]);
  return new Promise((resolve, reject) => {
    const child = execFile("ip", ["-batch", "-"], { timeout: 60_000 }, (error, _stdout, stderr) =>
      error ? reject(new Error(`ip -batch: ${stderr.trim() || error.message}`)) : resolve());
    child.stdin!.end(`${lines.join("\n")}\n`);
  });
}

// a route through a device that is stopped has no way out yet: it does not stop the rest
const lenient = (lines: string[]) => lines.map(line => `${line} || true`);

const inside = (pid: number | undefined, lines: string[]) => host(["nsenter", "-t", String(pid), "-n", "sh", "-ec", lines.join("\n")]);

/** what a device starts once wired: left running, it does not hold the lab */
async function startup(node: NodePlan, id: string | undefined): Promise<void> {
  if(node.startup.length && id) await docker.execDetached(id, ["/bin/sh", "-c", node.startup.join("\n")]);
}

/** builds the lab from its topology, after removing what was running; with
 * expires (ms since the epoch), it is stopped by itself then (sweep) */
export function deploy(lab: string, topology: Topology, t: T = spanish, meta: Meta = {}): Promise<LabState & { warnings: string[] }> {
  return serial(lab, async () => {
    const plan = await planOf(lab, topology, t);
    if(meta.owner && meta.limited !== false) await checkQuota(lab, meta.owner, plan.nodes.length, t, true);
    await removeAll(lab);
    for(const image of new Set(plan.nodes.map(node => node.image))) await ensureImage(image);
    const pids = new Map<string, number>();
    try{
      const ids = new Map<string, string>();
      await Promise.all(plan.nodes.map(async node => {
        const { id, pid } = await startNode(lab, plan, node, meta);
        ids.set(node.device, id);
        pids.set(node.device, pid);
      }));
      await cables(plan.links, pids);
      await Promise.all(plan.nodes.map(node => inside(pids.get(node.device), node.script)));
      await Promise.all(plan.nodes.map(node => startup(node, ids.get(node.device))));
    }catch(error){
      // whatever was half built goes: the ends still here, and the containers
      await Promise.all(plan.links.map(link => host(["ip", "link", "del", link.a.temp]).catch(() => undefined)));
      await removeAll(lab).catch(() => undefined);
      throw new Error(t("No se pudo desplegar el laboratorio: {error}", { error: (error as Error).message }));
    }
    return { ...(await status(lab)), warnings: plan.warnings };
  });
}

/** Starts or restarts some devices of a lab, the rest left running: their
 * containers made anew (started: only those not running), their cables to the
 * devices running, and at the other end of each one the port configured again
 * (its address, its bridge, its routes). A device starts this way even when its
 * topology does not start it. What runs must be the topology as it was
 * deployed: a changed one is applied by restarting the whole lab. */
export function relaunch(lab: string, topology: Topology, devices: string[], restart: boolean, t: T = spanish, limited = true): Promise<LabState & { warnings: string[] }> {
  return serial(lab, async () => {
    const containers = await containersOf(lab);
    const running = containers.filter(item => item.State === "running").map(item => item.Labels[LABELS.device]);
    // its time limit and its owner, for the devices made anew too
    const meta = metaOf(containers);
    // the plan of what runs and of these: their cables are between them
    const plan = await planOf(lab, topology, t, [...new Set([...running, ...devices])]);
    if(containers.length && containers[0].Labels[LABELS.fingerprint] !== plan.fingerprint) throw new Error(t("La topología cambió desde el despliegue: reinicia todo el laboratorio para aplicarla."));
    const chosen = plan.nodes.filter(node => devices.includes(node.device) && (restart || !running.includes(node.device)));
    if(!chosen.length){
      if(plan.nodes.some(node => devices.includes(node.device))) return { ...(await status(lab)), warnings: plan.warnings };
      throw new Error(t("Ninguno de esos equipos se puede iniciar en este laboratorio."));
    }
    if(meta.owner && limited) await checkQuota(lab, meta.owner, chosen.filter(node => !running.includes(node.device)).length, t, false);
    const names = new Set(chosen.map(node => node.device));
    for(const image of new Set(chosen.map(node => node.image))) await ensureImage(image);

    // gone, with their cables (both ends: a veth goes with its namespace)
    await Promise.all(containers.filter(container => names.has(container.Labels[LABELS.device])).map(container => removeOne(container.Id)));
    const pids = new Map<string, number>();
    for(const container of containers.filter(item => !names.has(item.Labels[LABELS.device]) && item.State === "running")){
      pids.set(container.Labels[LABELS.device], await docker.pid(container.Id));
    }
    // their cables; only to devices running
    const links = plan.links.filter(link => names.has(link.a.device) || names.has(link.b.device));
    try{
      const ids = new Map<string, string>();
      await Promise.all(chosen.map(async node => {
        const { id, pid } = await startNode(lab, plan, node, meta);
        ids.set(node.device, id);
        pids.set(node.device, pid);
      }));
      const wired = links.filter(link => pids.has(link.a.device) && pids.has(link.b.device));
      await cables(wired, pids);
      // their own script, on the ports they have (a cable to a stopped device is not there)
      await Promise.all(chosen.map(node => {
        const present = new Set(wired.flatMap(link => [link.a, link.b]).filter(end => end.device === node.device).map(end => end.ifname));
        const ports = Object.entries(node.ports).filter(([ifname]) => present.has(ifname)).flatMap(([, lines]) => lines);
        return inside(pids.get(node.device), [...node.base, ...ports, ...lenient(node.tail)]);
      }));
      // at the other end: the port again (once its old end is gone), then the tail
      const others = new Map<string, string[]>();
      for(const end of wired.flatMap(link => [link.a, link.b]).filter(end => !names.has(end.device))){
        others.set(end.device, [...others.get(end.device) ?? [], end.ifname]);
      }
      await Promise.all([...others].map(([device, ifnames]) => {
        const node = plan.nodes.find(item => item.device === device)!;
        return inside(pids.get(device), [
          ...ifnames.flatMap(ifname => [
            `i=0; while ip link show dev ${ifname} >/dev/null 2>&1 && [ $i -lt 100 ]; do i=$((i + 1)); sleep 0.1; done`,
            ...node.ports[ifname] ?? [],
            ...node.retap?.[ifname] ?? [],
          ]),
          ...lenient(node.tail),
        ]);
      }));
      await Promise.all(chosen.map(node => startup(node, ids.get(node.device))));
    }catch(error){
      await Promise.all(links.map(link => host(["ip", "link", "del", link.a.temp]).catch(() => undefined)));
      throw new Error(t("No se pudo iniciar: {error}", { error: (error as Error).message }));
    }
    return { ...(await status(lab)), warnings: plan.warnings };
  });
}

/** Stops some devices, the rest left running: their containers go (and with
 * them, the ends of their cables in the devices still running). */
export function stopDevices(lab: string, devices: string[]): Promise<LabState> {
  return serial(lab, async () => {
    const containers = (await containersOf(lab)).filter(container => devices.includes(container.Labels[LABELS.device]));
    await Promise.all(containers.map(container => removeOne(container.Id)));
    return status(lab);
  });
}

/** a device's IPv4 addresses as it has them now ("10.0.0.1/24"), by port */
export interface LiveAddress {
  /** its Linux name ("Gi0-0") */
  ifname: string;
  address: string;
}

/** The addresses the lab's running devices have now: what their CLI may have
 * changed, which the document does not say. Not those configured inside
 * their own system (RouterOS, SR Linux): their container has none of them. */
export async function liveAddresses(lab: string): Promise<Record<string, LiveAddress[]>> {
  const containers = (await containersOf(lab)).filter(container =>
    container.State === "running" && !IMAGES[container.Labels[LABELS.image] as ImageId]?.config);
  const entries = await Promise.all(containers.map(async container => {
    try{
      const pid = await docker.pid(container.Id);
      const { stdout } = await run("nsenter", ["-t", String(pid), "-n", "ip", "-j", "addr", "show"], { timeout: 10_000 });
      const links = JSON.parse(stdout) as { ifname: string; addr_info: { family: string; local: string; prefixlen: number }[] }[];
      const addresses = links.filter(link => link.ifname !== "lo").flatMap(link => link.addr_info
        .filter(info => info.family === "inet").map(info => ({ ifname: link.ifname, address: `${info.local}/${info.prefixlen}` })));
      return [container.Labels[LABELS.device], addresses] as const;
    }catch(_){
      // gone meanwhile: it says nothing
      return null;
    }
  }));
  return Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null));
}

/** the commands a device can run: nothing else reaches its shell */
export type Command = "ping" | "traceroute" | "addresses" | "routes" | "neighbours";
export const COMMANDS: Command[] = ["ping", "traceroute", "addresses", "routes", "neighbours"];

const HOSTNAME = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

export function argvOf(command: Command, target: string | undefined): string[] | null {
  const needsTarget = command === "ping" || command === "traceroute";
  if(needsTarget && !(target && (isIp(target) || HOSTNAME.test(target)))) return null;
  switch(command){
    case "ping": return ["ping", "-c", "4", "-W", "2", target!];
    case "traceroute": return ["traceroute", "-n", "-w", "1", "-q", "1", "-m", "15", target!];
    case "addresses": return ["ip", "addr"];
    case "routes": return ["ip", "route"];
    case "neighbours": return ["ip", "neigh"];
  }
}

async function containerOf(lab: string, device: string, t: T) {
  const container = (await docker.list({ [LABELS.lab]: lab, [LABELS.device]: device }))[0];
  if(!container) throw new Error(t("{device} no está desplegado.", { device }));
  if(container.State !== "running") throw new Error(t("{device} no está en marcha.", { device }));
  return container;
}

/** the same commands in RouterOS's CLI */
export function routerosOf(command: Command, target: string | undefined): string | null {
  if(!argvOf(command, target)) return null;
  switch(command){
    case "ping": return `/ping ${target} count=4`;
    case "traceroute": return `/tool traceroute ${target} count=1 max-hops=15`;
    case "addresses": return "/ip address print";
    case "routes": return "/ip route print";
    case "neighbours": return "/ip arp print";
  }
}

export async function execute(lab: string, device: string, command: Command, target: string | undefined, t: T = spanish) {
  const argv = argvOf(command, target);
  if(!argv) throw new Error(t("Escribe un destino válido: una IP o un nombre."));
  const container = await containerOf(lab, device, t);
  if(IMAGES[container.Labels[LABELS.image] as ImageId]?.config === "routeros"){
    const line = routerosOf(command, target)!;
    return { command: line, ...(await docker.exec(container.Id, ["vr-cli", line], 120_000)) };
  }
  return { command: argv.join(" "), ...(await docker.exec(container.Id, argv)) };
}

/** the terminal size a shell starts with, and is changed to */
export interface Size {
  cols: number;
  rows: number;
}

/** an interactive shell on a device: one of its image's (vtysh on a router,
 * bash, sh), the first one when none is asked */
export async function openShell(lab: string, device: string, size: Size, shell: string | undefined, t: T = spanish) {
  const container = await containerOf(lab, device, t);
  const image = IMAGES[container.Labels[LABELS.image] as ImageId] ?? IMAGES.alpine;
  const chosen = image.shells.find(item => item.id === shell) ?? image.shells[0];
  return docker.shell(container.Id, chosen.cmd, size);
}

/** what Docker has of an image: none until a lab first pulls it */
export async function imageStatus(info: ImageInfo) {
  const image = await docker.image(info.ref);
  return {
    ...info,
    pulled: Boolean(image),
    // a privileged one is downloaded, but runs only where the server allows it
    allowed: !info.privileged || ALLOW_PRIVILEGED,
    ...(image ? {
      imageId: image.Id,
      digest: image.RepoDigests?.[0]?.split("@")[1] ?? null,
      architecture: [image.Architecture, image.Variant].filter(Boolean).join("/"),
      os: image.Os,
      size: image.Size,
      created: image.Created,
    } : {}),
  };
}
