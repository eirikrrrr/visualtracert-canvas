// The image a device runs as in the emulation: the profile it uses (its own
// packages and commands, from the Marketplace), what the image is, what it
// brings, where it comes from (its official pages) and, once it is
// downloaded, what Docker has of it on this server.
import { CATALOG, GROUPS, imageOf, updateDevice, type Device } from "@visual-tracert/model";
import { useEffect, useId } from "react";
import { useStore } from "../app/store";
import { runningImage, useImages } from "../emulation/images";
import { Icon } from "../editor/icons";
import { LANGS, useLang, useT } from "../i18n";

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function ImageCard({ device }: { device: Device }) {
  const t = useT();
  const lang = useLang(state => state.lang);
  const profiles = useImages(state => state.profiles);
  const profileId = useId();
  const image = runningImage(imageOf(device.type).id, device.profile, profiles);
  const kind = CATALOG[device.type];
  // a device of an image uses profiles of that image; a generic one, any
  const usable = profiles.filter(item => kind.group === "generic" || item.profile.base === kind.image);
  const chosen = profiles.find(item => item.profile.id === device.profile);
  const group = GROUPS.find(item => item.id === kind.group)!;
  // what this server has of it, as the Marketplace knows it
  const reachable = useImages(state => state.reachable);
  const status = useImages(state => state.images[image.id]);
  useEffect(() => { if(useImages.getState().reachable === null) void useImages.getState().refresh(); }, []);
  const live = reachable === false ? "unreachable" : status ?? null;

  const facts: [string, string][] = [
    [t("Imagen"), image.ref],
    [t("Versión"), image.version],
    [t("Publicada por"), t(image.publisher)],
    [t("Base"), image.base],
    [t("Shell"), image.shell],
    [t("Herramientas de red"), image.tools.join(", ")],
    [t("Arquitecturas"), image.architectures.join(", ")],
    [t("Licencia"), t(image.license)],
  ];

  return (
    <section className="image-card" aria-label={t("Imagen")}>
      <div className="image-head">
        <span className="props-icon"><Icon name={image.id} size={26} /></span>
        <div>
          <strong>{image.name} {image.version}</strong>
          <span className="mono muted">{image.ref}</span>
        </div>
        <span className={`tag tag-${group.id}`}>{t(group.label)}</span>
      </div>
      <div className="field image-profile">
        <label htmlFor={profileId}>{t("Perfil (Marketplace)")}</label>
        <select id={profileId} value={device.profile ?? ""} onChange={event => {
          const state = useStore.getState();
          const profile = event.target.value || undefined;
          state.commit(updateDevice(state.topology, device.id, item => ({ ...item, profile })));
        }}>
          <option value="">{t("Ninguno: la imagen {image}", { image: imageOf(device.type).ref })}</option>
          {usable.map(item => <option key={item.profile.id} value={item.profile.id}>{item.profile.name} ({item.profile.id})</option>)}
          {device.profile && !chosen && <option value={device.profile}>{t("{profile}: no existe en este servidor", { profile: device.profile })}</option>}
        </select>
        <small className="field-hint">
          {chosen
            ? `${chosen.profile.packages.length ? `+ ${chosen.profile.packages.join(", ")}. ` : ""}${chosen.state === "built" ? t("Construido.") : t("Sin construir: constrúyelo en el Marketplace.")}`
            : <button type="button" className="link small" onClick={() => useStore.getState().setMarketplace("profiles")}>{t("Crear un perfil con tus paquetes…")}</button>}
        </small>
      </div>
      {kind.group === "generic" && (
        <p className="muted small">{t("Este icono es genérico: en Emulación, este equipo es un contenedor {image}.", { image: image.name })}</p>
      )}
      {image.note && <p className="emu-note small">{t(image.note)}</p>}
      <p className="small">{t(image.description)}</p>

      <dl className="image-facts">
        {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>

      <h4>{t("En este servidor")}</h4>
      {live === null && <p className="muted small">{t("Consultando al emulador…")}</p>}
      {live === "unreachable" && <p className="muted small">{t("El emulador no responde: sin datos de Docker.")}</p>}
      {live && live !== "unreachable" && (live.pulled ? (
        <dl className="image-facts">
          <div><dt>{t("Estado")}</dt><dd>{t("Descargada")}</dd></div>
          {live.imageId && <div><dt>ID</dt><dd className="mono" title={live.imageId}>{live.imageId.replace(/^sha256:/, "").slice(0, 12)}</dd></div>}
          {live.digest && <div><dt>Digest</dt><dd className="mono wrap" title={live.digest}>{live.digest}</dd></div>}
          {live.architecture && <div><dt>{t("Arquitectura")}</dt><dd>{live.os}/{live.architecture}</dd></div>}
          {live.size !== undefined && <div><dt>{t("Tamaño")}</dt><dd>{megabytes(live.size)}</dd></div>}
          {live.created && <div><dt>{t("Creada")}</dt><dd>{new Date(live.created).toLocaleDateString(LANGS.find(item => item.id === lang)?.html, { dateStyle: "medium" })}</dd></div>}
        </dl>
      ) : <p className="muted small">{t("Aún no descargada: se descarga desde el Marketplace o al desplegar el primer laboratorio que la use.")}</p>)}

      <h4>{t("Enlaces")}</h4>
      <ul className="image-links">
        {image.links.map(link => (
          <li key={link.url}>
            <a href={link.url} target="_blank" rel="noreferrer noopener">{t(link.label)}</a>
            <span className="mono muted">{new URL(link.url).host}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
