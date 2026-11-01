# visual-tracert

**Aprende redes rompiendo y arreglando laboratorios reales.**
Una plataforma de retos de networking al estilo de HackTheBox: cada máquina es una red con algo roto;
la diagnosticas, la arreglas desde la CLI de equipos reales y subes en el ranking.

**Versión 0.5.0 · alpha** · en marcha en **https://visualtracert.online** (registro con invitación)

---

## Qué es

Aprender redes suele ser leer teoría o montar laboratorios a mano. visual-tracert junta las dos cosas
en un camino con objetivos, como las plataformas de hacking ético, pero de networking:

- **Aprendes** con guías completas (de qué es una red a subnetting e IPv6), cada concepto con su
  diagrama y un quiz al final de cada nivel.
- **Practicas** con máquinas: laboratorios con una avería o algo por hacer. En **Fácil** los
  resuelves desde la interfaz, viendo cada paquete en la simulación; en **Medio**, solo desde la
  CLI de equipos reales, como en una red de verdad.
- **Compites**: cada máquina da XP, el servidor comprueba cada reto en los equipos reales, y hay
  rangos, tracks, temporadas temáticas y un ranking global.

Está pensada para quien empieza en redes, para quien prepara una certificación (CCNA, MTCNA…) y
para profesores que quieren dar laboratorios a su clase y seguir su progreso.

## Estado del proyecto: alpha

| Fase | Qué significa | |
|---|---|---|
| **alpha** | Funciona de punta a punta y está en Internet, pero cambia cada semana: puede haber cambios que rompan datos y el registro es solo con invitación. | ← **aquí** |
| beta | Contenido y funciones estables, registro abierto (correo verificado o Google/GitHub), copias de seguridad probadas y nada que rompa los datos de los usuarios. | |
| stable | 1.0: compromiso de compatibilidad, más máquinas por tema y soporte para aulas. | |

La fase está en el `package.json` raíz (`"stage"`), en el CHANGELOG, en cada etiqueta de versión y
en la barra superior de la app (junto al número de versión).

## Cómo se aprende

- **Starting Point.** Tres guías largas —Fundamentos, Conceptos y Referencias— en español, inglés y
  portugués: modelos OSI y TCP/IP, binario, IPv4 y máscaras, ARP, switching y VLAN, enrutamiento,
  TCP y UDP a fondo, ICMP, DHCP, DNS, NAT, cabeceras, subnetting, IPv6, CLI de Linux y MikroTik y
  diagnóstico por capas. 35 diagramas, enlaces a los RFC y un quiz final por nivel (más de 150
  preguntas; se aprueba con el 75 %). Y las primeras máquinas.
- **Máquinas.** Cada una con su nombre, su historia, su nivel (básico, intermedio, avanzado), su
  XP, sus protocolos como etiquetas, un walkthrough y la solución (ocultos hasta que los pidas).
- **Protocolos.** Una página por protocolo (ARP, IPv4, ICMP, VLAN, TCP, UDP, DHCP, DNS, HTTP…) con
  lo esencial, cómo verlo en el laboratorio, sus diagramas, sus máquinas y su documentación.
- **Tracks.** Caminos guiados con un objetivo: primeros pasos, switching y VLAN, enrutamiento,
  servicios de red, la CLI de principio a fin, diagnóstico.
- **Seasons y ranking.** Temporadas de máquinas alrededor de un tema, cada una con su ranking, y el
  ranking global por XP.
- **Inicio.** Tu nivel, tu racha semanal, tu XP de las últimas semanas, máquinas para ti y las que
  tienes en curso.

### Las máquinas de hoy

| Máquina | Tema | Nivel | Protocolos |
|---|---|---|---|
| Hola, Vecino | Fundamentos IP | Básico | Ethernet, ARP, IPv4, ICMP |
| Máscara Rota | Fundamentos IP | Intermedio | IPv4, ARP, ICMP |
| Muro Invisible | Switching y VLAN | Básico | VLAN, Ethernet, ICMP |
| El Infiltrado | Switching y VLAN | Intermedio | VLAN, Ethernet, ICMP |
| Puerta Cerrada | Enrutamiento | Básico | Enrutamiento, IPv4, ARP, ICMP |
| Puente Entre Islas | Enrutamiento | Intermedio | Enrutamiento, IPv4, ICMP |
| Rumbo a Internet | Enrutamiento | Avanzado | Enrutamiento, IPv4, ICMP |
| Reparto Vacío | DHCP | Básico | DHCP, UDP, IPv4 |
| El Mensajero | DHCP | Intermedio | DHCP, UDP, enrutamiento |
| Guía Telefónica | DNS y web | Básico | DNS, UDP |
| Web Perdida | DNS y web | Intermedio | HTTP, DNS, TCP |
| Triple Avería | Diagnóstico | Avanzado | Enrutamiento, VLAN, ARP, ICMP |

Todas se juegan en Fácil y en Medio. Los administradores editan las máquinas (nombre, historia,
nivel, XP, imagen, walkthrough en PDF) y crean las suyas a partir de un laboratorio, desde el panel.

## Laboratorios de verdad

En Medio, cada equipo es un **contenedor real** y cada cable un enlace virtual (par veth):

- **Linux** (Alpine, Ubuntu, Debian) con iproute2: `ip`, `bridge`, `ping`, `traceroute`, `ss`,
  `tcpdump`, `dig`. Los switches son puentes Linux con VLAN.
- **Servicios** funcionando en los equipos: DHCP, DNS y relay DHCP (dnsmasq) y web (httpd).
- **MikroTik RouterOS** (el CHR oficial, como máquina virtual) y **Nokia SR Linux**, más FRRouting.
- **Capturas de tráfico** en cualquier cable, que se descargan como .pcap para Wireshark.

El servidor comprueba cada reto en Medio en los equipos reales (que el laboratorio sea el reto tal
como empieza, y pings, DHCP, DNS, web y VLAN de verdad) antes de darlo por superado y apuntarlo en
el ranking, con el tiempo medido por él mismo.

Además de los retos, hay un **laboratorio libre**: un editor visual de topologías para montar tus
propias redes y mirarlas paquete a paquete (**Simulación**) o desplegarlas con equipos reales
(**Emulación**), con plantillas y documento YAML/JSON editable.

## Para profesores y administradores

- Cuentas con **roles** (alumno, profesor, administrador) y **registro con invitación**: códigos con
  su rol, sus usos y su caducidad.
- **Alumnos:** el progreso de cada cuenta (XP, retos superados, tiempos), para profesores.
- **Máquinas y seasons:** editar y crear máquinas, crear temporadas con su tema y sus máquinas.
- **Todo en la cuenta:** laboratorios (con versiones anteriores), perfil, preferencias y progreso
  se guardan en el servidor y siguen al usuario a cualquier navegador.
- Cada laboratorio desplegado es de quien lo desplegó, con un límite de laboratorios y equipos por
  cuenta.

## Arquitectura

Un monorepo con workspaces de npm:

```
apps/
  web/        la web (Vite + React): landing, Practicar, el laboratorio libre y el panel
  api/        cuentas, progreso, ranking, máquinas y laboratorios guardados (Node + SQLite)
  emulator/   los laboratorios reales: un contenedor por equipo, un par veth por cable (Node + Docker)
    vrnetlab/ las imágenes de máquinas virtuales (RouterOS) que el emulador construye
packages/
  model/      lo que comparten: topología, documento, catálogo, máquinas, guías, protocolos y traducciones
deploy/       producción: compose detrás de Caddy (HTTPS), copias de seguridad y preparación del servidor
docs/         documentación técnica
```

nginx (en la imagen de la web) pregunta al servicio de cuentas antes de cada petición al emulador:
sin sesión no se llega a ningún laboratorio ni CLI. El emulador tiene el socket de Docker y entra en
el espacio de red de otros contenedores, así que es root sobre la máquina: nunca se publica, solo se
alcanza a través de la web.

Más detalles: [docs/](docs/README.md) (arquitectura, emulador por dentro, documento y API) y
[DESIGN.md](DESIGN.md) (el diseño de la web).

## Desarrollo

```sh
npm install                      # instala y enlaza todos los workspaces
npm run dev                      # la web en modo desarrollo
npm test                         # las pruebas de todos los workspaces
npm run typecheck
docker compose up -d --build     # todo en Docker, la web en el puerto 9150
```

La primera vez, la web pide crear el administrador con el código de instalación que muestra
`docker compose logs api`; las demás cuentas se crean con invitaciones (panel → Usuarios). Más en
[docs/desarrollo.md](docs/desarrollo.md).

## Despliegue

Cada push a `main` pasa las pruebas, construye las imágenes para x86 y las publica en GHCR, y el
servidor las descarga y reinicia (GitHub Actions). Delante va Caddy con HTTPS automático. La guía
está en [deploy/README.md](deploy/README.md).

## Versiones

Todo el repositorio comparte una versión ([SemVer](https://semver.org/lang/es/)) y una fase (alpha,
beta, stable). Cada versión queda en [CHANGELOG.md](CHANGELOG.md) y en una etiqueta `vX.Y.Z`. Para
publicar una:

1. Pasa lo de «Sin publicar» del CHANGELOG a la nueva versión, con su fecha y su fase.
2. `npm version X.Y.Z --workspaces --include-workspace-root --no-git-tag-version` (y, si cambia,
   la fase en `"stage"` del `package.json` raíz).
3. Commit `chore: release X.Y.Z`, etiqueta `git tag -a vX.Y.Z -m "visual-tracert X.Y.Z (alpha)"` y
   push con `--follow-tags`.

---

Las marcas (Linux, MikroTik, Nokia, Huawei, Cisco…) pertenecen a sus dueños y se mencionan solo para
indicar con qué sistemas se practica o se practicará; ninguna patrocina este proyecto.
