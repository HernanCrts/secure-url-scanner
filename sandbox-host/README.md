# URLab Sandbox Host (QEMU + virt-builder + noVNC)

Servicio que arranca microVMs efímeras a partir de una **golden image**
construida con `virt-builder`. Cada sesión usa un **overlay qcow2** sobre
la imagen base — al cerrar la sesión el overlay se borra y cualquier
infección desaparece.

## Arquitectura

```
Lovable app  --HTTPS-->  api.js (Node, este repo)
                            |
                            +-- POST /session  -> qemu-system-x86_64 + websockify (noVNC)
                            +-- DELETE /:id    -> kill QEMU + rm overlay
```

## Requisitos del host

- Linux x86_64 (Debian 12 / Ubuntu 22.04+ recomendado)
- KVM disponible: `egrep -c '(vmx|svm)' /proc/cpuinfo` debe ser > 0
- Acceso root (o sudo) para instalar paquetes
- ~10 GB libres para la imagen base

## 1. Instalación (una vez)

```bash
sudo apt update
sudo apt install -y qemu-system-x86 qemu-utils libguestfs-tools \
                    novnc websockify nodejs npm curl jq
sudo usermod -aG kvm $USER   # re-login después
```

Clona este directorio en tu host:

```bash
mkdir -p ~/urlab-sandbox && cd ~/urlab-sandbox
# copia aquí los ficheros de sandbox-host/
npm install express
```

## 2. Construir la golden image (una vez, ~10 min)

`build-image.sh` crea `/var/lib/urlab/base.qcow2` con Debian + Firefox ESR
+ openbox + x11vnc + autostart. **Aquí puedes añadir tus herramientas**
(Wireshark, mitmproxy, extensiones, etc.) editando la sección `--run-command`.

```bash
sudo ./build-image.sh
```

Tras ejecutarse, cualquier reinicio de cualquier VM siempre parte de este
disco — los cambios viven solo en el overlay efímero.

## 3. Lanzar el API

```bash
export SANDBOX_API_TOKEN="$(openssl rand -hex 32)"   # guarda este valor
export PORT=8787
node api.js
```

(Para producción usa `systemd` — ver `urlab-sandbox.service` al final).

## 4. Exponer a internet

**Opción A — Cloudflare Tunnel (recomendado, gratis, sin abrir puertos):**

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared
cloudflared tunnel login
cloudflared tunnel create urlab
cloudflared tunnel route dns urlab sandbox.tu-dominio.com
cloudflared tunnel run --url http://localhost:8787 urlab
```

**Opción B — Tailscale Funnel:** `tailscale funnel 8787`

Tu URL pública será algo como `https://sandbox.tu-dominio.com`.

## 5. Configurar Lovable

En Lovable añade dos secretos (te los pedirá automáticamente):

- `SANDBOX_HOST_URL` = `https://sandbox.tu-dominio.com`
- `SANDBOX_API_TOKEN` = el valor que generaste en el paso 3

Ya está. Al pulsar "Iniciar VM aislada" en la app, este host arranca una
microVM con Firefox apuntando a la URL, devuelve la URL noVNC y la
embebe en el iframe. Al cerrar la pestaña → la VM muere → el overlay se
borra → infección eliminada.

## Limpieza periódica

Por si una sesión queda colgada:

```bash
# añade a crontab -e
*/30 * * * * find /var/lib/urlab/overlays -mmin +60 -delete
```
