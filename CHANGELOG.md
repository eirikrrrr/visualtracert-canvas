# Cambios

Todas las versiones de visual-tracert. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y las versiones, [SemVer](https://semver.org/lang/es/): mientras sea 0.x, una función nueva sube el número
del medio y un arreglo, el último. Todo el repositorio (web, modelo y, más adelante, emulador) comparte versión.

## [Sin publicar]

### Añadido
- **Página de inicio.** La app abre en un inicio con tu perfil, nivel y rango, la season en curso con tu puesto, tu racha semanal, la XP de las últimas semanas, máquinas para ti y las que tienes en curso, tu Starting Point, novedades y accesos a Practicar, Simulación y Emulación. El logo lleva a ella; antes la app abría directamente en el lienzo de Emulación.
- Tracks con tarjetas más grandes, iconos de las máquinas más grandes y, al terminar un quiz, tu respuesta errónea junto a la correcta.
- **Todas las máquinas se juegan en Medio.** El emulador construye solo su imagen de laboratorio
  (Alpine con `bridge`, dnsmasq, httpd, tcpdump y dig) y emula los servicios: DHCP (dnsmasq, y
  `udhcpc` en los clientes), DNS, relay DHCP y web. La comprobación en los equipos reales cubre
  ahora también recibir dirección por DHCP, resolver un nombre, abrir una web y la VLAN de un
  puerto. Probado de punta a punta en las 12 máquinas: fallan al empezar y pasan con su solución
  por CLI.
- **Panel → Máquinas** (administradores): editar cualquier máquina (nombre, historia, nivel, XP,
  imagen, walkthrough en PDF, protocolos, ocultarla) o crear máquinas propias a partir de
  laboratorios (cómo empieza, cómo queda resuelta, sus objetivos, pistas y pasos de CLI). El
  servicio de cuentas las guarda (migración 3) y el ranking cuenta sus puntos.
- **Protocolos y walkthroughs.** Cada máquina muestra sus protocolos como etiquetas que abren la
  página del protocolo (lo esencial, las secciones de las guías con sus diagramas, las máquinas
  que lo usan y sus RFC); las Referencias los reúnen en una biblioteca. Pestaña Walkthrough en
  cada máquina; el walkthrough y la solución salen difuminados hasta que se piden. El botón de
  volver es ahora bien visible.
- **Starting Point con guías completas:** los niveles 0 a 2 son una guía larga cada uno (redes,
  OSI y TCP/IP, binario, IPv4 y máscaras, ARP, switching, VLAN, enrutamiento, TCP y UDP a fondo,
  ICMP, DHCP, DNS, NAT, cabeceras, subnetting, IPv6, CLI, diagnóstico), con 35 diagramas,
  documentos de referencia y un quiz final de 49 a 57 preguntas (se aprueba con el 75 %).
- Practicar con su propio menú lateral (el jugador, la season en curso con tu puesto, y cinco
  secciones). **Starting Point:** cuatro niveles (Fundamentos, Conceptos, Referencias y
  Máquinas), con diez lecciones cortas que se dan por hechas al acertar su pregunta, cuatro hojas
  de referencia (CLI de Linux y de RouterOS, subredes, puertos) y las primeras máquinas.
  **Tracks:** siete caminos guiados por las máquinas (uno solo de CLI, en Medio). **Seasons:**
  tarjetas verticales; cada una con en qué se basan sus máquinas, sus máquinas y su ranking, y un
  editor para administradores. La pestaña «Camino» la sustituyen los tracks.
- Ranking y cifras de las máquinas (fase D). Los retos superados se guardan en el servidor; el
  progreso de este navegador pasa a la cuenta al iniciar sesión. Un reto en Medio lo comprueba el
  servidor en los equipos reales (que sea el reto tal como empieza, y los pings) antes de contar,
  con el tiempo medido desde el despliegue. Pestaña Ranking con podio y tabla (global o por
  season), «Resuelta» en cada máquina con quién fue el primero, y en el panel, «Alumnos» para
  profesores y administradores. Las seasons (máquinas alrededor de un tema, entre dos fechas)
  existen en la API para los administradores.
- Cada laboratorio del emulador tiene dueño (fase C): solo quien lo desplegó, o un administrador,
  lo ve, lo toca y abre sus CLI y capturas. Límite por cuenta de laboratorios y equipos
  encendidos a la vez (3 y 24 por omisión, `MAX_LABS_PER_USER` y `MAX_CONTAINERS_PER_USER`; sin
  límite para administradores). En el panel → Servidor, los laboratorios encendidos con «Detener»:
  los tuyos con tu límite, o los de todos con su dueño si eres administrador.
- Cuentas de usuario (fase A). Un servicio nuevo, `apps/api`, sin privilegios y con SQLite
  (`node:sqlite`), guarda usuarios, sesiones e invitaciones. La primera cuenta es el administrador
  y se crea con el código de instalación del registro del servicio (`docker compose logs api`);
  las demás, con una invitación (código o enlace `?invite=`) que fija su rol: alumno, profesor o
  administrador. Contraseñas con scrypt, sesión en cookie `HttpOnly`/`SameSite=Strict` de 30 días
  y límite de intentos de inicio de sesión.
- Sin sesión no se llega al emulador: nginx pregunta al servicio de cuentas antes de cada
  petición a `/api`, también al abrir una CLI o una captura, y rechaza las que vienen de otra web.
  Cambiar las imágenes y perfiles del servidor es solo de administradores.
- Pantallas de inicio de sesión, registro, primer administrador y cambio de contraseña
  provisional. En el panel de usuario, «Cuenta» (cambiar la contraseña, cerrar sesión) y, para un
  administrador, «Usuarios»: invitaciones y cuentas (rol, activar o desactivar, contraseña
  provisional, eliminar).
- Practicar (el primer botón de modo): 12 retos en seis cajas por tema (Fundamentos IP, Switching
  y VLAN, Enrutamiento, DHCP, DNS y web, Diagnóstico) ordenadas como un camino numerado, más
  OSPF, BGP y NAT como próximas. Dentro de cada caja, los niveles se desbloquean en orden. Cada reto
  abre un laboratorio con algo por hacer o arreglar, y una tarjeta con sus objetivos, pistas y
  «Comprobar», que valida con la simulación (vale cualquier solución correcta). El progreso se
  guarda en el navegador y aparece en el panel de usuario.
- Dos dificultades en Practicar. **Fácil:** se resuelve desde la interfaz y se comprueba en la
  simulación. **Medio:** el reto se despliega en Emulación, la interfaz queda bloqueada
  (propiedades, ventanas, documento, añadir o quitar equipos y cables; solo se pueden mover) y se
  resuelve desde la CLI de cada equipo; «Comprobar» hace pings reales con las direcciones que los
  equipos tienen en ese momento. Cada dificultad lleva su progreso. Medio está en los retos que la
  emulación puede comprobar con los comandos de sus equipos (direccionamiento y enrutamiento); los
  demás dicen por qué no.
- Los laboratorios de los retos son desechables: al empezar un reto (Siguiente, Empezar o
  Repetir) se detienen los contenedores de los retos que sigan encendidos, y «Volver a Practicar»
  tras superar uno detiene el suyo. Así no quedan contenedores olvidados gastando memoria.
- Practicar al estilo de un laboratorio de hacking: cada reto es una «máquina» con un nombre
  divertido («Hola, Vecino», «El Infiltrado», «Triple Avería»…), una historia y un avatar (el
  color de su tema, el anillo del de su nivel). Una tabla de máquinas con búsqueda y filtros
  (estado, dificultad, tema), y la página de cada máquina: Jugar (modo, «Iniciar máquina» y sus
  tareas), Información (la historia, qué harás, los equipos del laboratorio) y Solución
  (bloqueada hasta superarla). Puntos de experiencia por reto (el doble en Medio) y rangos (Novato,
  Aprendiz, Técnico, Ingeniero, Arquitecto) con nivel y barra. El camino de cajas sigue como
  segunda pestaña.
- El menú de laboratorios: cada uno con su papelera, confirmada en la misma fila, sin tener que
  abrirlo; el reto en curso en su propia sección, y un buscador cuando hay muchos. Los
  laboratorios de los retos ya no se acumulan: al empezar uno se quitan los de los anteriores (y
  al abrir la app, los que se habían acumulado).
- Temporizador en los retos (Fácil: 5, 8 o 12 minutos según el nivel; Medio: 10, 15 o 20). Al
  superarlo se guarda el tiempo (el mejor aparece en el camino) y se cierran sus contenedores; si
  se acaba el tiempo, se cierran y «Reintentar» lo levanta de cero. El emulador cierra por sí mismo
  los laboratorios caducados (`PUT /api/labs/:lab?expires=`), aunque no haya ninguna página
  abierta.
- Al superar un reto se despliegan todas sus pistas como solución de referencia, con una nota:
  si se resolvió de otra forma y «Comprobar» pasó, también es correcta.
- La tarjeta del reto queda fija a la izquierda del todo del lienzo. Las barras de herramientas
  e inferior empiezan a su lado y se siguen moviendo libremente; las ventanas de los equipos se
  abren a su derecha, sin taparla.
- En modo Medio, el doble clic en un equipo abre su ventana directamente en la CLI, y sus
  propiedades bloqueadas ofrecen «Abrir su CLI».

### Cambiado
- Editorial es el tema por defecto.

### Arreglado
- El laboratorio de un reto ya no se queda abierto al pasar a Simulación o Emulación: esos modos
  abren tu último laboratorio propio, y «Seguir» (o el menú de laboratorios) vuelve al reto en su
  modo. Antes, un reto en Medio dejaba bloqueado el documento al cambiar de modo. Los retos no
  tienen pestaña Documento.
- En Emulación, el lienzo mostraba la dirección del documento aunque el equipo tuviera otra
  (cambiada desde su CLI). Ahora muestra la que el equipo tiene de verdad; si no coincide con el
  documento, la marca «en el equipo» y lo explica al pasar el ratón.
- «Comprobar» en modo Medio daba por bueno un ping cuando dos equipos tenían la misma dirección
  (el origen se respondía a sí mismo). Ahora lo detecta y avisa del conflicto de IP.
- El detalle del evento de la simulación (sus cabeceras) flotaba sobre el panel lateral sin poder
  cerrarse: compartía nombre de clase con el inspector nuevo. Vuelve a su sitio, dentro del panel.

## [0.4.0] - 2026-10-31

### Añadido
- Panel de usuario (el avatar de la barra superior): perfil (foto, nombre, «sobre ti» y lo que has
  construido), preferencias (idioma, tema con su vista previa, velocidad de simulación, reducir
  animaciones), tus laboratorios (abrir, eliminar, crear), el servidor (emulador, KVM, imágenes y
  perfiles) y los atajos de teclado con la ayuda. Todo se guarda en este navegador.
- Inspector: las propiedades de lo seleccionado (dispositivo, cable o topología) en una tarjeta
  sobre el lienzo, que se cierra con Esc. El botón ⓘ junto al nombre del laboratorio muestra sus
  notas y topologías, que se abren solas con una plantilla.
- Iniciar, detener y reiniciar cada equipo, cada topología o todo el laboratorio, sin tocar el
  resto, desde el panel de Emulación: los contenedores y cables se hacen de nuevo y los equipos
  vecinos recuperan la configuración de esos puertos (dirección, puente, rutas; el puerto de un
  RouterOS vuelve a su tarjeta virtual). Un equipo se puede iniciar aunque su topología no lo
  inicie. Los contenedores se agrupan por topología, en grupos desplegables. Si la topología cambió
  desde el despliegue, «Reiniciar todo» la aplica.
- En el lienzo, cada dispositivo muestra bajo su nombre la imagen con la que corre
  (`alpine:3.20`, `frr:10.2.1`, `routeros:7.23.8`) y, debajo, su perfil (`perfil · nombre`) si usa
  uno; las dos etiquetas, en los grises del tema.
- La CLI de cada sistema sugiere sus propios comandos (RouterOS, FRR, SR Linux) en lugar de los de
  Linux.
- Aviso de equipos que corren una versión anterior de su imagen (una máquina virtual tras
  actualizar el emulador): en el panel de Emulación y en la ventana del dispositivo, con «vuelve a
  desplegar».
- Punto de partida «Alpine con LLDP (lldpd)» en los perfiles: el equipo se anuncia por LLDP y
  aparece en los vecinos de un router (`/ip neighbor` en RouterOS).
- La consola serie de RouterOS muestra sus credenciales (admin / admin), y su CLI por SSH explica
  qué hacer si no puede entrar, en lugar de cerrarse sin decir nada.

### Cambiado
- Sin pestaña Propiedades: el panel lateral queda con Emulación (o Simulación) y Documento.
- Tipografía nueva, incluida con la app (funciona sin Internet): Inter para la interfaz, Space
  Grotesk para los títulos y JetBrains Mono para direcciones, comandos y terminales; Source
  Serif 4 en los títulos del tema Editorial.
- Colores: el tema Azul pasa a un negro medianoche con grises fríos y un azul más luminoso; los
  botones principales tienen un degradado suave y las superficies un borde de luz.
- Animaciones: diálogos, menús, el inspector y las pestañas entran con suavidad, los botones
  responden al pulsarlos y los equipos en marcha laten. Se desactivan si el sistema pide menos
  movimiento o desde las preferencias.
- El minimapa pasa abajo a la derecha, para no chocar con el inspector.
- La app se abre siempre en modo Emulación, y el selector lo muestra antes que Simulación.
- El panel de Emulación va por secciones con título (Entorno, Contenedores, Comandos, Consola).
  «Desplegar» y «Detener» dejan su sitio a la información del entorno: estado del laboratorio,
  equipos en marcha, topologías y cables, versión del emulador y Docker, KVM y contenedores
  privilegiados. Desplegar es «Iniciar todo».
- Documento versión 4: cada dispositivo separa sus puertos, como hardware
  (`interfaces: [{ name, mac }]`), de su configuración, en `config`: `interfaces` por nombre de
  puerto (ip, dhcp, vlan, relay), `gateway`, `dns`, `routes` y `services`. Los puertos, sus
  configuraciones, las rutas y los registros DNS se escriben uno por línea. Los documentos de las
  versiones 1 a 3 se siguen leyendo.
- Los contenedores de los laboratorios son temporales (`--rm`): al detenerse desaparecen con lo que
  tuvieran escrito, y al borrar un laboratorio se borran también sus volúmenes. La configuración
  vive en el documento y se aplica en cada despliegue.
- En la tarjeta de RouterOS, la base es RouterOS y el contenedor Alpine con QEMU aparece aparte,
  como lo que es: el envoltorio de la máquina virtual. La shell del contenedor se llama así.

### Rendimiento
- La web carga bajo demanda la terminal, la captura, el Marketplace, el panel de usuario, la
  galería y el diccionario del idioma (el español no necesita ninguno): la carga inicial en
  español baja de 1.193 KB a 706 KB de JavaScript.
- El emulador crea todos los cables con un solo proceso (`ip -batch`) y lanza los comandos de
  arranque sin volver a listar los contenedores.

### Seguridad
- `dompurify` (que trae Monaco) se fuerza a 3.4.17, que corrige varios XSS críticos; `npm audit`
  queda sin vulnerabilidades.

### Arreglado
- Las ventanas aparte del navegador reciben también los estilos que llegan después de abrirse.
- La CLI de un dispositivo tenía una fila (y una o dos columnas) de más: el ajuste del terminal
  contaba como espacio el relleno de su recuadro. En RouterOS, que coloca su prompt en la última
  fila, la línea en la que se escribe quedaba oculta bajo el borde.
- La barra espaciadora no escribía en el editor del documento: React Flow la tomaba para arrastrar
  el lienzo, porque Monaco escribe con EditContext sobre un `div` que no reconocía como campo.
- MikroTik con muchos puertos: su CLI no abría. Con 256 MB, RouterOS con ocho tarjetas se quedaba
  sin memoria, su consola dejaba de responder a mitad de la configuración y el SSH de gestión
  quedaba sin configurar. Ahora la máquina tiene 512 MB y dos procesadores, la CLI entra con
  contraseña y el lanzador comprueba que el SSH responde antes de darla por lista.

## [0.3.0] - 2026-10-31

### Añadido
- Emulación (primera etapa): el modo «Emulación» despliega el laboratorio como contenedores reales
  (Alpine) unidos por cables veth. Los routers enrutan con sus rutas estáticas y los switches separan
  VLAN de verdad. Desde el panel se ejecutan comandos reales en cada equipo: ping, traza, direcciones,
  rutas y vecinos ARP; la herramienta de ping del lienzo también hace un ping real.
- Servicio `apps/emulator` (API en `/api`) y aviso de lo que aún no se emula: DHCP, DNS, web y relay.
- Dispositivos agrupados por etiquetas en «Añadir dispositivo» y en el tipo: «Imágenes oficiales»
  (de momento, Alpine Linux, con su logo oficial) y «Genéricos» (los iconos de siempre, que en
  Emulación corren sobre Alpine).
- Ventana flotante de cada dispositivo (doble clic): sus propiedades y su CLI nativa, una terminal
  real (xterm.js) en la shell de su contenedor, por WebSocket. Se mueve, cambia de tamaño y se abren
  varias a la vez.
- Información de la imagen en las propiedades: versión, base, shell, herramientas, arquitecturas,
  licencia, enlaces oficiales (Docker Hub, Dockerfile, web, notas de versión, paquetes) y lo que Docker
  tiene de ella en el servidor (ID, digest, arquitectura, tamaño).

- Topologías: un laboratorio agrupa sus dispositivos en topologías, cada una dibujada como un
  rectángulo de color alrededor de ellos, con nombre, color, texto y estado. Se crean con «Nueva
  topología», se arrastran por su título con sus dispositivos y un dispositivo soltado dentro de otra
  pasa a ella. `options.decorations: false` deja de dibujarlas.
- Estado de cada topología para la emulación: `up` (todos sus dispositivos), `down` (ninguno) o
  `hybrid` (solo los que tengan `status: up`); también se aceptan on/off y true/false. Lo que no
  se inicia se ve atenuado en Emulación.

- Marketplace (botón en la barra del lienzo): FRRouting (router real con vtysh), netshoot, NGINX,
  Ubuntu, Debian y BusyBox, todas para arm64 y amd64. Se descargan en el servidor y sus dispositivos
  aparecen en «Añadir dispositivo»; se pueden quitar.
- Perfiles de imagen: una imagen con tus paquetes (apk o apt), comandos al construir y comandos al
  arrancar el laboratorio. Se construyen como imagen local; un dispositivo elige el suyo
  (`profile:`). Incluye puntos de partida: Ubuntu/Debian con red, FRR con OSPF y BGP, Alpine con
  tcpdump.
- La CLI elige entre las shells de la imagen (vtysh, bash, zsh, sh).
- Los cables muestran la interfaz de cada extremo (se ocultan al alejar mucho el zoom), siempre fuera
  del dispositivo, sin tapar su nombre ni su dirección.
- La ventana de un dispositivo se puede abrir en una ventana del navegador aparte de la pestaña, para
  ver varios dispositivos a la vez.
- Captura de tráfico real (herramienta C, pestaña «Captura» de la ventana de un dispositivo o desde
  las propiedades de un cable): tcpdump en el espacio de red del dispositivo, los paquetes
  decodificados en la página (Ethernet, VLAN, ARP, IPv4/IPv6, ICMP, UDP, TCP, DNS, DHCP, HTTP) con
  sus capas y bytes, y descarga en .pcap para Wireshark.
- Nokia SR Linux en el Marketplace: sus direcciones y rutas se aplican con sr_cli. Necesita un
  contenedor privilegiado, que el emulador solo permite con `ALLOW_PRIVILEGED=1`.
- MikroTik RouterOS 7.23.8 (long-term) en el Marketplace, como en vrnetlab: el CHR oficial en una
  máquina virtual QEMU (con KVM) dentro de su contenedor, que se construye en el servidor para ARM64
  o x86_64. Sus direcciones, rutas, nombre y nombres de puerto se aplican al arrancar; la CLI de
  RouterOS (por SSH, en una gestión aislada en su VRF), su consola serie, los comandos del panel y
  la captura funcionan como en los demás dispositivos.
- Sistemas de fabricantes en el Marketplace (Cisco, Juniper, Arista, Huawei, Dell): por qué no se
  pueden descargar aquí y la vía oficial para conseguir cada uno.
- Los dispositivos con un perfil de imagen lo muestran en una etiqueta bajo su nombre.
- DESIGN.md: el diseño de la web.
- Editor del documento: plegar y desplegar secciones del YAML/JSON desde el margen, buscar
  (Ctrl+F), ver el mensaje de un error al pasar por encima y resaltado de corchetes.

### Cambiado
- Documento versión 3: la configuración (`topology:`, cada elemento una topología con sus
  `devices`, y `links`) va aparte de cómo se dibuja (`canvas:` con `decorations`, el color y el texto
  de cada topología en `topologies` y `positions` de los dispositivos). Los documentos de las
  versiones 1 y 2 se siguen leyendo.
- En las propiedades de un dispositivo, la imagen va primero; en «Añadir dispositivo», cada grupo
  está cerrado hasta que se abre (al buscar se abren los que tienen resultados).
- Los contenedores de los laboratorios tienen `NET_ADMIN` (solo en su propio espacio de red), para
  poder cambiar direcciones y rutas desde su CLI.

## [0.2.0] - 2026-10-30

### Añadido
- Más protocolos en la simulación: traza (tracert), DHCP con relay en los routers, consultas DNS y
  páginas web por TCP (saludo de tres vías, GET, respuesta y cierre). El ping acepta nombres.
- ICMP de puerto inalcanzable y RST de TCP cuando falta un servicio; salida de consola de cada acción.
- Servicios en los dispositivos: rangos DHCP, registros DNS y servidor web; servidor DNS en los equipos,
  DHCP y relay en las interfaces.
- Galería de 12 plantillas de laboratorio, cada una con lo que conviene probar.
- Interfaz, mensajes del simulador y plantillas en español, inglés y portugués de Brasil.
- «Tiempo real» como primera velocidad de reproducción; selector Simulación / Emulación (la emulación,
  próximamente).
- La versión de la app, junto a su nombre en la barra superior.

### Cambiado
- El repositorio es un monorepo con workspaces: `apps/web` y `packages/model`.
- La app se llama visual-tracert en todas partes; lo guardado en el navegador pasa a las claves nuevas.

### Corregido
- La lista de «Añadir dispositivo» ya no se sale de la pantalla cuando la barra está abajo del todo.

## [0.1.0] - 2026-10-30

### Añadido
- Primera versión: editor visual de topologías, documento YAML/JSON sincronizado en los dos sentidos,
  panel de propiedades y simulación de ping (ARP, ICMP, switches con VLAN y rutas estáticas) paso a paso.

[Sin publicar]: https://github.com/eirikrrrr/visual-tracert/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/eirikrrrr/visual-tracert/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/eirikrrrr/visual-tracert/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/eirikrrrr/visual-tracert/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/eirikrrrr/visual-tracert/releases/tag/v0.1.0
