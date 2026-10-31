# Cambios

Todas las versiones de visual-tracert. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y las versiones, [SemVer](https://semver.org/lang/es/): mientras sea 0.x, una función nueva sube el número
del medio y un arreglo, el último. Todo el repositorio (web, modelo y, más adelante, emulador) comparte versión.

## [Sin publicar]

### Añadido
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

### Arreglado
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

[Sin publicar]: https://github.com/eirikrrrr/visual-tracert/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/eirikrrrr/visual-tracert/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/eirikrrrr/visual-tracert/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/eirikrrrr/visual-tracert/releases/tag/v0.1.0
