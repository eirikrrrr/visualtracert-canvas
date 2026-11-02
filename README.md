# visualtracert-canvas

**Un lienzo para montar redes y probarlas de verdad.** Dibuja una topología con routers,
switches, PCs y servidores, mírala paquete a paquete en la simulación o despliégala con equipos
reales en contenedores y entra en su CLI.

Es el editor y la emulación personalizada de [visual-tracert](https://github.com/eirikrrrr/visual-tracert),
separados en un proyecto propio. visual-tracert sigue como plataforma de retos (máquinas,
guías, ranking); aquí queda solo el lienzo, como herramienta local, sin cuentas.

**Versión 0.5.0 · alpha**

---

## Qué hace

- **Editor visual de topologías:** añade equipos desde una paleta (genéricos e imágenes reales),
  cablea arrastrando de un equipo a otro, agrúpalos en topologías con su rectángulo y edita cada
  propiedad en el inspector: interfaces, IP, VLAN, rutas, DHCP, DNS y web.
- **Documento YAML/JSON:** el mismo laboratorio como texto editable (Monaco), con errores en su
  línea. El lienzo y el documento son dos vistas de la misma topología.
- **Simulación:** ping, traza, DHCP (con relay), DNS y páginas web por TCP calculados en el
  navegador y reproducidos trama a trama sobre el lienzo, con sus cabeceras y un registro de
  paquetes.
- **Emulación:** cada equipo es un contenedor real y cada cable un par veth. CLI de cada equipo
  en el navegador y captura de tráfico en cualquier cable, descargable como .pcap para Wireshark.
- **Equipos:** Linux (Alpine, Ubuntu, Debian) con iproute2, FRRouting, servicios con dnsmasq y
  httpd, MikroTik RouterOS (CHR, como máquina virtual) y Nokia SR Linux.
- **Marketplace:** descarga imágenes y crea perfiles con tus propios paquetes y comandos.
- **Plantillas** para empezar, varios laboratorios guardados en el navegador, cuatro temas y la
  interfaz en español, inglés y portugués.

## Arrancar

Necesitas Docker con Compose (y `/dev/kvm` para que RouterOS vaya rápido).

```sh
docker compose up -d --build
```

Abre **http://127.0.0.1:9160**. No hay cuentas ni inicio de sesión.

> **Solo en este equipo.** El emulador tiene el socket de Docker y es privilegiado: quien llega a
> la web es root sobre la máquina. Por eso todo escucha en `127.0.0.1`. Para usarlo desde otro
> equipo, un túnel SSH (`ssh -L 9160:127.0.0.1:9160 servidor`) o un proxy que pida quién eres;
> nunca lo publiques tal cual.

Con `ALLOW_PRIVILEGED=1 docker compose up -d` se permiten las imágenes que necesitan un
contenedor privilegiado (Nokia SR Linux).

## Desarrollo

```sh
npm install                      # instala y enlaza los workspaces
docker compose up -d emulator    # el emulador, en 127.0.0.1:9161
npm run dev                      # la web en Vite (http://127.0.0.1:5180), con /api reenviado al emulador
npm test                         # las pruebas de todos los workspaces
npm run typecheck
```

## Arquitectura

```
apps/
  web/        la web (Vite + React): lienzo, inspector, documento, simulación, CLI y captura
  emulator/   los laboratorios reales: un contenedor por equipo, un par veth por cable (Node + Docker)
    vrnetlab/ las imágenes de máquinas virtuales (RouterOS) que el emulador construye
packages/
  model/      lo que comparten: topología, documento, catálogo, imágenes, plantillas y traducciones
docs/         documentación técnica
```

Más detalles en [docs/](docs/README.md) (arquitectura, el emulador por dentro, el documento y la
API) y en [DESIGN.md](DESIGN.md) (el diseño de la interfaz).

## Versiones

Todo el repositorio comparte una versión ([SemVer](https://semver.org/lang/es/)) y una fase (alpha,
beta, stable). Cada versión queda en [CHANGELOG.md](CHANGELOG.md) y en una etiqueta `vX.Y.Z`. Las
etiquetas hasta `v0.5.0` son de la historia común con visual-tracert.

---

Las marcas (Linux, MikroTik, Nokia…) pertenecen a sus dueños y se mencionan solo para indicar con
qué sistemas funciona; ninguna patrocina este proyecto.
