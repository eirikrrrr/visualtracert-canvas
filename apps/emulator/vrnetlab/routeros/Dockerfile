# visual-tracert's vrnetlab image of MikroTik RouterOS (CHR): the virtual
# machine, QEMU to run it and the launcher that wires and configures it.
# The emulator builds it on its server (Marketplace), for its architecture:
# the CHR for ARM64 with UEFI, or the one for x86_64.
FROM alpine:3.20
ARG VERSION=7.23.8
RUN set -e; \
    case "$(uname -m)" in \
      aarch64) qemu="qemu-system-aarch64 aavmf"; chr="chr-$VERSION-arm64.img" ;; \
      x86_64) qemu="qemu-system-x86_64"; chr="chr-$VERSION.img" ;; \
      *) echo "No hay RouterOS CHR para $(uname -m)" >&2; exit 1 ;; \
    esac; \
    apk add --no-cache $qemu qemu-img python3 iproute2 socat openssh-client-default sshpass; \
    mkdir -p /vr; \
    wget -q -O /tmp/chr.zip "https://download.mikrotik.com/routeros/$VERSION/$chr.zip"; \
    unzip -q /tmp/chr.zip -d /tmp; \
    mv "/tmp/$chr" /vr/chr.img; \
    rm /tmp/chr.zip
COPY launch.py vr-cli vr-console /vr/
RUN chmod 755 /vr/launch.py /vr/vr-cli /vr/vr-console \
 && ln -s /vr/vr-cli /usr/local/bin/vr-cli \
 && ln -s /vr/vr-console /usr/local/bin/vr-console
LABEL org.opencontainers.image.title="visual-tracert-routeros" \
      org.opencontainers.image.description="MikroTik RouterOS CHR en QEMU, como dispositivo de visual-tracert (vrnetlab)"
ENTRYPOINT ["/vr/launch.py"]
