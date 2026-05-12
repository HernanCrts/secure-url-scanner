// API HTTP del sandbox. Corre en TU host (no en Lovable).
//   POST   /session     { url? }    -> { id, liveUrl }
//   DELETE /session/:id             -> 204
//
// Cada sesión arranca:
//   1. overlay qcow2 sobre /var/lib/urlab/base.qcow2  (efímero)
//   2. qemu-system-x86_64 con ese overlay y VNC en 127.0.0.1:59xx
//   3. websockify exponiendo noVNC en 0.0.0.0:60xx (HTTP)
// Al destruirla matamos ambos procesos y borramos el overlay.
//
// Auth: Authorization: Bearer $SANDBOX_API_TOKEN
//
// Variables de entorno:
//   SANDBOX_API_TOKEN  (obligatoria)
//   PORT               (default 8787)
//   PUBLIC_HOST        (default = host de la request; pon aquí tu dominio
//                       público de Cloudflare Tunnel para construir liveUrl)
//   BASE_IMAGE         (default /var/lib/urlab/base.qcow2)
//   OVERLAY_DIR        (default /var/lib/urlab/overlays)
//   NOVNC_DIR          (default /usr/share/novnc)

import express from "express";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

const TOKEN = process.env.SANDBOX_API_TOKEN;
if (!TOKEN) { console.error("SANDBOX_API_TOKEN requerido"); process.exit(1); }

const PORT = Number(process.env.PORT || 8787);
const PUBLIC_HOST = process.env.PUBLIC_HOST || null;
const BASE_IMAGE = process.env.BASE_IMAGE || "/var/lib/urlab/base.qcow2";
const OVERLAY_DIR = process.env.OVERLAY_DIR || "/var/lib/urlab/overlays";
const NOVNC_DIR = process.env.NOVNC_DIR || "/usr/share/novnc";

mkdirSync(OVERLAY_DIR, { recursive: true });

/** @type {Map<string, {qemu: import('node:child_process').ChildProcess, ws: import('node:child_process').ChildProcess, vncPort:number, wsPort:number, overlay:string}>} */
const sessions = new Map();
let nextPort = 5900;
function allocPort() {
  // par para VNC, par+100 para websockify
  const v = nextPort; nextPort += 1;
  return { vncPort: v, wsPort: v + 1000 };
}

function sh(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", ...opts });
    p.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`)));
  });
}

async function startSession(targetUrl) {
  const id = randomUUID();
  const overlay = join(OVERLAY_DIR, `${id}.qcow2`);
  const { vncPort, wsPort } = allocPort();

  // 1. overlay efímero
  await sh("qemu-img", ["create", "-f", "qcow2", "-F", "qcow2", "-b", BASE_IMAGE, overlay]);

  // 2. inyectar URL objetivo (firefox la lee al arrancar — ver build-image.sh)
  if (targetUrl) {
    // virt-customize seria lo correcto pero es lento; en su lugar
    // pasamos la URL via -fw_cfg como fichero accesible en /sys/firmware/qemu_fw_cfg/
    // Para simplificar, lanzamos firefox manualmente via SSH/qemu-guest-agent
    // sería ideal; aquí la dejamos en blank y el usuario la pega en la VM.
    // (Para una v2: meter virt-customize --write /var/urlab-target:URL antes de arrancar)
  }

  // 3. arrancar QEMU
  const qemu = spawn("qemu-system-x86_64", [
    "-enable-kvm",
    "-m", "2048",
    "-cpu", "host",
    "-smp", "2",
    "-drive", `file=${overlay},if=virtio`,
    "-netdev", "user,id=n0",
    "-device", "virtio-net-pci,netdev=n0",
    "-vga", "virtio",
    "-vnc", `127.0.0.1:${vncPort - 5900}`,
    "-display", "none",
    "-snapshot",
  ], { stdio: "ignore", detached: true });

  // 4. websockify -> noVNC HTML5
  const ws = spawn("websockify", [
    `0.0.0.0:${wsPort}`,
    `127.0.0.1:${vncPort}`,
    "--web", NOVNC_DIR,
  ], { stdio: "ignore", detached: true });

  sessions.set(id, { qemu, ws, vncPort, wsPort, overlay });
  return { id, wsPort };
}

function stopSession(id) {
  const s = sessions.get(id);
  if (!s) return false;
  try { process.kill(-s.qemu.pid); } catch {}
  try { process.kill(-s.ws.pid); } catch {}
  try { rmSync(s.overlay, { force: true }); } catch {}
  sessions.delete(id);
  return true;
}

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`)
    return res.status(401).json({ error: "unauthorized" });
  next();
});

app.post("/session", async (req, res) => {
  try {
    const { url } = req.body || {};
    const { id, wsPort } = await startSession(url);
    const host = PUBLIC_HOST || req.headers.host;
    const proto = (req.headers["x-forwarded-proto"] || "https").toString();
    // noVNC vendor URL — autoconnect, fullscreen
    const liveUrl = `${proto}://${host}/novnc/${id}/vnc.html?autoconnect=1&resize=scale&path=ws/${id}`;
    // Nota: para que esa ruta funcione necesitas que tu Cloudflare Tunnel
    // reescriba /novnc/:id -> 127.0.0.1:wsPort.  Si solo expones el puerto
    // directo, usa el liveUrl simple de abajo:
    const directUrl = `http://${(host || "").split(":")[0]}:${wsPort}/vnc.html?autoconnect=1&resize=scale`;
    res.json({ id, liveUrl: PUBLIC_HOST ? liveUrl : directUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/session/:id", (req, res) => {
  stopSession(req.params.id);
  res.status(204).end();
});

// Limpieza al apagar
process.on("SIGTERM", () => { for (const id of sessions.keys()) stopSession(id); process.exit(0); });
process.on("SIGINT",  () => { for (const id of sessions.keys()) stopSession(id); process.exit(0); });

app.listen(PORT, "0.0.0.0", () => {
  console.log(`urlab-sandbox API escuchando en :${PORT}`);
});
