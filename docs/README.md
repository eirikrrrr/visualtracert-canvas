# Documentación de visual-tracert

Documentación técnica del proyecto. La idea del producto está en el [README](../README.md) y el
diseño de la interfaz, en [DESIGN.md](../DESIGN.md).

| Documento | Qué cuenta |
|---|---|
| [Arquitectura](arquitectura.md) | Las piezas (web, emulador, modelo compartido), cómo se hablan y dónde vive cada dato |
| [El emulador por dentro](emulador.md) | El backend en detalle: módulos, despliegue, cables veth, reinicios, CLI, captura, máquinas virtuales (vrnetlab) y seguridad |
| [El documento](documento.md) | El formato YAML/JSON de un laboratorio (versión 4), campo a campo |
| [API del emulador](api.md) | Los endpoints HTTP y WebSocket, con ejemplos |
| [Desarrollo](desarrollo.md) | Cómo arrancarlo, probarlo, traducirlo y publicar una versión |

Los diagramas están en [Mermaid](https://mermaid.js.org), que GitHub dibuja directamente.
