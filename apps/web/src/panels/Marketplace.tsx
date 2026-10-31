// The Marketplace: the images devices can be (download one on this server
// and its devices appear in "Añadir dispositivo"; remove it when no longer
// wanted), the network systems of vendors that cannot be offered here (with
// the official way to get them) and the image profiles (an image with your own packages and
// commands, built here as a local image, that a device can run as). A modal
// dialog, like the gallery.
import { IMAGES, MARKETPLACE, PROFILE_ID, VENDORS, type ImageId, type ImageInfo } from "@visual-tracert/model";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../app/store";
import { Icon } from "../editor/icons";
import type { ProfileDraft, ProfileState } from "../emulation/api";
import { installed, useImages } from "../emulation/images";
import { tx, useT } from "../i18n";

const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

const STATE_LABEL: Record<ProfileState, string> = { built: tx("Construido"), outdated: tx("Cambió: construir de nuevo"), missing: tx("Sin construir") };

/** ready-made profiles to start from */
const PRESETS: { label: string; id: string; draft: ProfileDraft }[] = [
  { label: tx("Ubuntu con herramientas de red"), id: "ubuntu-red", draft: { name: "Ubuntu red", base: "ubuntu", packages: "iproute2 iputils-ping traceroute dnsutils curl", setup: "", startup: "" } },
  { label: tx("Debian con herramientas de red"), id: "debian-red", draft: { name: "Debian red", base: "debian", packages: "iproute2 iputils-ping traceroute dnsutils curl", setup: "", startup: "" } },
  { label: tx("FRR con OSPF y BGP"), id: "frr-ospf-bgp", draft: { name: "FRR OSPF + BGP", base: "frr", packages: "", setup: "sed -i 's/^ospfd=no/ospfd=yes/; s/^bgpd=no/bgpd=yes/' /etc/frr/daemons", startup: "" } },
  { label: tx("Alpine con tcpdump"), id: "alpine-tcpdump", draft: { name: "Alpine tcpdump", base: "alpine", packages: "tcpdump", setup: "", startup: "" } },
];

const EMPTY: ProfileDraft = { name: "", base: "alpine", packages: "", setup: "", startup: "" };

export function Marketplace() {
  const tab = useStore(state => state.marketplace);
  const dialog = useRef<HTMLDialogElement>(null);
  const t = useT();
  const close = () => useStore.getState().setMarketplace(null);

  useEffect(() => {
    const element = dialog.current;
    if(!element) return;
    if(tab && !element.open) element.showModal();
    if(!tab && element.open) element.close();
    if(tab) void useImages.getState().refresh();
  }, [tab]);

  return (
    <dialog ref={dialog} className="gallery market" aria-labelledby="market-title" onClose={close}
      onClick={event => { if(event.target === dialog.current) close(); }}>
      {tab && (
        <div className="gallery-inner">
          <header className="gallery-head">
            <div>
              <h2 id="market-title">{t("Marketplace")}</h2>
              <p className="muted small">{t("Imágenes de contenedor para tus dispositivos, y perfiles con tus propios paquetes y comandos. Se descargan y se construyen en este servidor.")}</p>
            </div>
            <button type="button" className="icon-button" aria-label={t("Cerrar")} title={t("Cerrar (Esc)")} onClick={close}><Icon name="close" size={18} /></button>
          </header>
          <div className="tabs market-tabs" role="tablist" aria-label={t("Marketplace")}>
            {(["images", "profiles"] as const).map(item => (
              <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""}
                onClick={() => useStore.getState().setMarketplace(item)}>
                {item === "images" ? t("Imágenes") : t("Perfiles de imagen")}
              </button>
            ))}
          </div>
          <Problems />
          {tab === "images" ? <ImagesTab /> : <ProfilesTab />}
        </div>
      )}
    </dialog>
  );
}

function Problems() {
  const t = useT();
  const reachable = useImages(state => state.reachable);
  const error = useImages(state => state.error);
  if(reachable === false) return <div className="outcome fail market-alert" role="alert">{t("No se puede conectar con el emulador. Comprueba que el servicio «emulator» está en marcha (docker compose up -d).")}</div>;
  return error ? <div className="outcome fail market-alert" role="alert">{error}</div> : null;
}

function ImagesTab() {
  const t = useT();
  const images = useImages(state => state.images);
  const busy = useImages(state => state.busy);
  const all: ImageInfo[] = [IMAGES.alpine, ...MARKETPLACE.map(id => IMAGES[id])];
  return (
    <div className="market-body">
      <div className="market-grid">
        {all.map(image => {
          const status = images[image.id];
          const doing = busy[image.id];
          const here = installed(image, images);
          return (
            <article key={image.id} className={`market-card${here ? " installed" : ""}`}>
              <div className="market-card-head">
                <span className="props-icon market-logo"><Icon name={image.id} size={30} /></span>
                <div>
                  <strong>{image.name}</strong>
                  <span className="mono muted small">{image.ref}</span>
                </div>
                <span className={`tag ${here ? "tag-images" : ""}`}>
                  {image.builtin ? t("Incluida") : status?.pulled ? (image.vrnetlab ? t("Construida") : t("Descargada")) : image.vrnetlab ? t("No construida") : t("No descargada")}
                </span>
              </div>
              <p className="small">{t(image.description)}</p>
              <p className="muted small">{t(image.publisher)}</p>
              {image.note && <p className="emu-note small">{t(image.note)}</p>}
              {status && !status.allowed && <p className="outcome fail small">{t("Este servidor no permite contenedores privilegiados: se puede descargar, pero no se inicia hasta arrancar el emulador con ALLOW_PRIVILEGED=1.")}</p>}
              {image.tools.length > 0 && <p className="market-tools mono small">{image.tools.slice(0, 8).join(" · ")}</p>}
              <div className="market-card-foot">
                <a href={image.links[0].url} target="_blank" rel="noreferrer noopener" className="small">{t(image.links[0].label)}</a>
                {status?.pulled && status.size !== undefined && <span className="muted small">{megabytes(status.size)}</span>}
                {!image.builtin && (status?.pulled ? (
                  <button type="button" className="ghost small" disabled={Boolean(doing)} onClick={() => useImages.getState().remove(image.id)}>
                    <Icon name="trash" size={15} />{doing === "remove" ? t("Quitando…") : t("Quitar")}
                  </button>
                ) : (
                  <button type="button" className="primary small" disabled={Boolean(doing)} onClick={() => useImages.getState().pull(image.id)}>
                    <Icon name="download" size={15} />{image.vrnetlab
                      ? doing === "pull" ? t("Construyendo… (unos minutos)") : t("Construir")
                      : doing === "pull" ? t("Descargando…") : t("Descargar")}
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      <h3 className="market-section">{t("Sistemas de fabricantes")}</h3>
      <p className="muted small">{t("Sus imágenes no se pueden descargar desde aquí: no son públicas o son máquinas virtuales. Esto es lo que hace falta para cada uno.")}</p>
      <div className="market-grid">
        {VENDORS.map(vendor => (
          <article key={vendor.id} className="market-card vendor">
            <div className="market-card-head">
              <span className="props-icon market-logo vendor-logo" aria-hidden="true">{vendor.vendor.slice(0, 2)}</span>
              <div><strong>{vendor.vendor}</strong><span className="muted small">{vendor.name}</span></div>
              <span className="tag">{t("No disponible aquí")}</span>
            </div>
            <p className="small">{t(vendor.form)}</p>
            <p className="muted small">{t(vendor.why)}</p>
            <ul className="image-links">
              {vendor.links.map(link => <li key={link.url}><a href={link.url} target="_blank" rel="noreferrer noopener">{t(link.label)}</a></li>)}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}

const asText = (lines: string[]) => lines.join("\n");

function ProfilesTab() {
  const t = useT();
  const profiles = useImages(state => state.profiles);
  const busy = useImages(state => state.busy);
  const logs = useImages(state => state.logs);
  const images = useImages(state => state.images);
  // the one being edited: a saved one, or a new one (null id)
  const [picked, setPicked] = useState<string | null>(profiles[0]?.profile.id ?? null);
  const current = profiles.find(item => item.profile.id === picked);
  const [newId, setNewId] = useState("");
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY);

  useEffect(() => {
    if(!current) return;
    const { profile } = current;
    setDraft({ name: profile.name, base: profile.base, description: profile.description, packages: profile.packages.join(" "), setup: asText(profile.setup), startup: asText(profile.startup) });
  }, [current?.profile]);

  const id = current ? current.profile.id : newId.trim();
  const doing = busy[`profile:${id}`];
  const base = IMAGES[draft.base];
  const saved = current && asText([current.profile.name, current.profile.base, current.profile.description ?? "", current.profile.packages.join(" "), asText(current.profile.setup), asText(current.profile.startup)])
    === asText([draft.name.trim(), draft.base, (draft.description ?? "").trim(), draft.packages.trim().split(/[\s,]+/).filter(Boolean).join(" "), draft.setup.trim(), draft.startup.trim()]);
  const set = (change: Partial<ProfileDraft>) => setDraft(previous => ({ ...previous, ...change }));
  const fresh = (preset?: (typeof PRESETS)[number]) => {
    setPicked(null);
    setNewId(preset && !profiles.some(item => item.profile.id === preset.id) ? preset.id : "");
    setDraft(preset ? preset.draft : EMPTY);
  };
  const save = async () => {
    const ok = await useImages.getState().saveProfile(id, draft);
    if(ok) setPicked(id);
  };
  const idOk = PROFILE_ID.test(id);

  return (
    <div className="market-body market-profiles">
      <aside className="profile-list" aria-label={t("Perfiles")}>
        <button type="button" className={`ghost small${!current ? " active" : ""}`} onClick={() => fresh()}><Icon name="plus" size={15} />{t("Nuevo perfil")}</button>
        {!profiles.length && <p className="muted small">{t("Aún no hay perfiles en este servidor.")}</p>}
        {profiles.map(item => (
          <button key={item.profile.id} type="button" className={`profile-item${item.profile.id === picked ? " active" : ""}`} onClick={() => setPicked(item.profile.id)}>
            <Icon name={item.profile.base} size={20} />
            <span><strong>{item.profile.name}</strong><small className="mono muted">{item.profile.id}</small></span>
            <span className={`profile-state state-${item.state}`}>{t(STATE_LABEL[item.state])}</span>
          </button>
        ))}
        <h4>{t("Empezar desde")}</h4>
        {PRESETS.map(preset => (
          <button key={preset.id} type="button" className="link small preset" onClick={() => fresh(preset)}>
            <Icon name={preset.draft.base} size={16} />{t(preset.label)}
          </button>
        ))}
      </aside>

      <section className="profile-editor" aria-label={t("Perfil")}>
        <div className="pair">
          <div className="field">
            <label htmlFor="profile-id">{t("Id (para el documento: profile: …)")}</label>
            <input id="profile-id" className={`mono${!idOk && id ? " invalid" : ""}`} value={id} disabled={Boolean(current)} placeholder="ubuntu-red"
              onChange={event => setNewId(event.target.value.toLowerCase())} />
          </div>
          <div className="field">
            <label htmlFor="profile-name">{t("Nombre")}</label>
            <input id="profile-name" value={draft.name} placeholder={t("Ubuntu con herramientas de red")} onChange={event => set({ name: event.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="profile-base">{t("Imagen base")}</label>
          <select id="profile-base" value={draft.base} onChange={event => set({ base: event.target.value as ImageId })}>
            {[IMAGES.alpine, ...MARKETPLACE.map(item => IMAGES[item])].map(image => (
              <option key={image.id} value={image.id}>{image.name} · {image.ref}{installed(image, images) ? "" : ` (${t("se descargará")})`}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="profile-description">{t("Descripción")}</label>
          <input id="profile-description" value={draft.description ?? ""} placeholder={t("Opcional")} onChange={event => set({ description: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="profile-packages">{t("Paquetes")} <span className="mono muted">{base.packages ? `(${base.packages})` : ""}</span></label>
          <textarea id="profile-packages" className="mono" rows={2} value={draft.packages} disabled={!base.packages}
            placeholder={base.packages ? (base.packages === "apt" ? "iproute2 iputils-ping traceroute" : "tcpdump iperf3") : t("{image} no tiene gestor de paquetes.", { image: base.name })}
            onChange={event => set({ packages: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="profile-setup">{t("Al construir (un comando por línea, se ejecutan como RUN)")}</label>
          <textarea id="profile-setup" className="mono" rows={3} value={draft.setup} placeholder="echo 'hola' > /etc/motd" onChange={event => set({ setup: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="profile-startup">{t("Al arrancar el laboratorio (un comando por línea, en cada dispositivo)")}</label>
          <textarea id="profile-startup" className="mono" rows={2} value={draft.startup} placeholder="iperf3 -s -D" onChange={event => set({ startup: event.target.value })} />
        </div>

        <div className="props-actions profile-actions">
          <button type="button" className="ghost" disabled={!idOk || !draft.name.trim() || Boolean(doing) || saved} onClick={save}>
            {doing === "save" ? t("Guardando…") : saved ? t("Guardado") : t("Guardar")}
          </button>
          <button type="button" className="primary" disabled={!current || !saved || Boolean(doing)}
            title={!saved ? t("Guarda los cambios antes de construir") : undefined} onClick={() => useImages.getState().buildProfile(id)}>
            <Icon name="play" size={15} />{doing === "build" ? t("Construyendo…") : current?.state === "built" ? t("Construir de nuevo") : t("Construir")}
          </button>
          {current && <span className={`profile-state state-${current.state}`}>{t(STATE_LABEL[current.state])}{current.size ? ` · ${megabytes(current.size)}` : ""}</span>}
          {current && (
            <button type="button" className="ghost small profile-delete" disabled={Boolean(doing)} onClick={async () => { await useImages.getState().removeProfile(id); fresh(); }}>
              <Icon name="trash" size={15} />{t("Eliminar")}
            </button>
          )}
        </div>
        {doing === "build" && <p className="muted small">{t("Descargando la base e instalando: puede tardar unos minutos.")}</p>}
        {logs[id] && <BuildLog log={logs[id]} />}
        <p className="muted small">{t("Para usarlo, elige el perfil en la tarjeta de imagen de un dispositivo (o escribe profile: {id} en el documento) y vuelve a desplegar.", { id: id || "…" })}</p>
      </section>
    </div>
  );
}

function BuildLog({ log }: { log: string }) {
  const t = useT();
  const box = useRef<HTMLPreElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [log]);
  const lines = useMemo(() => log.trimEnd(), [log]);
  return (
    <details className="build-log" open>
      <summary>{t("Salida de la construcción")}</summary>
      <pre ref={box} className="console">{lines}</pre>
    </details>
  );
}
