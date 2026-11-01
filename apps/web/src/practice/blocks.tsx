// How the guides' content is drawn: a text with **bold** and `code`, and each
// kind of block (a paragraph, a figure, a list, steps, a table, a note, code).
// Shared by the guides, the protocols' pages and the machines' walkthroughs.
import type { Block } from "@visual-tracert/model";
import { Fragment } from "react";
import { Icon } from "../editor/icons";
import { tx, useT } from "../i18n";
import { FIGURES } from "./figures";

/** a text with **bold** and `code` */
export function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) =>
    part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong>
    : part.startsWith("`") ? <code key={i}>{part.slice(1, -1)}</code>
    : <Fragment key={i}>{part}</Fragment>)}</>;
}

const NOTE: Record<"tip" | "lab" | "warn", { label: string; icon: string }> = {
  tip: { label: tx("Para recordar"), icon: "info" },
  lab: { label: tx("En el laboratorio"), icon: "emulation" },
  warn: { label: tx("Cuidado"), icon: "flag" },
};

export function GuideBlock({ block }: { block: Block }) {
  const t = useT();
  if("p" in block) return <p><Rich text={block.p} /></p>;
  if("figure" in block){
    const Figure = FIGURES[block.figure];
    return Figure ? <figure className="guide-figure"><Figure /><figcaption><Rich text={block.caption} /></figcaption></figure> : null;
  }
  if("list" in block) return <ul>{block.list.map(item => <li key={item}><Rich text={item} /></li>)}</ul>;
  if("steps" in block) return <ol className="guide-steps">{block.steps.map(item => <li key={item}><Rich text={item} /></li>)}</ol>;
  if("table" in block){
    const code = block.table.code ?? [];
    return (
      <div className="machine-table-wrap guide-table-wrap">
        <table className="machine-table guide-table">
          <thead><tr>{block.table.head.map((head, i) => <th key={i}>{head}</th>)}</tr></thead>
          <tbody>{block.table.rows.map((row, r) => <tr key={r}>{row.map((cell, i) => <td key={i} className={code.includes(i) ? "mono" : undefined}><Rich text={cell} /></td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
  if("note" in block){
    const note = NOTE[block.kind];
    return (
      <aside className={`guide-note guide-note-${block.kind}`}>
        <Icon name={note.icon} size={18} />
        <div><strong>{t(note.label)}</strong><p><Rich text={block.note} /></p></div>
      </aside>
    );
  }
  return <pre className="guide-code">{block.code}</pre>;
}

/** blocks, one after the other */
export const Blocks = ({ blocks }: { blocks: Block[] }) => <>{blocks.map((block, i) => <GuideBlock key={i} block={block} />)}</>;
