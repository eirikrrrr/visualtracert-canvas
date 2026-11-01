// The protocols' pages: a machine shows its protocols as tags, and a tag opens
// the protocol's page over whatever section is open (its way back returns
// there). A page says what the protocol is, where it lives (its layer, how it
// travels), what to remember and how to see it in the lab, then the guides'
// sections that explain it, with their diagrams, the machines that use it and
// its standards. The Starting Point's references list them all.
import { listedExercises, protocolById, PROTOCOLS, type Protocol, type ProtocolId } from "@visual-tracert/model";
import type { CSSProperties } from "react";
import { Icon } from "../editor/icons";
import { useT } from "../i18n";
import { Blocks } from "./blocks";
import { MachineTable, useView } from "./common";
import { useBook } from "./guides";

const open = (id: ProtocolId) => useView.setState({ protocol: id });

/** a machine's protocols, as tags that open their pages */
export function ProtocolTags({ ids }: { ids: ProtocolId[] }) {
  const t = useT();
  const book = useBook();
  return (
    <ul className="protocol-tags" aria-label={t("Protocolos")}>
      {ids.map(id => {
        const protocol = protocolById(id)!;
        return (
          <li key={id}>
            <button type="button" style={{ "--tag": protocol.color } as CSSProperties} onClick={() => open(id)} title={t("Abrir la página de {name}", { name: book?.protocols[id].name ?? id })}>
              {book?.protocols[id].name ?? id.toUpperCase()}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** every protocol, as cards: in the Starting Point's references */
export function ProtocolGrid() {
  const t = useT();
  const book = useBook();
  if(!book) return null;
  return (
    <section className="protocol-library">
      <h3>{t("Biblioteca de protocolos")}</h3>
      <p className="muted small">{t("Cada protocolo de las máquinas, con su explicación, sus diagramas y su documentación.")}</p>
      <div className="protocol-grid">
        {PROTOCOLS.map(protocol => (
          <button key={protocol.id} type="button" className="protocol-card" style={{ "--tag": protocol.color } as CSSProperties} onClick={() => open(protocol.id)}>
            <span className="protocol-card-icon" aria-hidden="true"><Icon name={protocol.icon} size={20} /></span>
            <span className="protocol-card-text">
              <strong>{book.protocols[protocol.id].name}</strong>
              <span className="muted small">{book.protocols[protocol.id].full}</span>
            </span>
            <span className="tag">{t("Capa {n}", { n: protocol.layer })}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function ProtocolPage({ protocol }: { protocol: Protocol }) {
  const t = useT();
  const book = useBook();
  const text = book?.protocols[protocol.id];
  const machines = listedExercises().filter(item => item.protocols.includes(protocol.id));
  return (
    <div className="protocol-page" style={{ "--tag": protocol.color } as CSSProperties}>
      <button type="button" className="back-button" onClick={() => useView.setState({ protocol: null })}>
        <Icon name="prev" size={16} />{t("Volver")}
      </button>
      {!book || !text ? <p className="muted small">{t("Cargando…")}</p> : (
        <>
          <header className="protocol-hero">
            <span className="protocol-hero-icon" aria-hidden="true"><Icon name={protocol.icon} size={40} /></span>
            <div>
              <span className="section-kicker">{t("Protocolo")}</span>
              <h1>{text.name}</h1>
              <span className="mono muted">{text.full}</span>
              <p>{text.summary}</p>
              <ul className="start-chips">
                <li><Icon name="layers" size={15} />{t("Capa {n} de OSI", { n: protocol.layer })}</li>
                {protocol.carrier && <li><Icon name="emulation" size={15} />{t("Viaja en {carrier}", { carrier: protocol.carrier })}</li>}
                <li><Icon name="topology" size={15} />{t("{n} máquinas lo usan", { n: machines.length })}</li>
              </ul>
            </div>
          </header>
          <div className="guide-body protocol-body">
            <section className="guide-section">
              <h3><span className="guide-n"><Icon name="info" size={15} /></span>{t("Lo esencial")}</h3>
              <Blocks blocks={text.blocks} />
            </section>
            {protocol.sections.map(([tier, id]) => {
              const guide = book.guides[tier];
              const section = guide.sections.find(item => item.id === id);
              if(!section) return null;
              return (
                <section key={`${tier}/${id}`} className="guide-section">
                  <span className="section-kicker">{guide.title}</span>
                  <h3><span className="guide-n"><Icon name="book" size={15} /></span>{section.title}</h3>
                  <Blocks blocks={section.blocks} />
                </section>
              );
            })}
            <section className="guide-section">
              <h3><span className="guide-n"><Icon name="topology" size={15} /></span>{t("Máquinas para practicarlo")}</h3>
              <MachineTable exercises={machines} />
            </section>
            <section className="guide-section guide-quiz">
              <h3><span className="guide-n"><Icon name="external" size={15} /></span>{t("Documentación")}</h3>
              <ul className="guide-refs">
                {protocol.references.map(item => (
                  <li key={item.url}><a href={item.url} target="_blank" rel="noreferrer noopener"><Icon name="external" size={15} />{item.title}</a></li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
