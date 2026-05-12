// Cliente para el sandbox QEMU/virt-builder auto-hospedado.
// Mantengo los nombres `createHbSession` / `stopHbSession` / `HBSession`
// para no tocar el resto del UI: ahora hablan con TU host (variables
// SANDBOX_HOST_URL + SANDBOX_API_TOKEN), no con Hyperbrowser.
import { createServerFn } from "@tanstack/react-start";

export type HBSession = {
  ok: boolean;
  error?: string;
  id?: string;
  liveUrl?: string;
  wsEndpoint?: string;
};

function host() {
  const h = process.env.SANDBOX_HOST_URL;
  if (!h) throw new Error("SANDBOX_HOST_URL no configurada");
  return h.replace(/\/$/, "");
}
function token() {
  const t = process.env.SANDBOX_API_TOKEN;
  if (!t) throw new Error("SANDBOX_API_TOKEN no configurada");
  return t;
}

export const createHbSession = createServerFn({ method: "POST" })
  .inputValidator((d: { url?: string }) => d)
  .handler(async ({ data }): Promise<HBSession> => {
    try {
      const res = await fetch(`${host()}/session`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ url: data.url ?? null }),
      });
      const json = (await res.json()) as {
        id?: string;
        liveUrl?: string;
        error?: string;
      };
      if (!res.ok || !json.id) {
        return { ok: false, error: json.error || `HTTP ${res.status}` };
      }
      return { ok: true, id: json.id, liveUrl: json.liveUrl };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

export const stopHbSession = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    try {
      const res = await fetch(`${host()}/session/${data.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token()}` },
      });
      return { ok: res.ok };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
