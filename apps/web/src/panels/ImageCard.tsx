// The image a device runs as in the emulation: what it is, what it brings,
// where it comes from (its official pages) and, once a lab pulled it, what
// Docker has of it on this server.
import { CATALOG, GROUPS, imageOf, type Device, type ImageId } from "@visual-tracert/model";
import { useEffect, useState } from "react";
import { Icon } from "../editor/icons";
import { emulator, type ImageStatus } from "../emulation/api";
import { LANGS, useLang, useT } from "../i18n";

// asked once per image while the page is open
const asked = new Map<ImageId, Promise<ImageStatus>>();
function imageStatus(id: ImageId): Promise<ImageStatus> {
  if(!asked.has(id)) asked.set(id, emulator.image(id).catch(error => { asked.delete(id); throw error; }));
  return asked.get(id)!;
}

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function ImageCard({ device }: { device: Device }) {
  const t = useT();
  const lang = useLang(state => state.lang);
  const image = imageOf(device.type);
  const kind = CATALOG[device.type];
  const group = GROUPS.find(item => item.id === kind.group)!;
  const [live, setLive] = useState<ImageStatus | null | "unreachable">(null);

  useEffect(() => {
    let current = true;
    imageStatus(image.id).then(status => current && setLive(status), () => current && setLive("unreachable"));
    return () => { current = false; };
  }, [image.id]);

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
      {kind.group === "generic" && (
        <p className="muted small">{t("Este icono es genérico: en Emulación, este equipo es un contenedor {image}.", { image: image.name })}</p>
      )}
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
      ) : <p className="muted small">{t("Aún no descargada: se descarga al desplegar el primer laboratorio.")}</p>)}

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
