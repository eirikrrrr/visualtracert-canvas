// What this server has of the images and the profiles: which images of the
// catalog are downloaded (the palette shows those), the Marketplace's
// downloads and removals, and the image profiles with their builds.
import { create } from "zustand";
import { IMAGES, type ImageId, type ImageInfo } from "@visual-tracert/model";
import { emulator, type ImageStatus, type ProfileDraft, type ProfileStatus } from "./api";

interface ImagesState {
  /** null until the emulator first answers; false, it does not */
  reachable: boolean | null;
  images: Partial<Record<ImageId, ImageStatus>>;
  profiles: ProfileStatus[];
  /** what is being done to each image or profile ("pull", "remove", "build", "save") */
  busy: Record<string, string>;
  error: string | null;
  /** what the last build of each profile printed */
  logs: Record<string, string>;
  refresh: () => Promise<void>;
  pull: (id: ImageId) => Promise<void>;
  remove: (id: ImageId) => Promise<void>;
  saveProfile: (id: string, draft: ProfileDraft) => Promise<boolean>;
  buildProfile: (id: string) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
}

export const useImages = create<ImagesState>(set => {
  const work = async (key: string, what: string, task: () => Promise<void>) => {
    set(state => ({ busy: { ...state.busy, [key]: what }, error: null }));
    try{
      await task();
      return true;
    }catch(error){
      set({ error: (error as Error).message });
      return false;
    }finally{
      set(state => { const { [key]: _, ...busy } = state.busy; return { busy }; });
    }
  };
  const putImage = (status: ImageStatus) => set(state => ({ images: { ...state.images, [status.id]: status } }));
  const putProfile = (status: ProfileStatus) => set(state => ({
    profiles: [...state.profiles.filter(item => item.profile.id !== status.profile.id), status].sort((p, q) => p.profile.name.localeCompare(q.profile.name)),
  }));

  return {
    reachable: null,
    images: {},
    profiles: [],
    busy: {},
    error: null,
    logs: {},
    refresh: async () => {
      try{
        const [images, profiles] = await Promise.all([emulator.images(), emulator.profiles()]);
        set({ reachable: true, images: Object.fromEntries(images.map(item => [item.id, item])), profiles });
      }catch(_){
        set({ reachable: false });
      }
    },
    pull: async id => { await work(id, "pull", async () => putImage(await emulator.pull(id))); },
    remove: async id => { await work(id, "remove", async () => putImage(await emulator.removeImage(id))); },
    saveProfile: (id, draft) => work(`profile:${id}`, "save", async () => putProfile(await emulator.saveProfile(id, draft))),
    buildProfile: async id => {
      await work(`profile:${id}`, "build", async () => {
        const { ok: _ok, log, ...status } = await emulator.buildProfile(id);
        putProfile(status);
        set(state => ({ logs: { ...state.logs, [id]: log } }));
      });
    },
    removeProfile: async id => {
      await work(`profile:${id}`, "remove", async () => {
        await emulator.removeProfile(id);
        set(state => ({ profiles: state.profiles.filter(item => item.profile.id !== id) }));
      });
    },
  };
});

/** whether devices of an image can be added: it comes with the app, or it was downloaded */
export const installed = (image: ImageInfo, images: ImagesState["images"]) => image.builtin || Boolean(images[image.id]?.pulled);

/** the image a device runs as: its profile's base, or its type's */
export function runningImage(type: ImageId | undefined, profile: string | undefined, profiles: ProfileStatus[]): ImageInfo {
  const chosen = profile ? profiles.find(item => item.profile.id === profile) : undefined;
  return IMAGES[chosen?.profile.base ?? type ?? "alpine"];
}
