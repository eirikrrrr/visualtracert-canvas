# Cambios

Todas las versiones de visual-tracert. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y las versiones, [SemVer](https://semver.org/lang/es/): mientras sea 0.x, una función nueva sube el número
del medio y un arreglo, el último. Todo el repositorio (web, modelo y, más adelante, emulador) comparte versión.

## [Sin publicar]

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
