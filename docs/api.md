# API

Dos servicios detrás del nginx de la web:

- **El emulador**, en `/api` (para desarrollo, también en `127.0.0.1:9151`, sin comprobar la
  sesión).
- **Las cuentas**, en `/auth` (para desarrollo, en `127.0.0.1:9152`): al final de esta página.

Cada petición a `/api`, también los WebSocket, necesita una sesión: nginx pregunta antes a
`/auth/check`. Sin sesión responde `401 {"error":"unauthorized"}`. Responde
`403 {"error":"forbidden"}` si la petición viene de otro sitio (su `Origin`), si la cuenta tiene una
contraseña provisional, o si un usuario que no es administrador intenta cambiar imágenes o perfiles
(`POST`, `PUT` o `DELETE` en `/api/images` y `/api/profiles`).

## El emulador

- Las peticiones y respuestas son JSON.
- Los errores llevan `{ "error": "mensaje" }` en el idioma de `Accept-Language` (`es`, `en`,
  `pt`).
- Los documentos de laboratorio van como su JSON de la versión 4 ([El documento](documento.md)).
- `:lab` es un identificador `[A-Za-z0-9_-]{1,64}`.

### Salud

#### `GET /api/health`

```json
{ "ok": true, "version": "0.4.0", "docker": true, "kvm": true, "privileged": false }
```

`kvm`: hay `/dev/kvm` (las máquinas virtuales van a velocidad casi nativa). `privileged`: el
servidor permite contenedores privilegiados (`ALLOW_PRIVILEGED=1`).

### Laboratorios

#### `GET /api/labs`

Los laboratorios que tienen contenedores en el servidor:

```json
[{ "lab": "lab-mvwo7czd-jhk2", "containers": 3, "running": 3 }]
```

#### `GET /api/labs/:lab`

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

#### `GET /api/labs/:lab/addresses`

Las direcciones IPv4 que los equipos en marcha tienen ahora (lo que su CLI haya cambiado), por
equipo y puerto. No incluye los equipos con sistema propio (RouterOS, SR Linux):

```json
{ "pc-1": [{ "ifname": "eth0", "address": "192.168.1.20/24" }], "switch": [] }
```

#### `PUT /api/labs/:lab`

Despliega el laboratorio desde su documento, después de borrar lo que corría. Con
`?expires=<ms desde 1970>` (el plazo de un reto), sus contenedores llevan esa caducidad y el
emulador los detiene por sí mismo al pasarla: revisa cada 30 s, aunque no haya ninguna página
abierta. Reiniciar o iniciar equipos conserva la caducidad. Responde el estado
y los avisos de lo que no se emula:

```json
{ "lab": "…", "deployed": true, "fingerprint": "…", "devices": [ … ], "warnings": ["R1: la ruta hacia …"] }
```

#### `DELETE /api/labs/:lab`

Lo detiene: borra todos sus contenedores.

#### `POST /api/labs/:lab/start` · `/restart`

```json
{ "devices": ["pc-1", "sw"], "document": { "version": 4, … } }
```

Inicia (solo los parados) o reinicia esos equipos sin tocar el resto: sus contenedores y cables
se hacen de nuevo, y en los vecinos se reconfiguran esos puertos. Un equipo se inicia aunque su
topología no lo inicie. Si lo que corre se desplegó con otra topología, responde un error: hay
que desplegar de nuevo.

#### `POST /api/labs/:lab/stop`

```json
{ "devices": ["pc-1"] }
```

Detiene esos equipos.

#### `POST /api/labs/:lab/run`

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

### CLI y captura (WebSocket)

#### `WS /api/labs/:lab/devices/:device/shell?cols=&rows=&shell=`

La CLI de un equipo. `shell` es uno de los de su imagen (`vtysh`, `sr_cli`, `routeros`,
`console`, `bash`, `zsh`, `sh`); sin él, el primero.

- **Tramas binarias:** los bytes del terminal, en los dos sentidos.
- **Tramas de texto de la página:** `{"type":"resize","cols":120,"rows":32}`.
- **Tramas de texto hacia la página:** `{"type":"error","message":"…"}`.

Al cerrarse el WebSocket, la shell termina.

#### `WS /api/labs/:lab/devices/:device/capture?iface=&filter=`

Una captura en un puerto (`iface` por su nombre en la topología, `Gi0/0`; `any`: todos).
`filter` usa la sintaxis de tcpdump.

- **Tramas binarias:** pcap, con su cabecera primero.
- **Tramas de texto:** `{"type":"status"|"error","message":"…"}`.

Se corta sola a los 64 MB.

### Imágenes

#### `GET /api/images` · `GET /api/images/:image`

Cada imagen del catálogo con lo que Docker tiene de ella:

```json
{
  "id": "routeros", "name": "MikroTik RouterOS", "ref": "visual-tracert/vr-routeros:7.23.8",
  "pulled": true, "allowed": true, "architecture": "arm64", "size": 561217814, "…": "…"
}
```

#### `POST /api/images/:image/pull`

La descarga, o la construye si es una máquina virtual (RouterOS: un par de minutos).

#### `DELETE /api/images/:image`

La quita del servidor. 409 si un laboratorio la está usando; Alpine viene con la app y no se
puede quitar.

### Perfiles de imagen

#### `GET /api/profiles`

```json
[{ "profile": { "id": "alpine-lldp", "name": "Alpine LLDP", "base": "alpine", "packages": ["lldpd"], "setup": [], "startup": ["lldpd"] }, "state": "built" }]
```

`state`: `built`, `outdated` (cambió desde que se construyó) o `missing`.

#### `PUT /api/profiles/:id`

Guarda un perfil (`id`: minúsculas, números y guiones, hasta 40). Se valida como dice el modelo.

#### `POST /api/profiles/:id/build`

Lo construye: `{ "ok": true, "log": "…", "state": "built" }`.

#### `DELETE /api/profiles/:id`

Lo borra, con su imagen.

## Las cuentas

Todo va como JSON. Los errores son `{ "error": "código" }`: la web los traduce. La sesión es la
cookie `vt_session` (`HttpOnly`, `SameSite=Strict`, y `Secure` si la petición llegó por HTTPS,
según `X-Forwarded-Proto`, o siempre con `COOKIE_SECURE=1`); dura 30 días desde su último uso. Lo
que cambia algo debe venir como `application/json` y desde el mismo sitio (`Origin`).

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET /auth/status` | cualquiera | `{ "setup": false, "user": { … } \| null }`: si falta crear el administrador, y quién ha iniciado sesión |
| `POST /auth/setup` | cualquiera, una vez | `{ code, username, name, password }`: la primera cuenta (administrador), con el código de instalación del registro del servicio; inicia sesión |
| `POST /auth/register` | cualquiera | `{ invite, username, name, password }`: una cuenta con una invitación, con el rol de la invitación; inicia sesión |
| `POST /auth/login` | cualquiera | `{ username, password }`. Tras 8 fallos con un usuario, o 20 desde una dirección, `429` durante 15 minutos |
| `POST /auth/logout` | con sesión | Cierra esta sesión |
| `PATCH /auth/me` | con sesión | `{ name }` |
| `POST /auth/me/password` | con sesión | `{ current, next }`. Cierra las demás sesiones |
| `GET /auth/users` | admin | Todas las cuentas (nunca sus contraseñas) |
| `PATCH /auth/users/:id` | admin | `{ role?, disabled?, name? }`. Desactivar cierra sus sesiones. Siempre queda un administrador activo (`409 last-admin`) |
| `POST /auth/users/:id/password` | admin | `{ password }`: provisional; hasta cambiarla, la cuenta no llega al emulador |
| `DELETE /auth/users/:id` | admin | Borra la cuenta y sus sesiones |
| `GET /auth/invites` | admin | Las invitaciones que aún sirven |
| `POST /auth/invites` | admin | `{ role?, uses?, days?, note? }` (alumno, 1 uso y 7 días por omisión; `days: 0`, sin caducidad) |
| `DELETE /auth/invites/:code` | admin | La anula |
| `GET /auth/check` | nginx | `204` con `X-User-Id`, `X-User-Name` y `X-User-Role`; `401` o `403` |

Un usuario:

```json
{ "id": 2, "username": "ana", "name": "Ana Pérez", "role": "student", "disabled": false,
  "mustChange": false, "createdAt": 1793477012602, "lastLogin": 1793477100000 }
```

Roles: `student` (alumno), `teacher` (profesor) y `admin`. Usuario: de 3 a 32 letras, números,
`.`, `-` o `_`, sin distinguir mayúsculas. Contraseña: al menos 10 caracteres, guardada con scrypt
(N = 2¹⁵, r = 8, p = 3). Una invitación es un código como `K7QF-9XRM-2PDA`, sin caracteres que se
confundan; el enlace `/?invite=K7QF-9XRM-2PDA` abre el registro con el código escrito.

Códigos de error: `bad-request`, `bad-username`, `bad-name`, `bad-password`, `username-taken`,
`already-set-up`, `invalid-setup-code`, `invalid-invite`, `invalid-credentials`, `disabled`,
`too-many-attempts`, `wrong-password`, `not-found`, `last-admin`, `unauthorized`, `forbidden`.
