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
┌──────────────────────────── barra superior ────────────────────────────┐
│ logo · versión · Emulación/Simulación · laboratorio ⓘ · idioma · tema · ◉ │
├────────────────────────────────────────────────┬───────────────────────┤
│ ┌─┐                          ┌─ inspector ───┐ │ Emulación │ Documento │
│ │h│  lienzo (React Flow)     │ propiedades   │ │                       │
│ │e│   topologías             │ de lo         │ │  panel lateral        │
│ │r│   dispositivos           │ seleccionado  │ │  (acoplado, flotante  │
│ │r│   cables                 └───────────────┘ │   o pantalla          │
│ └─┘                                            │   completa)           │
│         ventanas de dispositivos ⧉             │                       │
│   ┌─ barra inferior ─────────────────┐ ┌────┐  │                       │
│   │ ⋮⋮ Añadir · Marketplace · Nueva   │ │mini│  │                       │
│   │    topología · Registro           │ │mapa│  │                       │
├───┴───────────────────────────────────┴─┴────┴─┤                       │
│ registro de paquetes (acoplado, flotante u oculto)                     │
└────────────────────────────────────────────────────────────────────────┘
```

- **Menú de laboratorios:** el reto en curso en su sección, y cada laboratorio con su papelera
  (aparece al pasar el ratón; la confirmación ocupa la misma fila). Con más de seis, un buscador.
- **Barra superior** (`TopBar.tsx`): marca y versión (`v{__APP_VERSION__}`), selector de modo
  **Practicar / Emulación / Simulación**, el laboratorio (su nombre, ⓘ para ver sus datos en el inspector y
  el menú de laboratorios), idioma, tema y el avatar, que abre el panel de usuario.
- **Barra de herramientas** (`Toolbar.tsx`, izquierda): seleccionar (V), ping (P),
  captura (C), eliminar (Supr), zoom, encuadrar (F), deshacer y rehacer.
- **Barra inferior** (`Palette.tsx`): «Añadir dispositivo» (A), «Marketplace»,
  «Nueva topología» y «Registro» (L).
- **Ambas barras se mueven** arrastrando su asa (⋮⋮); un doble clic en el asa las devuelve a su
  sitio. La posición se guarda en el navegador (`visual-tracert.positions`).
- **Inspector** (`Inspector.tsx`): una tarjeta sobre el lienzo, arriba a la derecha, con las
  propiedades de lo seleccionado (dispositivo, cable o topología). Sin selección no está. ⓘ en
  la barra superior lo abre con los datos del laboratorio (notas, cifras, topologías), y se abre
  solo así al abrir una plantilla. Esc o ✕ lo cierran.
- **Panel lateral** (`App.tsx`): dos pestañas, Emulación (Simulación en ese modo) y Documento.
  Se redimensiona por su borde izquierdo, se desacopla como ventana flotante o se abre a
  pantalla completa (Esc vuelve).
- **Registro de paquetes** (`LogPanel.tsx`): acoplado abajo, flotante u oculto.
- **Ventanas de dispositivo** (`DeviceWindow.tsx`, doble clic en un dispositivo): flotan sobre el
  lienzo, se mueven por su cabecera y se redimensionan por la esquina. Pueden abrirse varias.
  Cada una puede sacarse a una **ventana del navegador aparte** (`Popup.tsx`): React la dibuja
  allí con un portal, compartiendo el estado, y se le copian los estilos y el tema.
- **Diálogos modales** (`<dialog>` nativo): la galería de plantillas, el Marketplace y el panel
  de usuario (`Dashboard.tsx`). Esc o un
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
| Azul | negro medianoche y grises fríos | `#4f8cff` | no |
| Marrón | negros cálidos | `#c8834b` | no |
| Editorial (por defecto) | papel `#f5f3ee` y blanco | `#b3261e` | sí |
| Morado | negros violáceos | `#9b6dff` | no |

Cada tema oscuro tiñe sus grises con su carácter: fríos en Azul, cálidos en Marrón, violáceos en
Morado. Monaco (el editor del documento) construye su tema a partir de estos mismos tokens, y
React Flow cambia a su modo claro con Editorial.

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
| Movimiento | `--ease`, `--fast` (0,12 s), `--base` (0,2 s), `--slow` (0,32 s) | ver Movimiento |

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
- **Imagen y perfil en el lienzo:** bajo el nombre de cada dispositivo, su imagen
  (`frr:10.2.1`) y, si usa uno, su perfil (`perfil · nombre`), en los grises del tema y sin
  color propio: hay muchos dispositivos y no deben competir con los colores que sí significan algo.
  El perfil tiene fondo y un borde algo más fuerte; si no está construido o no existe en el
  servidor, su borde es discontinuo.

## Tipografía

| Token | Fuente | Uso |
|---|---|---|
| `--sans` | **Inter** (variable) | interfaz general, 13–14 px, con la «a» de un piso (`cv11`) |
| `--heading` | **Space Grotesk** (variable); **Source Serif 4** en Editorial | títulos, nombres de dispositivos (15 px, 600) y títulos de sección |
| `--mono` | **JetBrains Mono** (variable) | IPs, MACs, ids, interfaces, comandos, documento, consola y captura (11–13 px) |

- **Las fuentes vienen con la app** (paquetes `@fontsource-variable/*`, importados en
  `main.tsx`): no se pide nada a un servicio de fuentes, así que funciona igual en una red local
  sin Internet. El navegador descarga cada una solo cuando la página la usa.
- **Títulos de sección** (`h3`): `--heading`, 12 px, mayúsculas con algo de espaciado, en
  `--ink-3`. Separan las secciones de los paneles sin añadir peso.
- **Cifras:** donde se alinean (tablas, estadísticas, direcciones), con figuras tabulares.

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

## Movimiento

Una sola curva (`--ease`, que arranca rápido y frena suave) y tres duraciones para toda la app:

- **Entradas:** los diálogos suben y crecen un poco (`dialog-in`) sobre un fondo que aparece
  (`fade-in`); los menús bajan desde su botón (`menu-in`); el inspector entra desde la derecha
  (`slide-in`) y su contenido aparece de nuevo con cada selección.
- **Respuesta:** los botones cambian de color y se hunden un 4 % al pulsarlos; la línea de la
  pestaña activa crece desde el centro; los dispositivos suben 1 px al pasar el ratón.
- **Estado:** el punto de «en marcha» late despacio.
- **Menos movimiento:** con `prefers-reduced-motion` o la preferencia «Reducir las animaciones»
  del panel de usuario (`body[data-motion="reduced"]`), animaciones y transiciones se reducen
  al mínimo.

## Componentes

- **Botones:** `primary` (acento con un degradado suave y un halo de su color, una acción
  principal por bloque), `ghost` (secundario, borde fino), `danger` (destructivo, rojo) e
  `icon-button` (solo icono, 34 px, siempre con `title` y `aria-label`). `small` reduce
  cualquiera.
- **Superficies elevadas** (panel lateral, inspector, diálogos, menús, ventanas): una línea de
  luz en el borde superior (`inset 0 1px 0`) además de la sombra.
- **Panel de usuario** (`Dashboard.tsx`): navegación a la izquierda (el usuario y cinco
  secciones: Perfil, Preferencias, Laboratorios, Servidor, Atajos y ayuda) y la sección a la
  derecha. Las preferencias se eligen con tarjetas: el idioma por su código y el tema con una
  vista previa de sus colores. Por debajo de 720 px la navegación pasa arriba.
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
  (`--heading`, 15 px), su IP principal, la etiqueta de su imagen y, si usa uno, la de su perfil. Las asas de
  conexión aparecen al pasar el ratón o al seleccionar.
  - **Seleccionado:** borde de acento y halo.
  - **Dirección real** (Emulación, laboratorio desplegado): la que el equipo tiene ahora, pedida
    al emulador cada 4 s. Si no es la del documento (se cambió desde su CLI), va en el color de
    acento con la marca «en el equipo», y su `title` dice las dos. Los equipos con sistema propio
    (RouterOS, SR Linux) no la muestran: su contenedor no la tiene.
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
| Propiedades | Clic (inspector) o doble clic (ventana del dispositivo, con CLI y Captura) |
| Datos del laboratorio | ⓘ junto a su nombre (inspector) |
| Panel de usuario | Clic en el avatar |
| Ping | P, clic en el origen y luego en el destino. En Emulación es un ping real |
| Captura | C, clic en un cable (su interfaz) o en un dispositivo (todas). También desde las propiedades del cable |
| Eliminar | Supr o Retroceso. Una topología se elimina con sus dispositivos |
| Deshacer / rehacer | Ctrl+Z / Ctrl+Y (o Ctrl+Mayús+Z). Un arrastre es un solo paso |
| Encuadrar | F |
| Registro | L |
| Recorrer la simulación | ← → |
| Cerrar el inspector, salir de una herramienta o de la pantalla completa | Esc |

Los atajos no actúan mientras se escribe en un campo, en el documento o en una terminal.

## Modos

- **Simulación:** todo ocurre en el navegador. La pestaña del panel se llama Simulación; las
  acciones (ping, traza, DHCP, DNS, web) se reproducen paso a paso con velocidad elegible
  (tiempo real, 0,5×, 1×, 2×, 4×).
- **Emulación:** es el modo con el que se abre la app. La pestaña pasa a llamarse Emulación. Se despliega el laboratorio como
  contenedores. Las ventanas de dispositivo ofrecen su CLI real (con selector de shell: `vtysh`,
  `sr_cli`, `bash`, `zsh`, `sh`) y la captura de tráfico.
  - **El panel, por secciones con título:**
    - Entorno: estado del laboratorio, equipos en marcha, topologías y cables, versión del
      emulador y Docker, KVM y contenedores privilegiados, en una lista de dos columnas.
    - Contenedores, Comandos y Consola.
    Las secciones van separadas por una línea fina.
  - **Contenedores por topología:** se agrupan por topología, en grupos que se abren y cierran
    desde su cabecera (su punto de color, su nombre y cuántos están en marcha). Cada topología,
    cada equipo y el laboratorio entero (junto al título) tienen tres botones pequeños: iniciar
    (▶), detener (■) y reiniciar (⟳). El que está trabajando gira. Un equipo detenido se ve en
    gris.
  - **Aviso de cambios:** si la topología cambió desde el despliegue, una nota lo dice. Iniciar y
    reiniciar equipos o topologías se desactivan (detener no), y «Reiniciar todo» la aplica.
  - **Huella:** el cambio se detecta con una huella de la red (`networkFingerprint`) que no tiene
    en cuenta posiciones ni textos.

## Practicar

Una página propia en lugar del lienzo (`practice/PracticeHub.tsx`), al estilo de un laboratorio
de hacking: cada reto es una **máquina**.

- **Cada máquina** tiene un nombre para recordarla («Hola, Vecino», «El Infiltrado»), una
  historia corta y un **avatar** (`MachineAvatar.tsx`): un disco con el color de su tema
  (`BOX_COLOR`), el icono de su equipo protagonista y un anillo del color de su nivel (Básico
  `--ok`, Intermedio `--arp`, Avanzado `--danger`), discontinuo hasta superarla y lleno después.
- **Arriba, tres tarjetas:** el jugador (su rango, nivel, XP y la barra hacia el siguiente rango),
  la siguiente máquina del camino y el progreso en la dificultad elegida.
- **Dos pestañas** y el selector de dificultad (Fácil / Medio):
  - **Máquinas:** una tabla con avatar, nombre, nivel · tema, un medidor de dificultad de diez
    barras (más y más rojas cuanto más difícil), los modos, el tiempo, los XP y tu estado (mejor
    tiempo si está superada). Búsqueda y filtros por estado, dificultad y tema; una fila abre su
    página.
  - **Camino:** las cajas por tema en un raíl numerado, como antes.
- **La página de una máquina:** una cabecera con un degradado del color de su tema, el avatar
  grande, su nombre y sus datos (recompensa, tiempo, dificultad, tu mejor tiempo), y tres
  pestañas: **Jugar** (el modo, «Iniciar máquina» o por qué no se puede, y sus tareas, con
  candado hasta superarla), **Información** (la historia en una cita, qué harás, el tema y los
  equipos del laboratorio) y **Solución** (bloqueada hasta superarla, en cualquier modo).
- **XP y rangos:** 10, 20 o 40 XP según el nivel, el doble en Medio; Novato, Aprendiz, Técnico,
  Ingeniero y Arquitecto. No se muestran datos de otros usuarios: el progreso aún vive en el
  navegador (pasará a la cuenta en la fase B).
- **Dentro de una caja**, cada nivel se desbloquea al superar el anterior. Las cajas próximas
  (OSPF, BGP, NAT) van al final del camino, con el borde discontinuo y el motivo escrito.

Al empezar un reto se abre como laboratorio con la **tarjeta del reto** (`ChallengeCard.tsx`),
fija a la izquierda del todo del lienzo (340 px). Mientras está (`--reserved-left`,
`CHALLENGE_SPACE` en `store.ts`):

- en su sitio por defecto, la barra de herramientas empieza a su derecha y la barra inferior se
  centra en el resto; las dos se siguen moviendo libremente, también por encima de la tarjeta;
- el lienzo se encuadra dejándole sitio, y las ventanas de los equipos se abren a su derecha.

En Medio, el doble clic en un equipo abre su ventana directamente en la CLI, y la nota de solo
lectura de sus propiedades lleva «Abrir su CLI».

Cada intento tiene su tiempo (Fácil: 5, 8 o 12 minutos según el nivel; Medio: 10, 15 o 20).
Bajo el título, junto a la dificultad, una píldora monoespaciada con la cuenta atrás, que en su
último minuto pasa a `--danger` y late. Superado, muestra el tiempo empleado en `--ok`; agotado,
«Tiempo agotado» y un aviso en `--danger-soft` con «Reintentar» (el reto de cero, con un tiempo
nuevo). El mejor tiempo de cada reto aparece en el camino.

La tarjeta muestra:

- qué hacer y los objetivos, cada uno con su marca (pendiente, ✓ en `--ok`, ✕ en `--danger`) y
  lo que pasó;
- su dificultad en una etiqueta junto al título y, en Medio, una nota que dice cómo se resuelve
  (desde la CLI) y que reiniciar un equipo borra lo hecho en ella; si el laboratorio no está
  desplegado, «Iniciar el laboratorio» en lugar de «Comprobar»;
- «Comprobar» (que gira mientras comprueba en los equipos reales) y las pistas, de una en una:
  en Medio, con los comandos de la CLI;
- al superarlo, un aviso en `--ok-soft` con todas las pistas como solución de referencia (y una
  nota: otra forma que pase la comprobación también es correcta), «Siguiente» y «Volver a
  Practicar».

Los laboratorios de los retos son desechables: empezar un reto detiene los contenedores de los
retos que sigan encendidos, y «Volver a Practicar» tras superar uno detiene el suyo. «← Todos
los retos» lo deja encendido, para volver con «Seguir» sin perder lo hecho en la CLI.

El laboratorio de un reto vive en Practicar: no tiene pestaña Documento, y los botones Simulación
y Emulación abren el último laboratorio propio del usuario (o el primero, o uno vacío). «Seguir»
y el menú de laboratorios vuelven al reto en su modo: Fácil en Simulación, Medio en Emulación.

Se pliega a su título.

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
- **Formato (versión 4):** separa tres cosas. Lo que es cada equipo: su tipo y sus puertos como
  hardware (`interfaces: [{ name, mac }]`). Cómo se configura: `config`, con `interfaces` por nombre
  de puerto, `gateway`, `dns`, `routes` y `services`. Y cómo se dibuja: `canvas`, con
  `decorations`, `topologies` y `positions`. Para que se lea de un vistazo, cada posición, puerto,
  configuración de puerto, ruta y registro DNS va en una línea (`eth0: { ip: 10.0.0.1/24 }`).
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
- **Movimiento reducido:** con `prefers-reduced-motion` o la preferencia del panel de usuario,
  las animaciones y transiciones se reducen al mínimo.

## Cuentas

Antes de la app, una tarjeta centrada (420 px) sobre `--bg` con un halo de `--accent-soft`: la
marca, el idioma, el título en `--heading` y un formulario de una columna con el botón principal a
todo el ancho. Los errores, en una caja `--danger` suave bajo los campos (`role="alert"`). Cuatro
pantallas:
- **Inicia sesión**, con «Crea tu cuenta» si se tiene una invitación;
- **Crea tu cuenta:** código de invitación (en `--mono`; el enlace `?invite=` lo escribe), nombre,
  usuario y contraseña dos veces;
- **Crea la cuenta de administrador:** la primera vez, con el código de instalación del registro
  del servicio (`docker compose logs api`), para que nadie se adelante;
- **Elige tu contraseña:** tras una contraseña provisional de un administrador, antes de seguir.

En el panel de usuario, **Cuenta** (usuario, rol, cambiar la contraseña, cerrar sesión) y, para un
administrador, **Usuarios**: el formulario de invitación (rol, usos, días, una nota), las
invitaciones vivas con «Copiar enlace», «Copiar código» y anular, y las cuentas, cada una con su
rol en un desplegable, una contraseña provisional (🔑), activar o desactivar y eliminar (con
confirmación en la fila). El nombre del perfil es el de la cuenta. Si la sesión termina (una
respuesta 401), la app vuelve a «Inicia sesión» con el aviso.

## Qué guarda el navegador

`localStorage`, con el prefijo `visual-tracert.`:
- los laboratorios (cada uno como documento JSON);
- el perfil local (foto, «sobre ti», la preferencia de animaciones y una copia del nombre de la
  cuenta);
- el tema, el idioma y la velocidad;
- la disposición del panel lateral y del registro;
- la posición de las barras.

Lo del servidor (imágenes descargadas, perfiles) no se guarda en el navegador: se pide al
emulador.
