// Every dictionary, added at once: for the emulator, which answers in the
// language of each request, and for the tests.
import { en } from "./en";
import { addDictionary, type Dictionary, type Lang } from "./index";
import { pt } from "./pt";

export const DICTIONARIES: Record<Exclude<Lang, "es">, Dictionary> = { en, pt };

for(const [lang, dictionary] of Object.entries(DICTIONARIES)) addDictionary(lang as Exclude<Lang, "es">, dictionary);
