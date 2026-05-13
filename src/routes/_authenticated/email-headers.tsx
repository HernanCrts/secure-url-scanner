import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Mail, AlertTriangle, ShieldCheck, ChevronDown } from "lucide-react";
import { parseEmailHeaders, type ParsedHeaders } from "@/lib/email-headers";
import { recordSearch } from "@/lib/history.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export const Route = createFileRoute("/_authenticated/email-headers")({
  head: () => ({ meta: [{ title: "Cabeceras de email — URLab" }] }),
  component: EmailHeadersPage,
});

function authBadge(v: string | null) {
  if (!v) return <Badge variant="outline">—</Badge>;
  const c = v.toLowerCase();
  const cls =
    c === "pass" ? "bg-primary/15 text-primary border-primary/40" :
    c === "fail" ? "bg-destructive/15 text-destructive border-destructive/40" :
    "bg-accent/15 text-accent border-accent/40";
  return <Badge variant="outline" className={cls}>{v}</Badge>;
}

function EmailHeadersPage() {
  const record = useServerFn(recordSearch);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedHeaders | null>(null);
  const [showAll, setShowAll] = useState(false);

  function onAnalyze() {
    const p = parseEmailHeaders(text);
    setParsed(p);
    try {
      record({ data: { kind: "email_headers", input: (p.subject || p.messageId || "headers").slice(0, 200), result: p } });
    } catch { /* ignore */ }
  }

  const totalDelta = useMemo(() => {
    if (!parsed?.received.length) return null;
    const first = parsed.received[0]?.date ? Date.parse(parsed.received[0].date!) : NaN;
    const last = parsed.received.at(-1)?.date ? Date.parse(parsed.received.at(-1)!.date!) : NaN;
    if (isNaN(first) || isNaN(last)) return null;
    return last - first;
  }, [parsed]);

  return (
    <div className="space-y-4">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="w-4 h-4 text-primary" /> Análisis de cabeceras de email
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Pega aquí el bloque crudo de cabeceras (Received:, From:, Authentication-Results:, ...)"
            className="font-mono text-xs min-h-[200px]"
          />
          <div className="flex justify-end">
            <Button onClick={onAnalyze} disabled={!text.trim()}>Analizar</Button>
          </div>
        </CardContent>
      </Card>

      {parsed && (
        <>
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="border-border/60">
              <CardHeader><CardTitle className="text-sm">Resumen</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <KV k="From" v={parsed.from} mono />
                <KV k="Reply-To" v={parsed.replyTo} mono />
                <KV k="Return-Path" v={parsed.returnPath} mono />
                <KV k="To" v={parsed.to} mono />
                <KV k="Subject" v={parsed.subject} />
                <KV k="Date" v={parsed.date} />
                <KV k="Message-ID" v={parsed.messageId} mono />
                <KV k="X-Originating-IP" v={parsed.xOriginatingIp} mono />
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardHeader><CardTitle className="text-sm">Autenticación</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between"><span>SPF</span>{authBadge(parsed.authResults.spf)}</div>
                <div className="flex items-center justify-between"><span>DKIM</span>{authBadge(parsed.authResults.dkim)}</div>
                <div className="flex items-center justify-between"><span>DMARC</span>{authBadge(parsed.authResults.dmarc)}</div>
                {parsed.authResults.raw && (
                  <p className="text-[10px] font-mono text-muted-foreground break-all border-t border-border/40 pt-2">{parsed.authResults.raw}</p>
                )}
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  {parsed.warnings.length
                    ? <><AlertTriangle className="w-4 h-4 text-destructive" /> Avisos</>
                    : <><ShieldCheck className="w-4 h-4 text-primary" /> Sin avisos</>}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                {parsed.warnings.length === 0 && <p className="text-muted-foreground">No se detectaron mismatches obvios.</p>}
                {parsed.warnings.map((w, i) => <p key={i} className="text-destructive">⚠ {w}</p>)}
                {totalDelta !== null && (
                  <p className="text-muted-foreground pt-2">Tiempo total entrega: {(totalDelta / 1000).toFixed(1)}s</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-sm">Cadena Received ({parsed.received.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {parsed.received.map((h) => (
                  <div key={h.index} className="rounded-md border border-border/60 bg-card/40 p-3 text-xs">
                    <div className="flex flex-wrap gap-2 items-center">
                      <Badge variant="outline">#{h.index}</Badge>
                      {h.ip && (
                        <Link to="/ip" className="font-mono text-primary hover:underline" search={{} as never}>
                          {h.ip}
                        </Link>
                      )}
                      <span className="text-muted-foreground">{h.from && `from ${h.from}`} {h.by && `→ ${h.by}`}</span>
                      {h.with && <Badge variant="outline" className="text-[10px]">{h.with}</Badge>}
                      <span className="ml-auto text-muted-foreground">{h.date}</span>
                      {h.deltaMs !== null && <Badge variant="outline" className="text-[10px]">+{(h.deltaMs / 1000).toFixed(1)}s</Badge>}
                    </div>
                    <p className="font-mono text-[10px] text-muted-foreground mt-1 break-all">{h.raw}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Collapsible open={showAll} onOpenChange={setShowAll}>
            <Card className="border-border/60">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer">
                  <CardTitle className="text-sm flex items-center justify-between">
                    Todas las cabeceras ({parsed.raw.length})
                    <ChevronDown className={`w-4 h-4 transition ${showAll ? "rotate-180" : ""}`} />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  <div className="space-y-1 text-xs font-mono">
                    {parsed.raw.map((h, i) => (
                      <div key={i} className="flex gap-2 border-b border-border/30 py-1">
                        <span className="text-primary shrink-0 min-w-[180px]">{h.name}:</span>
                        <span className="break-all">{h.value}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </>
      )}
    </div>
  );
}

function KV({ k, v, mono }: { k: string; v: string | null; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className={mono ? "font-mono text-xs break-all" : "text-sm"}>{v ?? "—"}</div>
    </div>
  );
}
