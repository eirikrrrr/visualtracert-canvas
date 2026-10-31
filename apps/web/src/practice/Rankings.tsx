// The ranking: the players by XP (then by who got there first), everyone's or
// a season's. The three first on a podium, the rest in a table; the user's own
// row stands out, and if they are below the hundred shown, it follows. How many
// of their solves the server checked (medium, on the devices) is a column:
// easy ones are the page's word.
import { useEffect, useState } from "react";
import { initials } from "../app/profile";
import { Icon } from "../editor/icons";
import { LANGS, useLang, useT } from "../i18n";
import { practiceApi, useShared, type RankEntry, type Ranking } from "./server";

const PLACES = ["first", "second", "third"] as const;

function Player({ entry, size = 34 }: { entry: RankEntry; size?: number }) {
  return <span className="rank-avatar" style={{ width: size, height: size, fontSize: size * .38 }} aria-hidden="true">{initials(entry.name)}</span>;
}

export function Rankings({ season: fixed }: { season?: number }) {
  const t = useT();
  const lang = useLang(state => state.lang);
  const seasons = useShared(state => state.seasons);
  const [season, setSeason] = useState<number | undefined>(fixed);
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if(seasons === null) void useShared.getState().refreshSeasons(); }, [seasons]);
  useEffect(() => {
    setRanking(null);
    setError(null);
    practiceApi.ranking(season).then(setRanking).catch(failure => setError((failure as Error).message));
  }, [season]);
  const locale = LANGS.find(item => item.id === lang)!.html;
  const date = (time: number) => new Date(time).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const podium = ranking?.entries.slice(0, 3) ?? [];
  const meShown = ranking?.me && ranking.entries.some(entry => entry.id === ranking.me!.id);

  return (
    <section className="rankings">
      {fixed === undefined && (
        <div className="machine-tools">
          <select value={season ?? ""} aria-label={t("Ranking de")} onChange={event => setSeason(event.target.value ? Number(event.target.value) : undefined)}>
            <option value="">{t("Ranking global")}</option>
            {(seasons ?? []).map(item => <option key={item.id} value={item.id}>{t("Season: {name}", { name: item.name })}</option>)}
          </select>
          {ranking && <span className="muted small">{t("Jugadores: {n}", { n: ranking.total })}</span>}
        </div>
      )}
      {error && <p className="emu-note small">{error}</p>}
      {ranking && !ranking.entries.length && (
        <div className="machine-locked">
          <Icon name="practice" size={28} />
          <strong>{t("Aún no hay nadie en el ranking")}</strong>
          <span className="muted small">{t("Supera una máquina y serás el primero.")}</span>
        </div>
      )}
      {podium.length > 0 && (
        <ol className="podium">
          {podium.map((entry, i) => (
            <li key={entry.id} className={`podium-${PLACES[i]}${entry.id === ranking?.me?.id ? " me" : ""}`}>
              <span className="podium-place">{entry.position}</span>
              <Player entry={entry} size={i === 0 ? 64 : 52} />
              <strong>{entry.name}</strong>
              <span className="mono small muted">{t(entry.rank)} · {t("Nivel {n}", { n: entry.level })}</span>
              <span className="podium-xp mono">{entry.xp} XP</span>
            </li>
          ))}
        </ol>
      )}
      {ranking && ranking.entries.length > 0 && (
        <div className="machine-table-wrap">
          <table className="machine-table rank-table">
            <thead>
              <tr><th>#</th><th>{t("Jugador")}</th><th>{t("Rango")}</th><th>XP</th><th>{t("Máquinas")}</th><th title={t("Superadas en Medio y comprobadas por el servidor en los equipos reales")}>{t("Verificadas")}</th><th>{t("Última")}</th></tr>
            </thead>
            <tbody>
              {[...ranking.entries, ...(ranking.me && !meShown ? [ranking.me] : [])].map(entry => (
                <tr key={entry.id} className={entry.id === ranking.me?.id ? "me" : ""}>
                  <td className="mono rank-position">{entry.position}</td>
                  <td>
                    <div className="machine-cell">
                      <Player entry={entry} />
                      <div><strong>{entry.name}</strong><span className="mono small muted">{entry.username}{entry.id === ranking.me?.id ? ` · ${t("tú")}` : ""}</span></div>
                    </div>
                  </td>
                  <td className="small">{t(entry.rank)} · {t("Nivel {n}", { n: entry.level })}</td>
                  <td className="mono xp-cell">{entry.xp}</td>
                  <td className="mono small">{entry.solves}</td>
                  <td className="mono small">{entry.verified > 0 ? <span className="solved-cell"><Icon name="check" size={13} />{entry.verified}</span> : "—"}</td>
                  <td className="mono small muted">{date(entry.lastSolve)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!ranking && !error && <p className="muted small">{t("Cargando…")}</p>}
    </section>
  );
}
