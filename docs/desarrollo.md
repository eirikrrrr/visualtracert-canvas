# Desarrollo

## Requisitos

- Node 22 o superior y npm.
- Docker con Compose, para la emulación.
- Para máquinas virtuales rápidas (RouterOS), `/dev/kvm` en el servidor.

## Arrancar

```sh
npm install                     # instala y enlaza los workspaces
npm run dev                     # el editor en Vite (:5180), con /api reenviado al emulador
docker compose up -d --build    # la app completa: editor en 127.0.0.1:9160, emulador en 127.0.0.1:9161
```

No hay cuentas ni inicio de sesión: se abre y se usa. Por eso todo escucha solo en este equipo.

Con `ALLOW_PRIVILEGED=1 docker compose up -d` el emulador permite imágenes que necesitan un
contenedor privilegiado (Nokia SR Linux).

Tras cambiar algo visual o de comportamiento, reconstruye con `docker compose up -d --build` y
compruébalo en `127.0.0.1:9160`.

## Comprobar

```sh
npm run typecheck    # TypeScript en todos los workspaces
npm test             # Vitest en todos los workspaces
```

| Workspace | Qué prueban sus tests |
|---|---|
| `packages/model` | El documento (ida y vuelta, versiones anteriores, errores con su línea), los perfiles |
| `apps/web` | La simulación (ARP, ICMP, DHCP, DNS, TCP…), las plantillas, el lector pcap y las traducciones |
| `apps/emulator` | El plan de cada laboratorio (sin Docker): contenedores, cables, scripts por rol, SR Linux, RouterOS, inicios a mano |

El plan es puro a propósito: casi todo lo que hace el emulador se prueba sin Docker. Lo que toca
Docker (desplegar, cables, CLI, captura) se prueba contra el servidor real.

## Traducciones

Los textos se escriben en español dentro del código y se traducen donde se muestran:

- `t("texto")` traduce al momento; `tx("texto")` marca un texto que se traduce después (para
  listas y constantes).
- Los diccionarios están en `packages/model/src/i18n/en.ts` y `pt.ts` (portugués de Brasil).
  No se importan con el modelo: el emulador añade los dos (`@visual-tracert/model/dictionaries`),
  y la web carga solo el del idioma elegido, antes del primer render y al cambiar de idioma
  (`loadLang` en `apps/web/src/i18n`). El español no necesita ninguno.
- Un test falla si falta una traducción, si sobra una que ya no se usa, o si sus `{variables}`
  no coinciden.

## Rendimiento

- **Carga inicial de la web:** el lienzo y el panel lateral. Se cargan bajo demanda, al usarse
  por primera vez: el editor del documento (Monaco), la terminal (xterm.js), la captura, el
  Marketplace, el panel de usuario, la galería de plantillas y el diccionario del idioma.
- **Ventanas aparte del navegador:** copian también las hojas de estilo que llegan después de
  abrirse (las de una parte cargada bajo demanda), con un `MutationObserver`.
- **Emulador:** todos los cables de un despliegue o un reinicio se crean con un solo proceso
  (`ip -batch`), y los comandos de arranque usan los ids de los contenedores recién creados en
  lugar de volver a listarlos.

## Estilo del código

- TypeScript estricto, módulos ES, sin frameworks en el emulador.
- Los comentarios explican el porqué y el qué de cada pieza, no el cómo línea a línea.
- Colores, letras y movimiento solo con los tokens de `styles.css` (ver [DESIGN.md](../DESIGN.md)).

## Publicar una versión

Todo el repositorio comparte una versión ([SemVer](https://semver.org/lang/es/)):

1. Pasa lo de «Sin publicar» del [CHANGELOG](../CHANGELOG.md) a la nueva versión, con su fecha.
2. `npm version X.Y.Z --workspaces --include-workspace-root --no-git-tag-version`
3. Commit `chore: release X.Y.Z`, etiqueta `git tag -a vX.Y.Z -m "visualtracert-canvas X.Y.Z"` y
   `git push --follow-tags`.

La app muestra su versión junto al nombre, y el emulador en `/api/health`.
