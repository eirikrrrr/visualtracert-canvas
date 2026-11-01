// The long texts in the interface's language: the Starting Point's guides, the
// protocols' pages and the machines' walkthroughs. Loaded (once per language)
// when they are first shown, so they stay out of the app's first load.
import type { Guides, Lang, ProtocolId, ProtocolText, Walkthrough } from "@visual-tracert/model";
import { useEffect } from "react";
import { create } from "zustand";
import { useLang } from "../i18n";

export interface Book { guides: Guides; protocols: Record<ProtocolId, ProtocolText>; walkthroughs: Record<string, Walkthrough> }

const LOAD: Record<Lang, () => Promise<Book>> = {
  es: () => import("@visual-tracert/model/guides/es"),
  en: () => import("@visual-tracert/model/guides/en"),
  pt: () => import("@visual-tracert/model/guides/pt"),
};

const useLoaded = create<Partial<Record<Lang, Book>>>(() => ({}));

/** the long texts in the current language; null while they load */
export function useBook(): Book | null {
  const lang = useLang(state => state.lang);
  const book = useLoaded(state => state[lang]);
  useEffect(() => {
    if(!book) void LOAD[lang]().then(({ guides, protocols, walkthroughs }) => useLoaded.setState({ [lang]: { guides, protocols, walkthroughs } }));
  }, [lang, book]);
  return book ?? null;
}

/** the guides in the current language; null while they load */
export const useGuides = (): Guides | null => useBook()?.guides ?? null;
