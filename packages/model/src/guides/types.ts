// The Starting Point's guides: one long document for each of the first three
// tiers (fundamentals, concepts, references), read top to bottom, each ending
// in a quiz on what it explained. A guide is long prose, so it is not made of
// dictionary keys (as the rest of the interface): each language has its whole
// guides, in the same shape (./es, ./en, ./pt; a test checks they match), and
// the web loads only the one of the language chosen.
//
// In a paragraph, **bold** and `code` are marked as in Markdown. A figure is
// drawn by the web from its id (its labels are interface texts); the caption,
// here, says what to look at in it.

export type GuideTier = "fundamentals" | "concepts" | "references";

export type Block =
  | { p: string }
  | { figure: string; caption: string }
  | { list: string[] }
  | { steps: string[] }
  | { table: { head: string[]; rows: string[][]; /** the columns shown as code */ code?: number[] } }
  | { note: string; kind: "tip" | "lab" | "warn" }
  | { code: string };

export interface GuideSection {
  id: string;
  title: string;
  blocks: Block[];
}

export interface QuizQuestion {
  q: string;
  options: string[];
  /** the right option's index */
  answer: number;
  /** why it is that one: shown once answered */
  why: string;
  /** the section that explains it, to go back to */
  section: string;
}

/** a document to read further: a standard (an RFC), a manual page… */
export interface GuideReference {
  title: string;
  url: string;
  note: string;
}

export interface Guide {
  title: string;
  intro: string;
  /** minutes to read it all */
  minutes: number;
  sections: GuideSection[];
  references: GuideReference[];
  quiz: QuizQuestion[];
}

export type Guides = Record<GuideTier, Guide>;

/** the share of right answers that passes a guide's quiz */
export const QUIZ_PASS = 0.75;
