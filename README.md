# Concepto: Next-Generation Network Simulator

Quiero desarrollar una plataforma web que funcione como una alternativa moderna a Cisco Packet Tracer, ofreciendo una experiencia de usuario significativamente mejorada, una interfaz visual intuitiva y capacidades de simulación y emulación de redes.

La aplicación debe permitir a los usuarios diseñar, construir, configurar y experimentar con topologías de red desde el navegador, sin depender de una aplicación de escritorio.

## Concepto principal

La plataforma contará con un espacio de trabajo visual e interactivo donde los usuarios podrán crear topologías de red mediante drag & drop, incorporando diferentes tipos de dispositivos, conectándolos entre sí y configurando sus propiedades.

Los dispositivos se representarán mediante iconos e imágenes visuales propias, con interfaces, puertos y conexiones identificables. La topología deberá generarse dinámicamente y mantenerse sincronizada con su definición lógica.

## Definición de topologías

Las redes podrán definirse tanto visualmente como mediante documentos estructurados, utilizando formatos como YAML o JSON.

Estos documentos describirán:
- Dispositivos y sus tipos.
- Interfaces de red.
- Direccionamiento IP y MAC.
- Conexiones entre dispositivos.
- VLAN y segmentos de red.
- Protocolos y configuraciones.
- Parámetros específicos de cada dispositivo.

La modificación de una topología desde el editor visual deberá poder reflejarse en su documento de definición y viceversa.

El documento actual (versión 4) separa lo que es cada equipo (su tipo y sus puertos), cómo se
configura (`config`) y cómo se dibuja (`canvas`):

```yaml
version: 4
name: Dos redes y un router
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
        interfaces:
          - { name: eth0, mac: 02:00:00:00:00:03 }
        config:
          interfaces:
            eth0: { ip: 192.168.1.10/24 }
          gateway: 192.168.1.1
links:
  - { id: l1, a: "r1:eth0", b: "pc-1:eth0" }
canvas:
  positions:
    r1: { x: 300, y: 200 }
    pc-1: { x: 80, y: 200 }
```

`config` no depende del fabricante: la emulación la aplica a Linux, FRR, SR Linux o RouterOS. Los
documentos de versiones anteriores se siguen leyendo.

## Dispositivos y tecnologías

La plataforma deberá contemplar diferentes tipos de dispositivos de red:

- Routers.
- Switches.
- Firewalls.
- Ordenadores y clientes.
- Servidores.
- Access Points.
- Dispositivos IoT.
- Máquinas virtuales y contenedores.

También deberá permitir representar y trabajar con tecnologías y protocolos como TCP/IP, ARP, ICMP, DHCP, DNS, NAT, VLAN, STP, OSPF, BGP, VPN y routing estático.

## Simulación y emulación

Uno de los elementos fundamentales será la posibilidad de trabajar con dos modalidades:

**Simulación:** representar el comportamiento de dispositivos y protocolos de red, permitiendo observar el recorrido de los paquetes, las comunicaciones, los estados de las interfaces y los procesos internos de la red.

**Emulación:** permitir que los dispositivos representados correspondan a entornos de ejecución reales, utilizando contenedores, máquinas virtuales y sistemas operativos de red compatibles.

La intención es que el usuario pueda pasar de una representación visual de una infraestructura a una red funcional y operativa.

## Interfaz y experiencia de usuario

La experiencia de usuario será uno de los principales diferenciadores del proyecto.

La interfaz deberá tener una estética moderna, profesional y minimalista, con especial atención a la usabilidad y a la claridad visual.

El espacio de trabajo deberá incluir:
- Canvas interactivo para diseñar topologías.
- Panel lateral de dispositivos.
- Panel contextual de propiedades y configuración.
- Consolas y terminales integradas.
- Visualización de conexiones y estados.
- Inspección del tráfico de red.
- Monitorización de dispositivos.
- Gestión de proyectos y laboratorios.

La interfaz deberá ser fluida, adaptable y fácil de utilizar, incluso en topologías complejas.

## Visualización y análisis de tráfico

La plataforma deberá permitir observar cómo circula la información por la infraestructura.

Los usuarios podrán visualizar paquetes atravesando los dispositivos, inspeccionar protocolos, examinar cabeceras, identificar errores y comprender cómo se comporta una red.

También se contempla la integración de funcionalidades de análisis similares a las ofrecidas por herramientas como Wireshark.

## Filosofía del producto

El objetivo es crear una plataforma independiente que combine la accesibilidad educativa de Cisco Packet Tracer con la flexibilidad y potencia de herramientas de emulación profesional como GNS3 y Containerlab.

No se pretende realizar una copia de implementaciones propietarias existentes, sino desarrollar un producto original, con arquitectura propia, recursos gráficos propios y una experiencia de usuario superior.

El resultado deseado es una plataforma de laboratorio de redes accesible desde cualquier navegador, que permita aprender, diseñar, experimentar, configurar y desplegar infraestructuras de red tanto simuladas como reales.
## Estructura del repositorio

Un monorepo con workspaces de npm:

```
apps/
  web/            editor visual y simulación de paquetes en el navegador (Vite + React)
  emulator/       emulación: cada equipo, un contenedor; cada cable, un par veth (API en /api)
packages/
  model/          lo que comparten las apps: tipos de la topología, documento YAML/JSON,
                  catálogo de dispositivos, plantillas de laboratorio y traducciones
```

- `npm install` en la raíz instala y enlaza todo.
- `npm run dev` arranca el editor; `npm test` y `npm run typecheck` recorren todos los workspaces.
- `docker compose up -d --build` construye cada app desde la raíz (para que vea `packages/`) y publica el editor en el puerto 9150.

El emulador necesita el socket de Docker y entrar en el espacio de red de otros contenedores (va con
privilegios y con los PID del host): en la práctica es root sobre la máquina. Por eso solo se alcanza a
través del nginx del editor (`/api`) y, para desarrollo, en `127.0.0.1:9151`. Los contenedores de cada
laboratorio llevan la etiqueta `visual-tracert.lab` y se pueden borrar con
`docker rm -f $(docker ps -aq --filter label=visual-tracert.lab)`.

Los perfiles de imagen se guardan en el volumen `emulator-data` y se construyen con Docker en este
servidor: sus comandos se ejecutan como `RUN` con acceso a Internet. FRRouting necesita además
`SYS_ADMIN` dentro de su contenedor. Nokia SR Linux necesita un contenedor privilegiado (root en
este equipo): el emulador solo lo permite si se arranca con `ALLOW_PRIVILEGED=1 docker compose up -d`.

MikroTik RouterOS es una máquina virtual (el CHR oficial), así que corre como en
[vrnetlab](https://github.com/vrnetlab/vrnetlab): su imagen se construye en este servidor desde
`apps/emulator/vrnetlab/routeros` (Alpine, QEMU y el disco de RouterOS de download.mikrotik.com, para
ARM64 o x86_64). Su lanzador espera los cables, une cada puerto a una tarjeta de la máquina con `tc`,
arranca con KVM y configura RouterOS por la consola serie; la CLI entra por SSH en una interfaz de
gestión aislada en su propio VRF. Su contenedor recibe `/dev/net/tun` y, si existe, `/dev/kvm` (sin
KVM se emula, mucho más lento); no necesita privilegios. El usuario es `admin` y la contraseña
`admin`, también desde los equipos del laboratorio.

La captura de tráfico ejecuta tcpdump desde el emulador en el espacio de red del dispositivo, con
el filtro validado, y la corta a los 64 MB.

El diseño de la web (temas, tokens, componentes, lienzo e interacción) está en [DESIGN.md](DESIGN.md).

La CLI de cada dispositivo es una shell de root dentro de su contenedor (sin red propia, 96 MB de
memoria, con `NET_ADMIN` solo en su espacio de red), por WebSocket en
`/api/labs/:lab/devices/:device/shell`. No hay usuarios: quien alcance el puerto 9150 alcanza esas
shells, así que el editor no debe publicarse fuera de una red de confianza.

## Versiones

Todo el repositorio comparte una versión ([SemVer](https://semver.org/lang/es/)) y cada una queda en
[CHANGELOG.md](CHANGELOG.md) y en una etiqueta `vX.Y.Z`. Para publicar una:

1. Pasa lo de «Sin publicar» del CHANGELOG a la nueva versión, con su fecha.
2. `npm version X.Y.Z --workspaces --include-workspace-root --no-git-tag-version`
3. Commit `chore: release X.Y.Z`, etiqueta `git tag -a vX.Y.Z -m "visual-tracert X.Y.Z"` y push con `--follow-tags`.

La app muestra su versión junto al nombre, en la barra superior.
