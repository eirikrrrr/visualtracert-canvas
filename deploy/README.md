# Despliegue en un servidor

La app corre en un VPS con Docker (probado para Ubuntu 24.04, x86). GitHub Actions
(`.github/workflows/deploy.yml`) hace todo en cada push a `main`: pasa las pruebas, construye
las tres imágenes (web, api y emulador) y las publica en GHCR, y el servidor las descarga y
reinicia. El servidor no compila nada.

Delante va **Caddy**: con un dominio sirve HTTPS (certificado de Let's Encrypt, renovado solo);
sin dominio, HTTP en la IP. Solo Caddy queda publicado (80 y 443); el API y el emulador, que es
root en la máquina, quedan en la red interna.

## Una vez

1. **Acceso por clave SSH.** En tu PC, crea una clave solo para el despliegue y pon su parte
   pública en el servidor:

   ```sh
   ssh-keygen -t ed25519 -f ~/.ssh/visual-tracert-deploy -C deploy -N ""
   ssh-copy-id -i ~/.ssh/visual-tracert-deploy.pub root@IP_DEL_SERVIDOR
   ```

2. **Preparar el servidor** (Docker, firewall con 22, 80 y 443, la carpeta `/opt/visual-tracert`
   y la copia diaria de la base de datos):

   ```sh
   scp deploy/setup-server.sh root@IP_DEL_SERVIDOR:/root/
   ssh root@IP_DEL_SERVIDOR sh /root/setup-server.sh
   ```

3. **La configuración** en el servidor, a partir de `deploy/.env.example`:

   ```sh
   scp deploy/.env.example root@IP_DEL_SERVIDOR:/opt/visual-tracert/.env
   ssh root@IP_DEL_SERVIDOR nano /opt/visual-tracert/.env   # DOMAIN, SETUP_CODE…
   ```

4. **En GitHub** (Settings → Secrets and variables → Actions):
   - variable `DEPLOY_HOST`: la IP del servidor (sin ella no se despliega);
   - secreto `DEPLOY_SSH_KEY`: el contenido de `~/.ssh/visual-tracert-deploy` (la privada).

5. **Desplegar:** un push a `main`, o Actions → deploy → Run workflow.

6. **La primera cuenta:** el código de instalación es `SETUP_CODE`, o el que imprime
   `docker compose logs api` en el servidor (en `/opt/visual-tracert`).

## Un dominio

Crea un registro **A** del dominio hacia la IP del servidor, pon `DOMAIN=tudominio.com` en
`/opt/visual-tracert/.env` y reinicia Caddy (`docker compose up -d caddy`). El certificado llega
en unos segundos. Con HTTPS, las cookies de sesión son `Secure` solas.

## Copias de seguridad

Cada día a las 03:30, `backup.sh` guarda una copia de la base de datos en
`/opt/visual-tracert/backups` y borra las de más de 14 días (`BACKUP_DAYS`). A mano:
`sh /opt/visual-tracert/backup.sh`. Para restaurar, para el API, descomprime la copia en el
volumen `visual-tracert_api-data` como `visual-tracert.db` y arráncalo.

Conviene descargar de vez en cuando alguna copia fuera del servidor:
`scp root@IP_DEL_SERVIDOR:/opt/visual-tracert/backups/*.gz .`
