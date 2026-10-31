// The local profile of this browser (there are no accounts yet): a name, an
// optional photo (the round avatar of the top bar), a few words about the user
// and how the interface moves. The user's dashboard edits it.
import { t } from "../i18n";
import { create } from "zustand";

const PROFILE_KEY = "visual-tracert.profile";
const PHOTO_SIZE = 128;

export interface Profile {
  name: string;
  /** a small square JPEG as a data URL */
  photo?: string;
  /** a few words about the user (a role, a course) */
  bio?: string;
  /** "reduced": no animations, whatever the system says */
  motion?: "full" | "reduced";
}

function load(): Profile {
  try{
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null");
    if(saved && typeof saved.name === "string") return saved;
  }catch(_){ /* none */ }
  return { name: "Invitado" };
}

interface ProfileState extends Profile {
  update: (change: Partial<Profile>) => void;
}

export const useProfile = create<ProfileState>(set => ({
  ...load(),
  update: change => set(state => {
    const next: Profile = {
      name: change.name ?? state.name,
      photo: "photo" in change ? change.photo : state.photo,
      bio: change.bio ?? state.bio,
      motion: change.motion ?? state.motion,
    };
    try{ localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); }catch(_){ /* full or blocked */ }
    return next;
  }),
}));

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if(!words.length) return "?";
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0];
  return letters.toUpperCase();
}

/** A photo cut to a centred square of PHOTO_SIZE pixels, as a data URL. */
export function squarePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const side = Math.min(image.width, image.height);
      const canvas = Object.assign(document.createElement("canvas"), { width: PHOTO_SIZE, height: PHOTO_SIZE });
      canvas.getContext("2d")!.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", .85));
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t("No se pudo leer la imagen."))); };
    image.src = url;
  });
}
