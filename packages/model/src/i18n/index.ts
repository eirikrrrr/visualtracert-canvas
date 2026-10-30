// Languages. The Spanish text is written in the code as it is shown
// (t("Hacer ping")) and is the key of the other dictionaries, as in gettext;
// {name} marks a value put in at run time. A text with no translation shows
// in Spanish, and a test checks that every one has its translations. This is
// the shared, pure part; the web keeps the chosen language (apps/web/src/i18n).
import { en } from "./en";
import { pt } from "./pt";

export type Lang = "es" | "en" | "pt";
export type Vars = Record<string, string | number>;
export type T = (text: string, vars?: Vars) => string;

export const LANGS: { id: Lang; label: string; short: string; html: string }[] = [
  { id: "es", label: "Español", short: "ES", html: "es" },
  { id: "en", label: "English", short: "EN", html: "en" },
  { id: "pt", label: "Português (Brasil)", short: "PT", html: "pt-BR" },
];

export const DICTIONARIES: Record<Exclude<Lang, "es">, Record<string, string>> = { en, pt };

const fill = (text: string, vars?: Vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match)) : text;

export function translator(lang: Lang): T {
  const dictionary = lang === "es" ? null : DICTIONARIES[lang];
  return (text, vars) => fill(dictionary?.[text] ?? text, vars);
}

/** Spanish as written: the default of the pure modules (and their tests) */
export const spanish: T = translator("es");

/** Marks a text that is translated later, where it is shown (gettext's N_). */
export const tx = <S extends string>(text: S): S => text;

export { keysIn, placeholders } from "./keys";
