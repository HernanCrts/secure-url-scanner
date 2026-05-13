// Parser local de cabeceras de correo. Sin red.

export type ParsedHeaders = {
  raw: { name: string; value: string }[];
  from: string | null;
  to: string | null;
  subject: string | null;
  replyTo: string | null;
  returnPath: string | null;
  messageId: string | null;
  date: string | null;
  authResults: {
    spf: string | null;
    dkim: string | null;
    dmarc: string | null;
    raw: string | null;
  };
  received: ReceivedHop[];
  xOriginatingIp: string | null;
  list: { id: string | null; unsubscribe: string | null };
  warnings: string[];
};

export type ReceivedHop = {
  index: number;
  raw: string;
  from: string | null;
  by: string | null;
  with: string | null;
  date: string | null;
  ip: string | null;
  deltaMs: number | null;
};

function unfold(text: string): { name: string; value: string }[] {
  // Separa cabeceras del cuerpo (primer línea en blanco)
  const headerBlock = text.split(/\r?\n\r?\n/)[0] ?? text;
  const lines = headerBlock.split(/\r?\n/);
  const out: { name: string; value: string }[] = [];
  for (const line of lines) {
    if (/^[ \t]/.test(line) && out.length) {
      out[out.length - 1].value += " " + line.trim();
    } else {
      const m = line.match(/^([A-Za-z0-9-]+):\s?(.*)$/);
      if (m) out.push({ name: m[1], value: m[2] });
    }
  }
  return out;
}

function pick(headers: { name: string; value: string }[], name: string): string | null {
  const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value.trim() : null;
}

function pickAll(headers: { name: string; value: string }[], name: string): string[] {
  return headers.filter((x) => x.name.toLowerCase() === name.toLowerCase()).map((x) => x.value);
}

function extractAuth(value: string | null) {
  if (!value) return { spf: null, dkim: null, dmarc: null, raw: null };
  const find = (k: string) => {
    const m = value.match(new RegExp(`${k}=([a-z]+)`, "i"));
    return m ? m[1] : null;
  };
  return { spf: find("spf"), dkim: find("dkim"), dmarc: find("dmarc"), raw: value };
}

function parseReceived(raw: string, idx: number): ReceivedHop {
  const from = raw.match(/from\s+([^\s;()]+)/i)?.[1] ?? null;
  const by = raw.match(/by\s+([^\s;()]+)/i)?.[1] ?? null;
  const wth = raw.match(/with\s+([^\s;()]+)/i)?.[1] ?? null;
  const ip = raw.match(/\[?((?:[0-9]{1,3}\.){3}[0-9]{1,3}|[0-9a-fA-F:]{2,})\]?/)?.[1] ?? null;
  // fecha tras último ';'
  const semi = raw.lastIndexOf(";");
  const date = semi >= 0 ? raw.slice(semi + 1).trim() : null;
  return { index: idx, raw, from, by, with: wth, date, ip, deltaMs: null };
}

export function parseEmailHeaders(text: string): ParsedHeaders {
  const headers = unfold(text);
  const auth = extractAuth(pick(headers, "Authentication-Results"));
  const recRaw = pickAll(headers, "Received");
  // Received está en orden inverso (último salto primero) — lo invertimos para mostrarlo cronológico
  const received = recRaw.slice().reverse().map((r, i) => parseReceived(r, i + 1));
  // delta entre saltos
  for (let i = 1; i < received.length; i++) {
    const a = received[i - 1].date ? Date.parse(received[i - 1].date!) : NaN;
    const b = received[i].date ? Date.parse(received[i].date!) : NaN;
    received[i].deltaMs = isNaN(a) || isNaN(b) ? null : b - a;
  }

  const from = pick(headers, "From");
  const returnPath = pick(headers, "Return-Path");
  const warnings: string[] = [];
  if (from && returnPath) {
    const a = from.match(/<([^>]+)>/)?.[1]?.toLowerCase() || from.toLowerCase();
    const b = returnPath.replace(/[<>]/g, "").toLowerCase();
    const da = a.split("@").pop();
    const db = b.split("@").pop();
    if (da && db && da !== db) warnings.push(`Dominio de From (${da}) ≠ Return-Path (${db})`);
  }
  if (auth.spf && auth.spf.toLowerCase() === "fail") warnings.push("SPF: fail");
  if (auth.dkim && auth.dkim.toLowerCase() === "fail") warnings.push("DKIM: fail");
  if (auth.dmarc && auth.dmarc.toLowerCase() === "fail") warnings.push("DMARC: fail");

  return {
    raw: headers,
    from,
    to: pick(headers, "To"),
    subject: pick(headers, "Subject"),
    replyTo: pick(headers, "Reply-To"),
    returnPath,
    messageId: pick(headers, "Message-ID"),
    date: pick(headers, "Date"),
    authResults: auth,
    received,
    xOriginatingIp: pick(headers, "X-Originating-IP"),
    list: { id: pick(headers, "List-ID"), unsubscribe: pick(headers, "List-Unsubscribe") },
    warnings,
  };
}
