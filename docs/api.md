# API del emulador

La web la usa en `/api` (nginx la reenvía al emulador). Para desarrollo, el emulador escucha en
`127.0.0.1:9151`.

- Las peticiones y respuestas son JSON.
- Los errores llevan `{ "error": "mensaje" }` en el idioma de `Accept-Language` (`es`, `en`,
  `pt`).
- Los documentos de laboratorio van como su JSON de la versión 4 ([El documento](documento.md)).
- `:lab` es un identificador `[A-Za-z0-9_-]{1,64}`.

## Salud

### `GET /api/health`

```json
{ "ok": true, "version": "0.4.0", "docker": true, "kvm": true, "privileged": false }
```

`kvm`: hay `/dev/kvm` (las máquinas virtuales van a velocidad casi nativa). `privileged`: el
servidor permite contenedores privilegiados (`ALLOW_PRIVILEGED=1`).

## Laboratorios

### `GET /api/labs/:lab`

Lo que corre del laboratorio, leído de las etiquetas de sus contenedores:

```json
{
  "lab": "lab-mvv29adf-oic4",
  "deployed": true,
  "fingerprint": "57d42ef6",
  "devices": [
    { "device": "pc-1", "container": "vt-lab-mvv29adf-oic4-pc-1", "state": "running", "outdated": false }
  ]
}
```

`outdated`: corre una versión anterior de su imagen (una máquina virtual tras actualizar el
emulador); reiniciarlo la actualiza.

### `PUT /api/labs/:lab`

Despliega el laboratorio desde su documento, después de borrar lo que corría. Responde el estado
y los avisos de lo que no se emula:

```json
{ "lab": "…", "deployed": true, "fingerprint": "…", "devices": [ … ], "warnings": ["R1: la ruta hacia …"] }
```

### `DELETE /api/labs/:lab`

Lo detiene: borra todos sus contenedores.

### `POST /api/labs/:lab/start` · `/restart`

```json
{ "devices": ["pc-1", "sw"], "document": { "version": 4, … } }
```

Inicia (solo los parados) o reinicia esos equipos sin tocar el resto: sus contenedores y cables
se hacen de nuevo, y en los vecinos se reconfiguran esos puertos. Un equipo se inicia aunque su
topología no lo inicie. Si lo que corre se desplegó con otra topología, responde un error: hay
que desplegar de nuevo.

### `POST /api/labs/:lab/stop`

```json
{ "devices": ["pc-1"] }
```

Detiene esos equipos.

### `POST /api/labs/:lab/run`

Un comando de una lista cerrada en un equipo:

```json
{ "device": "pc-1", "command": "ping", "target": "10.0.0.2" }
```

| `command` | Linux | RouterOS |
|---|---|---|
| `ping` | `ping -c 4 -W 2 destino` | `/ping destino count=4` |
| `traceroute` | `traceroute -n -w 1 -q 1 -m 15 destino` | `/tool traceroute destino count=1 max-hops=15` |
| `addresses` | `ip addr` | `/ip address print` |
| `routes` | `ip route` | `/ip route print` |
| `neighbours` | `ip neigh` | `/ip arp print` |

```json
{ "command": "ping -c 4 -W 2 10.0.0.2", "output": "PING 10.0.0.2 …", "exitCode": 0 }
```

El destino debe ser una IP o un nombre válido.

## CLI y captura (WebSocket)

### `WS /api/labs/:lab/devices/:device/shell?cols=&rows=&shell=`

La CLI de un equipo. `shell` es uno de los de su imagen (`vtysh`, `sr_cli`, `routeros`,
`console`, `bash`, `zsh`, `sh`); sin él, el primero.

- **Tramas binarias:** los bytes del terminal, en los dos sentidos.
- **Tramas de texto de la página:** `{"type":"resize","cols":120,"rows":32}`.
- **Tramas de texto hacia la página:** `{"type":"error","message":"…"}`.

Al cerrarse el WebSocket, la shell termina.

### `WS /api/labs/:lab/devices/:device/capture?iface=&filter=`

Una captura en un puerto (`iface` por su nombre en la topología, `Gi0/0`; `any`: todos).
`filter` usa la sintaxis de tcpdump.

- **Tramas binarias:** pcap, con su cabecera primero.
- **Tramas de texto:** `{"type":"status"|"error","message":"…"}`.

Se corta sola a los 64 MB.

## Imágenes

### `GET /api/images` · `GET /api/images/:image`

Cada imagen del catálogo con lo que Docker tiene de ella:

```json
{
  "id": "routeros", "name": "MikroTik RouterOS", "ref": "visual-tracert/vr-routeros:7.23.8",
  "pulled": true, "allowed": true, "architecture": "arm64", "size": 561217814, "…": "…"
}
```

### `POST /api/images/:image/pull`

La descarga, o la construye si es una máquina virtual (RouterOS: un par de minutos).

### `DELETE /api/images/:image`

La quita del servidor. 409 si un laboratorio la está usando; Alpine viene con la app y no se
puede quitar.

## Perfiles de imagen

### `GET /api/profiles`

```json
[{ "profile": { "id": "alpine-lldp", "name": "Alpine LLDP", "base": "alpine", "packages": ["lldpd"], "setup": [], "startup": ["lldpd"] }, "state": "built" }]
```

`state`: `built`, `outdated` (cambió desde que se construyó) o `missing`.

### `PUT /api/profiles/:id`

Guarda un perfil (`id`: minúsculas, números y guiones, hasta 40). Se valida como dice el modelo.

### `POST /api/profiles/:id/build`

Lo construye: `{ "ok": true, "log": "…", "state": "built" }`.

### `DELETE /api/profiles/:id`

Lo borra, con su imagen.
