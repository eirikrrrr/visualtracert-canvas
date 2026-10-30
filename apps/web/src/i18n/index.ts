// The interface language: the one chosen in this browser, and the translator
// for it. The dictionaries and the translator itself are shared
// (@visual-tracert/model); this keeps the choice and draws React again on it.
import { LANGS, translator, type Lang, type T } from "@visual-tracert/model";
import { useMemo } from "react";
import { create } from "zustand";

export { DICTIONARIES, LANGS, spanish, translator, tx, type Lang, type T, type Vars } from "@visual-tracert/model";

const LANG_KEY = "visual-tracert.lang";

function initialLang(): Lang {
  try{
    const saved = localStorage.getItem(LANG_KEY);
    if(LANGS.some(item => item.id === saved)) return saved as Lang;
  }catch(_){ /* no storage */ }
  const browser = (typeof navigator !== "undefined" ? navigator.language : "es").toLowerCase();
  return browser.startsWith("pt") ? "pt" : browser.startsWith("en") ? "en" : "es";
}

export const useLang = create<{ lang: Lang; setLang: (lang: Lang) => void }>(set => ({
  lang: initialLang(),
  setLang: lang => {
    try{ localStorage.setItem(LANG_KEY, lang); }catch(_){ /* ignore */ }
    set({ lang });
  },
}));

const syncDocument = (lang: Lang) => {
  if(typeof document !== "undefined") document.documentElement.lang = LANGS.find(item => item.id === lang)!.html;
};
syncDocument(useLang.getState().lang);
useLang.subscribe(state => syncDocument(state.lang));

/** In the current language, outside React (the store, the simulator's callers). */
export const t: T = (text, vars) => translator(useLang.getState().lang)(text, vars);

/** In the current language; the component is drawn again when it changes. */
export function useT(): T {
  const lang = useLang(state => state.lang);
  return useMemo(() => translator(lang), [lang]);
}
