import { createServerFn } from "@tanstack/react-start";

export type VTResult = {
  ok: boolean;
  error?: string;
  url?: string;
  scannedAt?: number | null;
  reputation?: number | null;
  stats?: {
    harmless: number;
    malicious: number;
    suspicious: number;
    undetected: number;
    timeout: number;
  } | null;
  totalEngines?: number;
  flaggedBy?: { engine: string; category: string; result: string }[];
  permalink?: string;
  fresh?: boolean; // true si tuvimos que reescanear
};

const VT_API = "https://www.virustotal.com/api/v3";

function base64UrlNoPad(input: string): string {
  // btoa works on latin-1; URLs are ASCII generally
  const b64 = btoa(unescape(encodeURIComponent(input)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type VTAttrs = {
  last_analysis_date?: number;
  reputation?: number;
  last_analysis_stats?: {
    harmless: number;
    malicious: number;
    suspicious: number;
    undetected: number;
    timeout: number;
  };
  last_analysis_results?: Record<
    string,
    { category: string; result: string; engine_name: string }
  >;
  url?: string;
};

function buildResult(
  attrs: VTAttrs,
  finalUrl: string,
  fresh: boolean,
): VTResult {
  const stats = attrs.last_analysis_stats ?? null;
  const total = stats
    ? stats.harmless + stats.malicious + stats.suspicious + stats.undetected + stats.timeout
    : 0;
  const flagged: VTResult["flaggedBy"] = [];
  if (attrs.last_analysis_results) {
    for (const [engine, r] of Object.entries(attrs.last_analysis_results)) {
      if (r.category === "malicious" || r.category === "suspicious") {
        flagged.push({ engine, category: r.category, result: r.result });
      }
    }
  }
  return {
    ok: true,
    url: attrs.url ?? finalUrl,
    scannedAt: attrs.last_analysis_date ?? null,
    reputation: attrs.reputation ?? null,
    stats,
    totalEngines: total,
    flaggedBy: flagged,
    permalink: `https://www.virustotal.com/gui/url/${base64UrlNoPad(finalUrl)}`,
    fresh,
  };
}

export const checkVirusTotal = createServerFn({ method: "POST" })
  .inputValidator((input: { url: string; apiKey: string; forceRescan?: boolean }) => input)
  .handler(async ({ data }): Promise<VTResult> => {
    if (!data.apiKey || data.apiKey.length < 32) {
      return { ok: false, error: "API key inválida" };
    }
    let target: URL;
    try {
      target = new URL(data.url);
      if (!["http:", "https:"].includes(target.protocol)) {
        return { ok: false, error: "Solo URLs http/https" };
      }
    } catch {
      return { ok: false, error: "URL inválida" };
    }

    const headers = { "x-apikey": data.apiKey };
    const urlId = base64UrlNoPad(data.url);

    // 1) Lookup existente (no consume cuota de scan)
    if (!data.forceRescan) {
      const r = await fetch(`${VT_API}/urls/${urlId}`, { headers });
      if (r.status === 200) {
        const j = (await r.json()) as { data: { attributes: VTAttrs } };
        return buildResult(j.data.attributes, data.url, false);
      }
      if (r.status === 401) {
        return { ok: false, error: "API key rechazada (401)" };
      }
      if (r.status !== 404) {
        const txt = await r.text();
        return { ok: false, error: `VirusTotal error ${r.status}: ${txt.slice(0, 200)}` };
      }
    }

    // 2) Submit para análisis nuevo
    const submit = await fetch(`${VT_API}/urls`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/x-www-form-urlencoded" },
      body: `url=${encodeURIComponent(data.url)}`,
    });
    if (!submit.ok) {
      const txt = await submit.text();
      return { ok: false, error: `Submit falló ${submit.status}: ${txt.slice(0, 200)}` };
    }
    const submitJson = (await submit.json()) as { data: { id: string } };
    const analysisId = submitJson.data.id;

    // 3) Poll hasta 20s
    const start = Date.now();
    while (Date.now() - start < 20_000) {
      await new Promise((r) => setTimeout(r, 2500));
      const a = await fetch(`${VT_API}/analyses/${analysisId}`, { headers });
      if (!a.ok) continue;
      const aj = (await a.json()) as {
        data: { attributes: { status: string } };
        meta?: { url_info?: { url: string; id: string } };
      };
      if (aj.data.attributes.status === "completed") {
        // re-fetch URL object para stats agregadas
        const final = await fetch(`${VT_API}/urls/${urlId}`, { headers });
        if (final.ok) {
          const fj = (await final.json()) as { data: { attributes: VTAttrs } };
          return buildResult(fj.data.attributes, data.url, true);
        }
      }
    }
    return {
      ok: false,
      error: "Análisis encolado en VirusTotal pero no completado en 20s. Reintenta en unos segundos.",
    };
  });
