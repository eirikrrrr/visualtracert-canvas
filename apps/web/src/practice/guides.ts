// The Starting Point's guides in the interface's language: loaded (once per
// language) when they are first shown, so the long texts stay out of the
// app's first load.
import type { Guides, Lang } from "@visual-tracert/model";
import { useEffect } from "react";
import { create } from "zustand";
import { useLang } from "../i18n";

const LOAD: Record<Lang, () => Promise<{ guides: Guides }>> = {
  es: () => import("@visual-tracert/model/guides/es"),
  en: () => import("@visual-tracert/model/guides/en"),
  pt: () => import("@visual-tracert/model/guides/pt"),
};

const useLoaded = create<Partial<Record<Lang, Guides>>>(() => ({}));

/** the guides in the current language; null while they load */
export function useGuides(): Guides | null {
  const lang = useLang(state => state.lang);
  const guides = useLoaded(state => state[lang]);
  useEffect(() => {
    if(!guides) void LOAD[lang]().then(module => useLoaded.setState({ [lang]: module.guides }));
  }, [lang, guides]);
  return guides ?? null;
}
