// Labs saved in this browser: an index (id, name, last change) and one entry
// per lab with its topology. The lab of the first version (a single saved
// topology) becomes the first lab. This browser's copy is the one the app
// works on; the account keeps them too (./sync), told of every change here.
import { parse, serialize, type Topology } from "@visual-tracert/model";

const INDEX_KEY = "visual-tracert.labs";
const CURRENT_KEY = "visual-tracert.current";
const LAB_PREFIX = "visual-tracert.lab.";
const LEGACY_KEY = "visual-tracert.lab";

export interface LabMeta {
  id: string;
  name: string;
  updatedAt: number;
}

const read = (key: string) => {
  try{ return localStorage.getItem(key); }catch(_){ return null; }
};
const write = (key: string, value: string) => {
  try{ localStorage.setItem(key, value); }catch(_){ /* full or blocked: the lab lives in memory */ }
};
const remove = (key: string) => {
  try{ localStorage.removeItem(key); }catch(_){ /* ignore */ }
};

/** told of each lab saved or deleted here (the account's copy follows: ./sync) */
type LabListener = (change: { id: string; deleted: boolean }) => void;
const listeners = new Set<LabListener>();
export const onLabChange = (listener: LabListener) => { listeners.add(listener); return () => listeners.delete(listener); };
const tell = (id: string, deleted: boolean) => listeners.forEach(listener => listener({ id, deleted }));

export const newLabId = () => `lab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function listLabs(): LabMeta[] {
  try{
    const index = JSON.parse(read(INDEX_KEY) ?? "[]");
    return Array.isArray(index) ? index.filter(item => item && item.id) : [];
  }catch(_){
    return [];
  }
}

function saveIndex(labs: LabMeta[]) {
  write(INDEX_KEY, JSON.stringify(labs));
}

export function loadLab(id: string): Topology | null {
  const saved = read(LAB_PREFIX + id);
  if(!saved) return null;
  return parse(saved, "json").topology;
}

/** Saves a lab and moves it to the top of the index. */
export function saveLab(id: string, topology: Topology): LabMeta[] {
  write(LAB_PREFIX + id, serialize(topology, "json"));
  const labs = [{ id, name: topology.name, updatedAt: Date.now() }, ...listLabs().filter(item => item.id !== id)];
  saveIndex(labs);
  tell(id, false);
  return labs;
}

export function deleteLab(id: string): LabMeta[] {
  remove(LAB_PREFIX + id);
  const labs = listLabs().filter(item => item.id !== id);
  saveIndex(labs);
  tell(id, true);
  return labs;
}

/** a lab's document as saved here (JSON), to send to the account */
export const labDocument = (id: string) => read(LAB_PREFIX + id);

/** the account's copy of a lab, kept here as it came (with its time): no one is told */
export function storeLab(meta: LabMeta, document: string): void {
  write(LAB_PREFIX + meta.id, document);
  saveIndex([meta, ...listLabs().filter(item => item.id !== meta.id)].sort((p, q) => q.updatedAt - p.updatedAt));
}

/** forgets a lab here only (it was deleted from the account elsewhere) */
export function forgetLab(id: string): void {
  remove(LAB_PREFIX + id);
  saveIndex(listLabs().filter(item => item.id !== id));
}

/** the example a browser with no labs starts with, as it was made: not worth
 * keeping in an account that has labs already, while it is untouched */
const SEED_KEY = "visual-tracert.seed";
export const markSeed = (lab: LabMeta) => write(SEED_KEY, JSON.stringify(lab));
export function untouchedSeed(): string | null {
  try{
    const seed = JSON.parse(read(SEED_KEY) ?? "null") as LabMeta | null;
    const now = seed && listLabs().find(item => item.id === seed.id);
    return now && now.updatedAt === seed!.updatedAt ? seed!.id : null;
  }catch(_){ return null; }
}
export const clearSeed = () => remove(SEED_KEY);

export const currentLabId = () => read(CURRENT_KEY);
export const setCurrentLabId = (id: string) => write(CURRENT_KEY, id);

/** The lab to open at start: the last one used, else the first version's, else none. */
export function startingLab(): { id: string; topology: Topology } | null {
  const current = currentLabId();
  const topology = current ? loadLab(current) : null;
  if(current && topology) return { id: current, topology };
  const legacy = read(LEGACY_KEY);
  if(legacy){
    const parsed = parse(legacy, "json").topology;
    remove(LEGACY_KEY);
    if(parsed){
      const id = newLabId();
      saveLab(id, parsed);
      setCurrentLabId(id);
      return { id, topology: parsed };
    }
  }
  const first = listLabs()[0];
  const fallback = first ? loadLab(first.id) : null;
  return first && fallback ? { id: first.id, topology: fallback } : null;
}
