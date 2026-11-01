// The account keeps what this browser has (phase B): its labs and its settings
// (profile, preferences, practice's progress). This browser's copy stays the
// one the app works on, so nothing waits on the network; every change goes up
// a moment later, and on signing in both sides are put together:
//   - labs: the newer copy of each wins; one deleted here is deleted there;
//     one this browser had synced and the account no longer has was deleted
//     elsewhere, and goes; the first time, what this browser had goes up;
//   - settings: the account's profile and preferences win (this browser's go
//     up if the account has none); practice's progress is added together.
// A browser where another account was signed in drops that account's labs
// (they are in that account) before it takes this one's.
import { useEffect, useState } from "react";
import { authCall, useAuth } from "./auth";
import { clearSeed, forgetLab, labDocument, listLabs, onLabChange, storeLab, untouchedSeed, type LabMeta } from "./labs";
import { useProfile } from "./profile";
import { quietly, useStore, type Theme } from "./store";
import { LANGS, useLang, type Lang } from "../i18n";
import { useProgress } from "../practice/progress";

const RECORD_KEY = "visual-tracert.sync";

/** what this browser knows of the account's copy */
interface SyncRecord {
  /** the account it last synced with */
  user?: number;
  /** each lab's time as the account has it */
  synced: { [id: string]: number };
  /** labs deleted here, still to delete there */
  deleted: string[];
}

function loadRecord(): SyncRecord {
  try{
    const saved = JSON.parse(localStorage.getItem(RECORD_KEY) ?? "null");
    if(saved && typeof saved.synced === "object") return { user: saved.user, synced: saved.synced, deleted: Array.isArray(saved.deleted) ? saved.deleted : [] };
  }catch(_){ /* none */ }
  return { synced: {}, deleted: [] };
}
let record = loadRecord();
const keep = () => { try{ localStorage.setItem(RECORD_KEY, JSON.stringify(record)); }catch(_){ /* full or blocked */ } };

/** how the account's copy is, for the dashboard */
export const useSync = (() => {
  let state: { status: "off" | "syncing" | "saved" | "error"; at: number | null; message?: string } = { status: "off", at: null };
  const listeners = new Set<() => void>();
  const set = (next: Partial<typeof state>) => { state = { ...state, ...next }; listeners.forEach(listener => listener()); };
  const use = () => {
    const [, redraw] = useState(0);
    useEffect(() => { const listener = () => redraw(n => n + 1); listeners.add(listener); return () => { listeners.delete(listener); }; }, []);
    return state;
  };
  return Object.assign(use, { set, get: () => state });
})();

interface ServerLab extends LabMeta { size: number; document?: string }

const signedIn = () => useAuth.getState().user;

// --- labs ----------------------------------------------------------------------

async function upload(id: string): Promise<void> {
  const meta = listLabs().find(item => item.id === id);
  const document = labDocument(id);
  if(!meta || !document) return;
  const saved = await authCall<ServerLab & { kept?: boolean }>("PUT", `/labs/${encodeURIComponent(id)}`, { document, updatedAt: meta.updatedAt });
  if(saved.kept) await download(id);
  else record.synced[id] = saved.updatedAt;
}

async function download(id: string): Promise<void> {
  const lab = await authCall<ServerLab>("GET", `/labs/${encodeURIComponent(id)}`);
  storeLab({ id: lab.id, name: lab.name, updatedAt: lab.updatedAt }, lab.document!);
  record.synced[id] = lab.updatedAt;
  // the lab open, newer in the account: shown as it is there
  const store = useStore.getState();
  if(store.labId === id) quietly(() => store.reloadLab());
}

async function remove(id: string): Promise<void> {
  await authCall("DELETE", `/labs/${encodeURIComponent(id)}`);
  delete record.synced[id];
  record.deleted = record.deleted.filter(item => item !== id);
}

/** both sides put together: run on signing in */
async function syncLabs(user: number): Promise<void> {
  if(record.user !== undefined && record.user !== user){
    // another account's labs, kept in its account: not this one's
    quietly(() => { for(const lab of listLabs()) forgetLab(lab.id); });
    record = { user, synced: {}, deleted: [] };
  }
  record.user = user;
  const server = await authCall<ServerLab[]>("GET", "/labs");
  for(const id of [...record.deleted]){ await remove(id).catch(() => undefined); }
  const remote = new Map(server.filter(item => !record.deleted.includes(item.id)).map(item => [item.id, item]));
  // this browser's untouched example, when the account has labs of its own: dropped
  const seed = untouchedSeed();
  if(seed && remote.size && !remote.has(seed)) forgetLab(seed);
  clearSeed();
  const local = new Map(listLabs().map(item => [item.id, item]));
  for(const [id, lab] of remote){
    const mine = local.get(id);
    if(!mine || mine.updatedAt < lab.updatedAt) await download(id);
    else if(mine.updatedAt > lab.updatedAt) await upload(id);
    else record.synced[id] = lab.updatedAt;
  }
  for(const [id] of local){
    if(remote.has(id)) continue;
    // synced before and gone from the account: deleted elsewhere
    if(record.synced[id] !== undefined){ forgetLab(id); delete record.synced[id]; }
    else await upload(id).catch(error => { useSync.set({ status: "error", message: (error as Error).message }); });
  }
  keep();
  reopen();
}

/** the labs list as it is now; the lab open, if it went, the first one (or a new one) */
function reopen(): void {
  const store = useStore.getState();
  const labs = listLabs();
  quietly(() => {
    if(labs.some(item => item.id === store.labId)){ useStore.setState({ labs }); return; }
    useStore.setState({ labs });
    if(labs[0]){ store.switchLab(labs[0].id); return; }
    store.createLab("empty");
  });
}

// each change here, a moment later there (by lab, the last change only)
const pending = new Map<string, ReturnType<typeof setTimeout>>();
onLabChange(({ id, deleted }) => {
  if(!signedIn() || record.user !== signedIn()!.id) return;
  if(deleted && !record.deleted.includes(id)) record.deleted.push(id);
  if(!deleted) record.deleted = record.deleted.filter(item => item !== id);
  keep();
  clearTimeout(pending.get(id));
  pending.set(id, setTimeout(() => {
    pending.delete(id);
    useSync.set({ status: "syncing" });
    void (deleted ? remove(id) : upload(id))
      .then(() => { keep(); useSync.set({ status: "saved", at: Date.now(), message: undefined }); })
      .catch(error => useSync.set({ status: "error", message: (error as Error).message }));
  }, 1500));
});

// --- settings --------------------------------------------------------------------

interface Settings {
  profile?: { photo?: string; bio?: string; motion?: "full" | "reduced" };
  prefs?: { theme?: Theme; lang?: Lang; sidebar?: boolean };
  practice?: ReturnType<typeof practiceOf>;
}

const practiceOf = () => {
  const { lessons, scores, labs, difficulty } = useProgress.getState();
  return { lessons, scores, labs, difficulty };
};

function settingsOf(): Settings {
  const { photo, bio, motion } = useProfile.getState();
  const { theme, sidebar } = useStore.getState();
  return { profile: { photo, bio, motion }, prefs: { theme, lang: useLang.getState().lang, sidebar }, practice: practiceOf() };
}

/** the account's settings, applied here */
function apply(settings: Settings): void {
  applying = true;
  try{
    if(settings.profile) useProfile.getState().update({ photo: settings.profile.photo, bio: settings.profile.bio ?? "", motion: settings.profile.motion ?? "full" });
    const prefs = settings.prefs;
    if(prefs?.theme && prefs.theme !== useStore.getState().theme) useStore.getState().setTheme(prefs.theme);
    if(prefs?.lang && LANGS.some(item => item.id === prefs.lang) && prefs.lang !== useLang.getState().lang) useLang.getState().setLang(prefs.lang);
    if(typeof prefs?.sidebar === "boolean" && prefs.sidebar !== useStore.getState().sidebar) useStore.getState().setSidebar(prefs.sidebar);
    if(settings.practice) useProgress.getState().absorb({ lessons: settings.practice.lessons ?? {}, scores: settings.practice.scores ?? {}, labs: settings.practice.labs ?? {}, difficulty: settings.practice.difficulty });
  }finally{
    applying = false;
  }
}

let applying = false;
let settingsTimer: ReturnType<typeof setTimeout> | undefined;
let settingsReady = false;

function pushSettings(): void {
  if(!signedIn() || !settingsReady || applying) return;
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    void authCall("PUT", "/me/settings", { data: settingsOf() })
      .catch(error => useSync.set({ status: "error", message: (error as Error).message }));
  }, 2000);
}

/** practice's progress takes the account first (it may start this browser's
 * progress anew, for another account): its settings come after */
function progressOf(user: number): Promise<void> {
  if(useProgress.getState().user === user) return Promise.resolve();
  return new Promise(resolve => {
    const stop = useProgress.subscribe(state => { if(state.user === user){ stop(); resolve(); } });
    setTimeout(() => { stop(); resolve(); }, 10_000);
  });
}

async function syncSettings(user: number): Promise<void> {
  await progressOf(user);
  const { data } = await authCall<{ data: Settings | null }>("GET", "/me/settings");
  if(data) apply(data);
  settingsReady = true;
  // what this browser adds (its progress, or all of it if the account had none)
  pushSettings();
}

useProfile.subscribe(pushSettings);
useLang.subscribe(pushSettings);
useStore.subscribe((state, previous) => { if(state.theme !== previous.theme || state.sidebar !== previous.sidebar) pushSettings(); });
useProgress.subscribe((state, previous) => {
  if(state.lessons !== previous.lessons || state.scores !== previous.scores || state.labs !== previous.labs || state.difficulty !== previous.difficulty) pushSettings();
});

// --- on signing in -------------------------------------------------------------

async function syncAll(user: number): Promise<void> {
  useSync.set({ status: "syncing" });
  try{
    await syncLabs(user);
    await syncSettings(user);
    useSync.set({ status: "saved", at: Date.now(), message: undefined });
  }catch(error){
    useSync.set({ status: "error", message: (error as Error).message });
  }
}

/** again, by hand (the dashboard's button) */
export const syncNow = () => { const user = signedIn(); if(user) void syncAll(user.id); };

useAuth.subscribe((state, previous) => {
  if(state.user && state.user.id !== previous.user?.id) void syncAll(state.user.id);
  if(!state.user){ settingsReady = false; useSync.set({ status: "off", at: null }); }
});
if(signedIn()) void syncAll(signedIn()!.id);

// --- a lab's earlier versions --------------------------------------------------

export const labVersions = (id: string) => authCall<{ savedAt: number; name: string; size: number }[]>("GET", `/labs/${encodeURIComponent(id)}/versions`);
export const labVersion = (id: string, savedAt: number) => authCall<{ savedAt: number; name: string; document: string }>("GET", `/labs/${encodeURIComponent(id)}/versions/${savedAt}`);
