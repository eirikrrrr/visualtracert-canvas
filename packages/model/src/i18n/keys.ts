// The texts the code asks to translate: every t("…") and tx("…") with a
// literal, found by reading the sources. Used by the test that checks the
// dictionaries are complete.
const CALL = /\b(?:t|tx)\(\s*("(?:[^"\\]|\\.)*")/g;

export function keysIn(source: string): string[] {
  return [...source.matchAll(CALL)].map(match => JSON.parse(match[1]) as string);
}

export const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
