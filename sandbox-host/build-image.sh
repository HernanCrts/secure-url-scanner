#!/usr/bin/env bash
# Construye la golden image con virt-builder.
# Resultado: /var/lib/urlab/base.qcow2 (10 GB, Debian 12 + Firefox + noVNC autostart)
#
# Edita la sección --run-command para añadir TUS herramientas
# (mitmproxy, wireshark, extensiones, etc.). Solo se ejecuta una vez.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Ejecutar con sudo" >&2; exit 1
fi

BASE_DIR=/var/lib/urlab
mkdir -p "$BASE_DIR/overlays"

VNC_PASS="${VNC_PASS:-urlab}"   # solo entre QEMU y websockify, no expuesto

virt-builder debian-12 \
  --size 10G \
  --format qcow2 \
  --output "$BASE_DIR/base.qcow2" \
  --hostname urlab-sandbox \
  --root-password password:root \
  --update \
  --install firefox-esr,xorg,openbox,x11vnc,xterm,dbus-x11,ca-certificates,curl,xdotool \
  --run-command 'systemctl set-default multi-user.target' \
  --write '/etc/systemd/system/urlab-x.service:[Unit]
Description=URLab X+VNC+Firefox
After=network.target
[Service]
Type=simple
User=root
Environment=DISPLAY=:0
ExecStartPre=/bin/sh -c "rm -f /tmp/.X0-lock"
ExecStart=/bin/sh -c "Xorg :0 vt1 -nolisten tcp & sleep 2; openbox-session & sleep 1; x11vnc -display :0 -forever -shared -nopw -rfbport 5900 -quiet & sleep 1; URL=$(cat /var/urlab-target 2>/dev/null || echo about:blank); firefox-esr --no-remote --new-instance \"$URL\""
Restart=always
[Install]
WantedBy=multi-user.target' \
  --run-command 'systemctl enable urlab-x.service' \
  --run-command 'echo "auto eth0\niface eth0 inet dhcp" > /etc/network/interfaces.d/eth0' \
  --selinux-relabel

echo "OK: base image en $BASE_DIR/base.qcow2"
echo "Para añadir más herramientas edita build-image.sh y vuelve a ejecutarlo."
