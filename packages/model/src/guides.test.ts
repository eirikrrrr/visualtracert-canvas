import { describe, expect, it } from "vitest";
import { EXERCISES } from "./exercises";
import * as en from "./guides/en";
import * as es from "./guides/es";
import * as pt from "./guides/pt";
import type { Block } from "./guides/types";
import { TIERS } from "./learn";
import { PROTOCOLS } from "./protocols";

type Book = typeof es;

/** what must not change between languages: the sections, the kind of each
 * block (and its figure, its table's size), the answers and the documents */
const shape = (book: Book) => ({
  guides: Object.fromEntries(Object.entries(book.guides).map(([tier, guide]) => [tier, {
    sections: guide.sections.map(section => ({ id: section.id, blocks: section.blocks.map(kind) })),
    quiz: guide.quiz.map(item => ({ section: item.section, options: item.options.length, answer: item.answer })),
    references: guide.references.map(item => item.url),
  }])),
  protocols: Object.fromEntries(Object.entries(book.protocols).map(([id, text]) => [id, text.blocks.map(kind)])),
  walkthroughs: Object.fromEntries(Object.entries(book.walkthroughs).map(([id, blocks]) => [id, blocks.map(kind)])),
});

function kind(block: Block): string {
  if("figure" in block) return `figure:${block.figure}`;
  if("table" in block) return `table:${block.table.head.length}x${block.table.rows.length}:${block.table.code ?? ""}`;
  if("list" in block) return `list:${block.list.length}`;
  if("steps" in block) return `steps:${block.steps.length}`;
  if("note" in block) return `note:${block.kind}`;
  return Object.keys(block)[0];
}

describe("the starting point's guides", () => {
  it("has one for each tier that names one", () => {
    for(const tier of TIERS) if(tier.guide) expect(es.guides[tier.guide], tier.id).toBeDefined();
  });

  it("asks 40 questions or more on each, each answerable and about one of its sections", () => {
    for(const [tier, guide] of Object.entries(es.guides)){
      const sections = new Set(guide.sections.map(section => section.id));
      expect(sections.size, tier).toBe(guide.sections.length);
      expect(guide.quiz.length, tier).toBeGreaterThanOrEqual(40);
      for(const item of guide.quiz){
        expect(sections.has(item.section), `${tier}: ${item.q}`).toBe(true);
        expect(item.options[item.answer], `${tier}: ${item.q}`).toBeDefined();
        expect(new Set(item.options).size, `${tier}: ${item.q}`).toBe(item.options.length);
      }
      // every section is asked about
      for(const id of sections) expect(guide.quiz.some(item => item.section === id), `${tier}: ${id}`).toBe(true);
      for(const section of guide.sections) for(const block of section.blocks)
        if("table" in block) for(const row of block.table.rows) expect(row.length, `${tier}/${section.id}`).toBe(block.table.head.length);
    }
  });

  it("has a page for each protocol, made of sections that exist, and a walkthrough for each machine", () => {
    expect(Object.keys(es.protocols).sort()).toEqual(PROTOCOLS.map(item => item.id).sort());
    for(const protocol of PROTOCOLS) for(const [tier, section] of protocol.sections)
      expect(es.guides[tier].sections.some(item => item.id === section), `${protocol.id}: ${tier}/${section}`).toBe(true);
    for(const exercise of EXERCISES){
      expect(es.walkthroughs[exercise.id]?.length, exercise.id).toBeGreaterThan(0);
      expect(exercise.protocols.length, exercise.id).toBeGreaterThan(0);
    }
  });

  it.each([["en", en], ["pt", pt]])("is the same guide in %s", (_lang, book) => {
    expect(shape(book as Book)).toEqual(shape(es));
  });
});
