// The app's side menu, on every page: the player (rank, level, XP) and the
// season running with their place, then where to go — the home page, the
// sections of practice and the two labs (simulation, emulation). The top bar's
// menu button hides it and shows it again (remembered in this browser); on a
// narrow screen it opens over the page and closes on choosing.
import { useEffect } from "react";
import { Icon } from "../editor/icons";
import { tx, useT } from "../i18n";
import { go, PlayerCard, useView, type Section } from "../practice/common";
import { chooseMode } from "../practice/progress";
import { SeasonCard, useCurrentSeason } from "../practice/Seasons";
import { useShared } from "../practice/server";
import { useAuth } from "./auth";
import { useStore, type Mode } from "./store";

const PRACTICE: { id: Section; label: string; icon: string }[] = [
  { id: "start", label: tx("Starting Point"), icon: "flag" },
  { id: "machines", label: tx("Máquinas"), icon: "topology" },
  { id: "tracks", label: tx("Tracks"), icon: "layers" },
  { id: "seasons", label: tx("Seasons"), icon: "calendar" },
  { id: "ranking", label: tx("Ranking"), icon: "trophy" },
];

const LABS: { id: Mode; label: string; icon: string }[] = [
  { id: "simulation", label: tx("Simulación"), icon: "simulation" },
  { id: "emulation", label: tx("Emulación"), icon: "emulation" },
];

/** on a narrow screen the menu covers the page: choosing closes it */
const narrow = () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
const done = () => { if(narrow()) useStore.getState().setSidebar(false); };

export function Sidebar() {
  const t = useT();
  const mode = useStore(state => state.mode);
  const section = useView(state => state.section);
  const season = useCurrentSeason();
  useEffect(() => { void useShared.getState().refreshSeasons(); }, []);
  const item = (key: string, label: string, icon: string, active: boolean, onClick: () => void) => (
    <button key={key} type="button" className={active ? "active" : ""} aria-current={active ? "page" : undefined} title={t(label)}
      onClick={() => { onClick(); done(); }}>
      <Icon name={icon} size={18} />{t(label)}
    </button>
  );
  return (
    <>
      <nav className="app-sidebar" aria-label={t("Menú")}>
        <PlayerCard />
        {season && <SeasonCard season={season} compact />}
        <div className="rail-sections">
          {item("home", tx("Inicio"), "home", mode === "home", () => chooseMode("home"))}
        </div>
        <div className="rail-sections">
          <span className="rail-heading">{t("Practicar")}</span>
          {PRACTICE.map(entry => item(entry.id, entry.label, entry.icon, mode === "practice" && section === entry.id,
            () => { chooseMode("practice"); go(entry.id); }))}
        </div>
        <div className="rail-sections">
          <span className="rail-heading">{t("Laboratorio")}</span>
          {LABS.map(entry => item(entry.id, entry.label, entry.icon, mode === entry.id, () => chooseMode(entry.id)))}
        </div>
        <div className="rail-sections rail-bottom">
          <button type="button" className="rail-logout" onClick={() => void useAuth.getState().logout()}><Icon name="logout" size={18} />{t("Cerrar sesión")}</button>
        </div>
      </nav>
      <div className="app-sidebar-scrim" aria-hidden="true" onClick={() => useStore.getState().setSidebar(false)} />
    </>
  );
}
