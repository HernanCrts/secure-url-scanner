import { createServerFn } from "@tanstack/react-start";

const BASE = "https://app.hyperbrowser.ai/api";

export type HBSession = {
  ok: boolean;
  error?: string;
  id?: string;
  liveUrl?: string;
  wsEndpoint?: string;
};

function key() {
  const k = process.env.HYPERBROWSER_API_KEY;
  if (!k) throw new Error("HYPERBROWSER_API_KEY no configurada");
  return k;
}

export const createHbSession = createServerFn({ method: "POST" })
  .inputValidator((d: { url?: string }) => d)
  .handler(async ({ data }): Promise<HBSession> => {
    try {
      const res = await fetch(`${BASE}/session`, {
        method: "POST",
        headers: {
          "x-api-key": key(),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          useStealth: true,
          adblock: true,
          solveCaptchas: false,
        }),
      });
      const json = (await res.json()) as {
        id?: string;
        liveUrl?: string;
        wsEndpoint?: string;
        message?: string;
      };
      if (!res.ok || !json.id) {
        return { ok: false, error: json.message || `HTTP ${res.status}` };
      }

      // Best-effort initial navigation via Hyperbrowser computer-action / scrape
      // endpoint. We can't open WS from Cloudflare Workers with `new WebSocket()`,
      // so we don't try CDP here. The user can type the URL inside the live view
      // if this best-effort call fails.
      if (data.url) {
        try {
          await fetch(`${BASE}/session/${json.id}/computer-action`, {
            method: "POST",
            headers: {
              "x-api-key": key(),
              "content-type": "application/json",
            },
            body: JSON.stringify({ action: "goto", url: data.url }),
          });
        } catch {
          /* ignore — user can navigate manually */
        }
      }

      return {
        ok: true,
        id: json.id,
        liveUrl: json.liveUrl,
        wsEndpoint: json.wsEndpoint,
      };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

export const stopHbSession = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    try {
      const res = await fetch(`${BASE}/session/${data.id}/stop`, {
        method: "PUT",
        headers: { "x-api-key": key() },
      });
      return { ok: res.ok };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
