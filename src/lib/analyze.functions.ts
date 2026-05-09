import { createServerFn } from "@tanstack/react-start";

export type RedirectHop = {
  url: string;
  status: number;
  statusText: string;
  location: string | null;
  headers: Record<string, string>;
  setCookies: string[];
  durationMs: number;
};

export type AnalyzeResult = {
  ok: boolean;
  error?: string;
  finalUrl?: string;
  finalStatus?: number;
  hops: RedirectHop[];
  metadata?: {
    title: string | null;
    description: string | null;
    canonical: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImage: string | null;
    favicon: string | null;
    contentType: string | null;
    contentLength: number | null;
    server: string | null;
    htmlLang: string | null;
  };
  links?: { href: string; text: string }[];
  scripts?: string[];
  iframes?: string[];
  forms?: { action: string; method: string }[];
  htmlSize?: number;
  htmlPreview?: string;
};

const MAX_HOPS = 15;
const MAX_BYTES = 2_500_000; // ~2.5MB cap

function headersToObject(h: Headers): Record<string, string> {
  const o: Record<string, string> = {};
  h.forEach((v, k) => {
    o[k] = v;
  });
  return o;
}

function resolveUrl(base: string, target: string): string {
  try {
    return new URL(target, base).toString();
  } catch {
    return target;
  }
}

function extractMeta(html: string, finalHeaders: Headers, finalUrl: string) {
  const pick = (re: RegExp) => {
    const m = html.match(re);
    return m ? m[1].trim() : null;
  };
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const desc =
    pick(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    ) ||
    pick(
      /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i,
    );
  const canonical = pick(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i,
  );
  const ogTitle = pick(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i,
  );
  const ogDesc = pick(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
  );
  const ogImage = pick(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i,
  );
  const favicon = pick(
    /<link[^>]+rel=["'](?:shortcut icon|icon)["'][^>]+href=["']([^"']*)["']/i,
  );
  const htmlLang = pick(/<html[^>]+lang=["']([^"']*)["']/i);

  return {
    title,
    description: desc,
    canonical: canonical ? resolveUrl(finalUrl, canonical) : null,
    ogTitle,
    ogDescription: ogDesc,
    ogImage: ogImage ? resolveUrl(finalUrl, ogImage) : null,
    favicon: favicon ? resolveUrl(finalUrl, favicon) : null,
    contentType: finalHeaders.get("content-type"),
    contentLength: finalHeaders.get("content-length")
      ? Number(finalHeaders.get("content-length"))
      : null,
    server: finalHeaders.get("server"),
    htmlLang,
  };
}

function extractAll(html: string, base: string) {
  const links: { href: string; text: string }[] = [];
  const linkRe =
    /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) && links.length < 200) {
    links.push({
      href: resolveUrl(base, m[1]),
      text: m[2].replace(/<[^>]*>/g, "").trim().slice(0, 120),
    });
  }
  const scripts: string[] = [];
  const scriptRe = /<script\b[^>]*\bsrc=["']([^"']+)["']/gi;
  while ((m = scriptRe.exec(html)) && scripts.length < 100) {
    scripts.push(resolveUrl(base, m[1]));
  }
  const iframes: string[] = [];
  const iframeRe = /<iframe\b[^>]*\bsrc=["']([^"']+)["']/gi;
  while ((m = iframeRe.exec(html)) && iframes.length < 50) {
    iframes.push(resolveUrl(base, m[1]));
  }
  const forms: { action: string; method: string }[] = [];
  const formRe = /<form\b([^>]*)>/gi;
  while ((m = formRe.exec(html)) && forms.length < 50) {
    const attrs = m[1];
    const a = attrs.match(/\baction=["']([^"']*)["']/i);
    const me = attrs.match(/\bmethod=["']([^"']*)["']/i);
    forms.push({
      action: a ? resolveUrl(base, a[1]) : base,
      method: (me ? me[1] : "GET").toUpperCase(),
    });
  }
  return { links, scripts, iframes, forms };
}

export const analyzeUrl = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { url: string; userAgent: string; followRedirects: boolean }) =>
      input,
  )
  .handler(async ({ data }): Promise<AnalyzeResult> => {
    const hops: RedirectHop[] = [];
    let current = data.url;
    try {
      // basic URL validation
      const u = new URL(current);
      if (!["http:", "https:"].includes(u.protocol)) {
        return { ok: false, error: "Solo protocolos http/https", hops };
      }
    } catch {
      return { ok: false, error: "URL inválida", hops };
    }

    const ua = data.userAgent;

    for (let i = 0; i < MAX_HOPS; i++) {
      const t0 = Date.now();
      let res: Response;
      try {
        res = await fetch(current, {
          method: "GET",
          redirect: "manual",
          headers: {
            ...(ua ? { "user-agent": ua } : {}),
            accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.9",
          },
        });
      } catch (e) {
        return {
          ok: false,
          error: `Error de red: ${(e as Error).message}`,
          hops,
        };
      }
      const dur = Date.now() - t0;
      const headers = headersToObject(res.headers);
      const setCookies: string[] = [];
      // collect set-cookie (Headers.getSetCookie may exist in some runtimes)
      const anyHeaders = res.headers as unknown as {
        getSetCookie?: () => string[];
      };
      if (typeof anyHeaders.getSetCookie === "function") {
        setCookies.push(...anyHeaders.getSetCookie());
      } else if (headers["set-cookie"]) {
        setCookies.push(headers["set-cookie"]);
      }

      const location = res.headers.get("location");
      hops.push({
        url: current,
        status: res.status,
        statusText: res.statusText,
        location: location ? resolveUrl(current, location) : null,
        headers,
        setCookies,
        durationMs: dur,
      });

      const isRedirect =
        res.status >= 300 && res.status < 400 && !!location;
      if (!isRedirect || !data.followRedirects) {
        // read body
        const ct = res.headers.get("content-type") || "";
        let html = "";
        let size = 0;
        if (ct.includes("text") || ct.includes("html") || ct.includes("xml") || ct.includes("json") || ct === "") {
          const reader = res.body?.getReader();
          if (reader) {
            const chunks: Uint8Array[] = [];
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
            const merged = new Uint8Array(size);
            let off = 0;
            for (const c of chunks) {
              merged.set(c, off);
              off += c.byteLength;
            }
            html = new TextDecoder("utf-8", { fatal: false }).decode(merged);
          }
        } else {
          // consume to free
          try {
            await res.arrayBuffer();
          } catch {
            /* ignore */
          }
        }

        const metadata = extractMeta(html, res.headers, current);
        const extracted = extractAll(html, current);
        return {
          ok: true,
          finalUrl: current,
          finalStatus: res.status,
          hops,
          metadata,
          ...extracted,
          htmlSize: size,
          htmlPreview: html.slice(0, 200_000),
        };
      }
      // follow
      current = resolveUrl(current, location);
    }

    return {
      ok: false,
      error: `Máximo de ${MAX_HOPS} redirecciones alcanzado`,
      hops,
    };
  });
