# El documento de un laboratorio

Un laboratorio se escribe como un documento YAML o JSON (los dos son equivalentes). Es el que se
ve y se edita en la pestaña Documento, el que se guarda en el navegador y el que la web envía al
emulador. Lo leen y lo escriben `parse()` y `serialize()` de `packages/model/src/document.ts`.

La versión actual es la **4**. Separa tres cosas:

| Parte | Dónde | Qué es |
|---|---|---|
| Lo que es cada equipo | `topology[].devices[]`: `type`, `interfaces` | Su tipo y sus puertos, como hardware |
| Cómo se configura | `devices[].config` | Direcciones, rutas, puerta de enlace, servicios |
| Cómo se dibuja | `canvas` | Colores y textos de las topologías, posiciones |

## Ejemplo

```yaml
version: 4
name: Dos redes y un router
description: |
  Una LAN y un router hacia otra red.

  Qué probar:
  - Ping de PC 1 a 10.0.0.2.
topology:
  - id: oficina
    name: Oficina
    status: up
    devices:
      - id: r1
        type: frr
        name: R1
        interfaces:
          - { name: eth0, mac: 02:00:00:00:00:01 }
          - { name: eth1, mac: 02:00:00:00:00:02 }
        config:
          interfaces:
            eth0: { ip: 192.168.1.1/24 }
            eth1: { ip: 10.0.0.1/30 }
          routes:
            - { prefix: 0.0.0.0/0, via: 10.0.0.2 }
      - id: pc-1
        type: pc
        name: PC 1
        profile: alpine-lldp
        interfaces:
          - { name: eth0, mac: 02:00:00:00:00:03 }
        config:
          interfaces:
            eth0: { ip: 192.168.1.10/24 }
          gateway: 192.168.1.1
links:
  - { id: l1, a: "r1:eth0", b: "pc-1:eth0" }
canvas:
  decorations: true
  topologies:
    oficina: { color: "#3d7eff", text: La LAN de la oficina }
  positions:
    r1: { x: 300, y: 200 }
    pc-1: { x: 80, y: 200 }
```

## Raíz

| Campo | Tipo | Obligatorio | Qué es |
|---|---|---|---|
| `version` | número | no | 4. Las versiones 1 a 3 se siguen leyendo |
| `name` | texto | no | Nombre del laboratorio («Laboratorio sin título» si falta) |
| `description` | texto | no | Notas: párrafos separados por una línea en blanco; las líneas `- ` se ven como lista («qué probar») |
| `topology` | lista | sí | Las topologías, cada una con sus dispositivos |
| `links` | lista | no | Los cables |
| `canvas` | objeto | no | Cómo se dibuja |

## Topologías

Cada elemento de `topology` es un grupo de dispositivos, dibujado como un rectángulo de color.

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | texto | Identificador único (`topology-1` si falta) |
| `name` | texto | Nombre visible |
| `status` | `up` · `down` · `hybrid` | Qué se inicia en la emulación: todos, ninguno, o solo los dispositivos con `status: up`. También se aceptan `on`/`off`, `true`/`false` y, de versiones antiguas, `start`/`stop` |
| `devices` | lista | Sus dispositivos |

## Dispositivos

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | texto | Identificador único en el laboratorio |
| `type` | texto | Su tipo: `alpine`, `ubuntu`, `debian`, `busybox`, `nginx`, `netshoot`, `frr`, `srlinux`, `routeros`, y los genéricos `pc`, `laptop`, `server`, `phone`, `iot`, `switch`, `ap`, `router`, `firewall`, `cloud` |
| `name` | texto | Nombre visible (el `hostname` de su contenedor) |
| `status` | `up` · `down` | Si se inicia cuando su topología es `hybrid` |
| `profile` | texto | El perfil de imagen con el que corre en la emulación |
| `description` | texto | Una nota |
| `interfaces` | lista | Sus puertos: `{ name, mac }`. La MAC se inventa si falta |
| `config` | objeto | Su configuración (abajo) |

### `config`

No depende del fabricante: la emulación la aplica a Linux (Alpine y los genéricos), FRR,
SR Linux o RouterOS.

| Campo | Tipo | Qué es |
|---|---|---|
| `interfaces` | objeto | Por nombre de puerto: `{ ip, dhcp, vlan, relay }` |
| `gateway` | IP | Puerta de enlace de un equipo final |
| `dns` | IP | Su servidor DNS |
| `routes` | lista | Rutas estáticas de un router: `{ prefix, via }`; `0.0.0.0/0` es la ruta por defecto |
| `services` | objeto | Lo que sirve: `dhcp` (rangos), `dns` (registros), `http` (`true`) |

Cada puerto de `config.interfaces`:

| Campo | Tipo | Qué es |
|---|---|---|
| `ip` | `a.b.c.d/n` | Su dirección (`/24` si no se dice) |
| `dhcp` | `true` | Toma su dirección por DHCP |
| `vlan` | 1–4094 | VLAN de acceso de un puerto de switch (1 si falta) |
| `relay` | IP | Relay DHCP de un puerto de router: el servidor al que reenvía |

`services.dhcp` es una lista de `{ network, start, end, gateway?, dns? }`, y `services.dns`, una
lista de `{ name, ip }`.

## Cables

```yaml
links:
  - { id: l1, a: "r1:eth0", b: "pc-1:eth0" }
```

`a` y `b` son `dispositivo:puerto`. Un puerto tiene como mucho un cable.

## `canvas`

| Campo | Tipo | Qué es |
|---|---|---|
| `decorations` | booleano | Si se dibujan los rectángulos de las topologías (`true` si falta) |
| `topologies` | objeto | Por id de topología: `{ color, text, position }`. `position` solo cuando la topología está vacía |
| `positions` | objeto | Por id de dispositivo: `{ x, y }` |

## Errores

`parse()` valida todo el documento y devuelve cada problema con su línea cuando puede. Si hay
alguno, el documento no reemplaza al laboratorio:

- un tipo, una dirección, una MAC, una VLAN o un estado inválidos;
- ids o puertos repetidos, un puerto con dos cables;
- un puerto de `config.interfaces` que el dispositivo no tiene;
- un cable o una posición que apunta a algo que no existe.

## Versiones anteriores

| Versión | Diferencia | Se lee |
|---|---|---|
| 3 | La configuración dentro de cada puerto (`ip` junto a `name` y `mac`) y en el dispositivo (`gateway`, `routes`, `services`) | sí |
| 2 | Colores, notas y posiciones dentro de las topologías y los dispositivos; `options.decorations` | sí |
| 1 | `devices` en la raíz, una sola topología | sí |

Al guardar, siempre se escribe la versión 4.
