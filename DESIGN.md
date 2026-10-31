# Diseño de visual-tracert

Cómo está diseñada la web: principios, estructura de la pantalla, temas, colores, tipografía,
componentes, lienzo, interacción, idiomas y accesibilidad. Es la referencia para cualquier
cambio visual o de comportamiento. Si algo de aquí deja de ser cierto, se corrige aquí en el
mismo cambio.

El código está en `apps/web/src`; los estilos, en un único `styles.css`, organizado por bloques
con un comentario de cabecera para cada uno.

## Principios

1. **El lienzo manda.** La red es lo principal; todo lo demás (barras, paneles, ventanas) flota
   sobre él o se pliega, y se puede mover o esconder.
2. **Un solo modelo, varias vistas.** El lienzo, el documento YAML/JSON, la simulación y la
   emulación leen la misma topología (`packages/model`). Lo que se cambia en una vista se ve en
   las demás al instante.
3. **Se explica lo que pasa.** Cada paquete, aviso y error dice qué ocurrió y qué hacer, en el
   idioma elegido. Nunca un fallo sin texto.
4. **Lo real se nota.** Simulación (paquetes calculados en el navegador) y Emulación
   (contenedores reales) son modos claramente separados; lo que solo funciona en uno lo dice.
5. **Sobrio.** Fondos neutros, un único color de acento por tema y color solo donde aporta
   información: protocolos, estados, topologías, marcas de las imágenes.

## Estructura de la pantalla

```
┌──────────────────────── barra superior ────────────────────────┐
│ logo · versión · laboratorio · Simulación/Emulación · idioma · tema │
├──────────────────────────────────────────┬─────────────────────┤
│ ┌─┐                                      │ Propiedades │ Doc… │
│ │h│  lienzo (React Flow)                 │                     │
│ │e│   topologías = rectángulos           │  panel lateral      │
│ │r│   dispositivos = baldosas            │  (acoplado, flotante│
│ │r│   cables con sus interfaces          │   o pantalla        │
│ └─┘                                      │   completa)         │
│        ventanas de dispositivos ⧉        │                     │
│   ┌─ barra inferior ─────────────────┐   │                     │
│   │ ⋮⋮ Añadir · Marketplace · Nueva   │   │                     │
│   │    topología · Registro           │   │                     │
├───┴───────────────────────────────────┴──┤                     │
│ registro de paquetes (acoplado, flotante u oculto)             │
└────────────────────────────────────────────────────────────────┘
```

- **Barra superior** (`TopBar.tsx`): marca y versión (`v{__APP_VERSION__}`), menú de
  laboratorios, selector de modo **Simulación / Emulación**, idioma y tema.
- **Barra de herramientas** (`Toolbar.tsx`, izquierda): seleccionar (V), ping (P),
  captura (C), eliminar (Supr), zoom, encuadrar (F), deshacer y rehacer.
- **Barra inferior** (`Palette.tsx`): «Añadir dispositivo» (A), «Marketplace»,
  «Nueva topología» y «Registro» (L).
- **Ambas barras se mueven** arrastrando su asa (⋮⋮); un doble clic en el asa las devuelve a su
  sitio. La posición se guarda en el navegador (`visual-tracert.positions`).
- **Panel lateral** (`App.tsx`): pestañas Propiedades, Documento y Simulación (Emulación en ese
  modo). Se redimensiona por su borde izquierdo, se desacopla como ventana flotante o se abre a
  pantalla completa (Esc vuelve).
- **Registro de paquetes** (`LogPanel.tsx`): acoplado abajo, flotante u oculto.
- **Ventanas de dispositivo** (`DeviceWindow.tsx`, doble clic en un dispositivo): flotan sobre el
  lienzo, se mueven por su cabecera y se redimensionan por la esquina. Pueden abrirse varias.
  Cada una puede sacarse a una **ventana del navegador aparte** (`Popup.tsx`): React la dibuja
  allí con un portal, compartiendo el estado, y se le copian los estilos y el tema.
- **Diálogos modales** (`<dialog>` nativo): la galería de plantillas y el Marketplace. Esc o un
  clic fuera los cierran; mientras están abiertos, los atajos del lienzo no actúan.
- **Avisos** (toasts): abajo en el centro del lienzo; los de error duran más (6 s frente a 3,5 s).

Por debajo de 980 px el panel lateral pasa debajo del lienzo (y se oculta el nombre de la marca);
por debajo de 760 px la galería pone el detalle debajo de la lista, y por debajo de 720 px el
editor de perfiles del Marketplace pasa a una columna.

## Temas

Cuatro temas, cada uno con los mismos tokens; se eligen en la barra superior y se guardan en el
navegador. El tema se aplica con `body[data-theme]`.

| Tema | Base | Acento | Claro |
|---|---|---|---|
| Azul (por defecto) | negros y grises neutros | `#3d7eff` | no |
| Marrón | negros cálidos | `#c8834b` | no |
| Editorial | papel `#f5f3ee` y blanco | `#b3261e` | sí |
| Morado | negros violáceos | `#9b6dff` | no |

En los temas oscuros los grises son puros (sin tinte). Monaco (el editor del documento) construye
su tema a partir de estos mismos tokens, y React Flow cambia a su modo claro con Editorial.

### Tokens

| Grupo | Tokens | Uso |
|---|---|---|
| Fondos | `--bg`, `--canvas`, `--dots`, `--surface`, `--surface-2`, `--surface-3` | página, lienzo y su trama de puntos, superficies de 1.º a 3.er nivel |
| Líneas | `--line`, `--line-strong` | bordes y separadores |
| Texto | `--ink`, `--ink-2`, `--ink-3` | principal, secundario, terciario/pistas |
| Acento | `--accent`, `--accent-ink`, `--accent-soft`, `--accent-glow` | botón principal, selección, foco |
| Estados | `--ok`, `--ok-soft`, `--danger`, `--danger-soft` | éxito/en marcha, error/detenido |
| Puertos | `--port` | asas de conexión y puntos de los cables |
| Protocolos | `--arp`, `--icmp`, `--tcp`, `--http`, `--dns`, `--dhcp`, `--packet` | paquete animado, registro, filtros y captura |
| Forma | `--radius` (16 px), `--radius-s` (10 px), `--shadow` | esquinas y elevación |
| Letra | `--sans`, `--heading`, `--mono` | ver Tipografía |

Reglas:
- **No hay colores sueltos** en los componentes: se usan tokens. Las excepciones son los colores
  de marca (logos de imágenes), los colores de topología que elige el usuario y la terminal (que
  es oscura en todos los temas).
- Un tono suave se obtiene con `color-mix(in srgb, <color> N%, var(--surface))`, no con una
  paleta aparte. Así funciona en todos los temas.

### Colores con significado

- **Protocolos:** cada protocolo tiene su token y el mismo color en el paquete del lienzo, la
  fila del registro, el filtro y la columna Protocolo de la captura.
- **Topologías:** ocho colores propuestos (`ZONE_COLORS` en `packages/model/src/zones.ts`:
  azul, verde, naranja, rojo, morado, turquesa, mostaza y gris) o cualquier `#rrggbb`. El
  rectángulo usa el 11 % del color de relleno y el 55 % en el borde.
- **Estado de topología:** Iniciada (`--ok`), Detenida (`--danger`), Híbrida (mostaza).
- **Etiquetas de grupo:** «Imágenes oficiales» usa el azul del logo de Alpine (`#0d597f`)
  mezclado con la superficie; «Genéricos», gris neutro.
- **Perfil de imagen:** la etiqueta bajo el nombre del dispositivo es violeta (`#9b6dff`
  mezclado); con borde discontinuo si el perfil no está construido o no existe en el servidor.

## Tipografía

- `--sans`: Poppins, Inter o la del sistema. Interfaz general, 13–14 px.
- `--heading`: igual que `--sans`, salvo en Editorial (Source Serif 4, serif). Títulos y nombres
  de dispositivos (15 px, 600).
- `--mono`: JetBrains Mono, Cascadia Code o la monoespaciada del sistema. IPs, MACs, ids,
  interfaces, comandos, documento, consola y captura (11–13 px).

Las fuentes no se empaquetan: si no están instaladas se usa la siguiente de la lista. La app
funciona sin Internet.

Textos de ayuda y pistas: 12–12,5 px en `--ink-3`. Las etiquetas de los campos van encima del
campo, a 12 px.

## Iconos

- **Iconos de línea** propios (`editor/icons.tsx`): 24 × 24, trazo `currentColor`, sin relleno.
  Cubren los dispositivos genéricos, las herramientas y la interfaz. Uno nuevo se dibuja con el
  mismo grosor y estilo, no se importa de otra colección.
- **Logos de imágenes** (`BRANDS` en `icons.tsx`), con sus colores propios sobre fondo blanco:
  - Alpine: su logo oficial (alpinelinux.org), sobre un hexágono blanco para que se lea en
    cualquier tema.
  - Ubuntu, Debian y NGINX: Simple Icons (CC0), en el color de cada marca.
  - BusyBox, netshoot, FRRouting y MikroTik RouterOS («MT»): no tienen logo disponible, así que
    llevan una insignia de iniciales en un cuadrado de color. No se inventan logos de marcas.
- La procedencia de cada logo se enlaza desde la tarjeta de la imagen.

## Componentes

- **Botones:** `primary` (acento, una acción principal por bloque), `ghost` (secundario, borde
  fino), `danger` (destructivo, rojo) y `icon-button` (solo icono, 34 px, siempre con `title` y
  `aria-label`). `small` reduce cualquiera.
- **Campos** (`Field.tsx`): etiqueta encima; se aplican con Enter o al salir del campo (un paso
  de deshacer por edición, no por tecla); Esc vuelve al valor anterior. El error se muestra
  debajo en rojo y el valor no se aplica.
- **Etiquetas** (`.tag`): píldoras pequeñas para grupo, estado o perfil.
- **Chips** (`.chip`): filtros conmutables (niveles de la galería, protocolos del registro).
- **Tarjetas** (`.market-card`, `.image-card`, `.service-card`): superficie de 2.º nivel, borde
  fino y radio de 14 px. Discontinuas cuando informan de algo no disponible (fabricantes).
- **Pestañas** (`.tabs`): subrayado de 2 px en el color de acento bajo la activa.
- **Notas** (`.emu-note`): fondo `--accent-soft`, para avisos que no son errores. Los errores
  van en `.outcome.fail`.
- **Consola y terminal:** monoespaciada. La terminal (xterm.js) es siempre oscura, con su propia
  paleta ANSI.

## El lienzo

- **Dispositivo:** una baldosa de 56 × 56 px con su icono o logo, y a la derecha su nombre
  (`--heading`, 15 px), su IP principal y, si usa uno, la etiqueta de su perfil. Las asas de
  conexión aparecen al pasar el ratón o al seleccionar.
  - **Seleccionado:** borde de acento y halo.
  - **Paquete llegando** en la simulación: baldosa en acento con brillo, o en rojo si el paquete
    se descarta.
  - **Origen de un ping:** borde discontinuo.
  - **No se inicia** en Emulación: atenuado al 40 % y en grises.
- **Cable:** línea recta de centro a centro de las baldosas, con un punto (`--port`) en cada
  extremo y el nombre de la interfaz de cada lado (`Gi0/1 ── Fa0/1`).
  - Cada etiqueta se coloca justo fuera del nodo del que sale (baldosa más textos), por donde sale
    el cable, sin pasar de la mitad. Así no tapa el nombre del dispositivo ni la tapa a ella.
  - Por debajo del 55 % de zoom se ocultan, salvo en el cable seleccionado.
- **Paquete** (simulación): un sobre del color de su protocolo que recorre el cable en 0,6 s.
- **Topología:** un rectángulo translúcido de su color, 30 px alrededor de sus dispositivos.
  - **Cabecera:** píldora con punto de color, nombre y estado. Sirve para arrastrarla con todo lo
    que contiene; un clic en ella abre sus propiedades.
  - **Texto:** la nota va abajo, dentro del rectángulo.
  - **Clics en el resto del rectángulo:** pasan al lienzo, para seguir desplazando y seleccionando
    a través de él.
  - **Topología vacía:** un rectángulo de 320 × 180 px donde se dejó.
  - **Decoraciones desactivadas** (`canvas.decorations: false`): no se dibujan los rectángulos.
- **Fondo:** trama de puntos (`--dots`) y minimapa arriba a la derecha.

## Interacción

| Acción | Cómo |
|---|---|
| Añadir dispositivo | A, o «Añadir dispositivo»: buscar y luego clic, Enter o arrastrar. Los grupos están cerrados hasta abrirlos; al buscar se abren los que tienen resultados |
| Cablear | Arrastrar desde el borde de un dispositivo a otro (se usan los primeros puertos libres) |
| Mover | Arrastrar dispositivos; una topología, por su cabecera. Soltar un dispositivo dentro de otra topología lo pasa a ella |
| Propiedades | Clic (panel lateral) o doble clic (ventana del dispositivo, con CLI y Captura) |
| Ping | P, clic en el origen y luego en el destino. En Emulación es un ping real |
| Captura | C, clic en un cable (su interfaz) o en un dispositivo (todas). También desde las propiedades del cable |
| Eliminar | Supr o Retroceso. Una topología se elimina con sus dispositivos |
| Deshacer / rehacer | Ctrl+Z / Ctrl+Y (o Ctrl+Mayús+Z). Un arrastre es un solo paso |
| Encuadrar | F |
| Registro | L |
| Recorrer la simulación | ← → |
| Salir de una herramienta o de la pantalla completa | Esc |

Los atajos no actúan mientras se escribe en un campo, en el documento o en una terminal.

## Modos

- **Simulación:** todo ocurre en el navegador. La pestaña del panel se llama Simulación; las
  acciones (ping, traza, DHCP, DNS, web) se reproducen paso a paso con velocidad elegible
  (tiempo real, 0,5×, 1×, 2×, 4×).
- **Emulación:** la pestaña pasa a llamarse Emulación. Se despliega el laboratorio como
  contenedores. Las ventanas de dispositivo ofrecen su CLI real (con selector de shell: `vtysh`,
  `sr_cli`, `bash`, `zsh`, `sh`) y la captura de tráfico.
  - **Aviso de cambios:** si la topología cambió desde el despliegue, una nota lo dice.
  - **Huella:** el cambio se detecta con una huella de la red (`networkFingerprint`) que no tiene
    en cuenta posiciones ni textos.

## Marketplace

- **Pestaña Imágenes:** una tarjeta por imagen, con su logo, referencia, estado (Incluida,
  Descargada o No descargada), descripción, quién la publica, notas, herramientas, tamaño y
  descargar/quitar. Las que se construyen en el servidor (máquinas virtuales, como RouterOS) dicen
  Construida o No construida, y su botón es «Construir», porque tarda unos minutos.
- **Sistemas de fabricantes:** debajo de las imágenes, en tarjetas discontinuas, los sistemas de
  red que no se pueden ofrecer aquí, con la vía oficial para conseguirlos.
- **Pestaña Perfiles:**
  - A la izquierda, la lista de perfiles, con su estado (Construido, Cambió o Sin construir), y
    los puntos de partida.
  - A la derecha, el editor del perfil, los botones Guardar y Construir, y la salida de la
    construcción.

## Captura de tráfico

Una tabla al estilo de Wireshark (`capture/CaptureView.tsx`). Sus columnas son número, tiempo
relativo, origen, destino, protocolo (en su color) e información, que usa los mismos términos que
Wireshark, como `Echo (ping) request` o `Who has … ? Tell …`.

- **Selección:** al elegir un paquete se ven sus capas, desplegables, y su volcado hexadecimal.
- **Desplazamiento:** la lista sigue al último paquete mientras no se suba.
- **Descarga:** lo capturado se descarga como `.pcap`.
- **Dos filtros, separados:**
  - el de captura, sintaxis de tcpdump, que se aplica en el servidor;
  - «Mostrar», texto libre, que se aplica en la página.

## Documento (YAML/JSON)

- **Editor:** Monaco, con resaltado YAML/JSON, plegado de secciones, búsqueda, marcas de error en
  la línea (con su mensaje al pasar el ratón) y resaltado de corchetes.
- **Formato (versión 3):** separa la configuración (`topology`, `links`) del dibujo (`canvas`:
  `decorations`, `topologies` y `positions`). Las posiciones se escriben una por línea
  (`pc-1: { x: 60, y: 300 }`).
- **Valores de `status`:** se escriben como `up`, `down` o `hybrid`. Al leer también se aceptan
  on/off, true/false y, de versiones anteriores, start/stop.

## Idiomas

- Español (de origen), inglés y portugués de Brasil. El idioma se elige en la barra superior.
- **Textos en el código:** cada texto visible se escribe en español dentro de `t("…")`, o de
  `tx("…")` si se traduce más tarde. Los valores variables van entre llaves: `{device}`.
- **Diccionarios:** `packages/model/src/i18n/{en,pt}.ts`.
- **Prueba de completitud:** una prueba recorre el código y falla si un texto no tiene
  traducción, si sobran entradas o si no coinciden los `{valores}`.
- **Términos técnicos:** los de protocolo (ARP, `Echo (ping) request`, flags TCP) y los
  comandos se dejan como en las herramientas reales.
- **Tono:** de tú, frases cortas, verbo primero en las acciones («Desplegar», «Capturar tráfico
  en este cable»).

## Accesibilidad

- **Etiquetas:** cada botón de solo icono lleva `aria-label` y `title` (con su atajo).
- **Teclado:** las listas de selección (añadir dispositivo, plantillas) son `listbox`/`option`
  y se recorren con las flechas.
- **Roles:** las ventanas y diálogos tienen `role="dialog"` y nombre accesible. Los errores
  usan `role="alert"` y los estados, `role="status"`.
- **Contraste:** los colores de texto cumplen contraste sobre su superficie en los cuatro temas.
  El color nunca es la única señal: el estado y el protocolo también van escritos.
- **Movimiento reducido:** con `prefers-reduced-motion`, las animaciones y transiciones se
  reducen al mínimo.

## Qué guarda el navegador

`localStorage`, con el prefijo `visual-tracert.`:
- los laboratorios (cada uno como documento JSON);
- el tema, el idioma y la velocidad;
- la disposición del panel lateral y del registro;
- la posición de las barras.

Lo del servidor (imágenes descargadas, perfiles) no se guarda en el navegador: se pide al
emulador.
