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

      // Best-effort: open the URL in the remote browser via CDP over WS.
      // If it fails, the user can type the URL inside the live view.
      if (data.url && json.wsEndpoint) {
        try {
          await navigateViaCdp(json.wsEndpoint, data.url);
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

// Minimal CDP navigation via WebSocket. Cloudflare Workers support WebSocket client.
async function navigateViaCdp(wsUrl: string, url: string): Promise<void> {
  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("ws timeout")), 8000);
    ws.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("ws error"));
    });
  });

  let id = 0;
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<unknown>((resolve) => {
      const msgId = ++id;
      const onMsg = (e: MessageEvent) => {
        try {
          const m = JSON.parse(typeof e.data === "string" ? e.data : "");
          if (m.id === msgId) {
            ws.removeEventListener("message", onMsg);
            resolve(m.result);
          }
        } catch {
          /* ignore */
        }
      };
      ws.addEventListener("message", onMsg);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  // Get first target (page) and attach
  const targets = (await send("Target.getTargets")) as {
    targetInfos: { targetId: string; type: string }[];
  };
  const page = targets.targetInfos.find((t) => t.type === "page");
  if (!page) {
    ws.close();
    return;
  }
  const session = (await send("Target.attachToTarget", {
    targetId: page.targetId,
    flatten: true,
  })) as { sessionId: string };

  await new Promise<void>((resolve) => {
    const sid = ++id;
    const onMsg = (e: MessageEvent) => {
      try {
        const m = JSON.parse(typeof e.data === "string" ? e.data : "");
        if (m.id === sid) {
          ws.removeEventListener("message", onMsg);
          resolve();
        }
      } catch {
        /* ignore */
      }
    };
    ws.addEventListener("message", onMsg);
    ws.send(
      JSON.stringify({
        sessionId: session.sessionId,
        id: sid,
        method: "Page.navigate",
        params: { url },
      }),
    );
  });

  ws.close();
}
