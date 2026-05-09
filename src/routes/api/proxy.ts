import { createFileRoute } from "@tanstack/react-router";

const MAX_BYTES = 5_000_000;

export const Route = createFileRoute("/api/proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const target = u.searchParams.get("url");
        const ua = u.searchParams.get("ua") || "";
        if (!target) {
          return new Response("Missing url", { status: 400 });
        }
        let parsed: URL;
        try {
          parsed = new URL(target);
          if (!["http:", "https:"].includes(parsed.protocol)) {
            return new Response("Invalid protocol", { status: 400 });
          }
        } catch {
          return new Response("Invalid url", { status: 400 });
        }

        let upstream: Response;
        try {
          upstream = await fetch(parsed.toString(), {
            redirect: "follow",
            headers: {
              ...(ua ? { "user-agent": ua } : {}),
              accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
              "accept-language": "en-US,en;q=0.9",
            },
          });
        } catch (e) {
          return new Response(`Fetch error: ${(e as Error).message}`, {
            status: 502,
          });
        }

        const ct = upstream.headers.get("content-type") || "";
        const isHtml = ct.includes("html") || ct.includes("xml") || ct === "";

        if (!isHtml) {
          // Stream raw bytes (images, etc.) — but do not let scripts execute via type
          const buf = await upstream.arrayBuffer();
          return new Response(buf, {
            status: upstream.status,
            headers: {
              "content-type": ct || "application/octet-stream",
              "x-frame-options": "SAMEORIGIN",
              "content-security-policy":
                "sandbox allow-forms allow-popups allow-scripts; default-src 'none';",
            },
          });
        }

        // Read HTML capped
        const reader = upstream.body?.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              size += value.byteLength;
              if (size > MAX_BYTES) {
                await reader.cancel();
                break;
              }
              chunks.push(value);
            }
          }
        }
        const merged = new Uint8Array(size);
        let off = 0;
        for (const c of chunks) {
          merged.set(c, off);
          off += c.byteLength;
        }
        let html = new TextDecoder("utf-8", { fatal: false }).decode(merged);

        // Inject <base> so relative resources load through proxy origin.
        const finalUrl = upstream.url || parsed.toString();
        const proxyBase = `/api/proxy?ua=${encodeURIComponent(ua)}&url=`;
        // Rewrite so relative URLs resolve to original then hop through proxy.
        // Simplest safe approach: set <base href="originUrl/"> so the iframe
        // requests resources directly from the target. The iframe is sandboxed
        // so it cannot touch the parent. Resources are loaded by the browser
        // (not the user's machine in any privileged sense) — same risk model
        // as opening the URL in a private tab, but the parent app is isolated.
        const baseTag = `<base href="${finalUrl}">`;
        if (/<head[^>]*>/i.test(html)) {
          html = html.replace(/<head[^>]*>/i, (m) => m + baseTag);
        } else {
          html = baseTag + html;
        }
        // Strip CSP from upstream HTML <meta> so iframe can render
        html = html.replace(
          /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi,
          "",
        );

        // Mark proxyBase used (for future link-rewrite enhancement)
        void proxyBase;

        return new Response(html, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "x-proxied-from": finalUrl,
            // Strong CSP via sandbox at iframe level (set in client). Here we
            // also send a frame-ancestors restriction so only our app embeds.
            "content-security-policy": "frame-ancestors 'self'",
          },
        });
      },
    },
  },
});
