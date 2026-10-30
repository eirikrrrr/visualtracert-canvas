# Cambios

Todas las versiones de visual-tracert. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y las versiones, [SemVer](https://semver.org/lang/es/): mientras sea 0.x, una función nueva sube el número
del medio y un arreglo, el último. Todo el repositorio (web, modelo y, más adelante, emulador) comparte versión.

## [Sin publicar]

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
- Estado de cada topología para la emulación: `start` (todos sus dispositivos), `stop` (ninguno) o
  `hybrid` (solo los que tengan `status: start`). Lo que no se inicia se ve atenuado en Emulación.

- Editor del documento: plegar y desplegar secciones del YAML/JSON desde el margen, buscar
  (Ctrl+F), ver el mensaje de un error al pasar por encima y resaltado de corchetes.

### Cambiado
- Documento versión 2: los dispositivos van dentro de `topology:` (cada elemento, una topología con
  sus `devices`) y hay `options`. Los documentos de la versión 1 (`devices:` en la raíz) se siguen
  leyendo, como una sola topología.
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

[Sin publicar]: https://github.com/eirikrrrr/visual-tracert/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/eirikrrrr/visual-tracert/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/eirikrrrr/visual-tracert/releases/tag/v0.1.0
