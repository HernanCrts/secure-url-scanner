import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Network, AlertTriangle, ShieldCheck } from "lucide-react";
import { checkAbuseIp, ABUSE_CATEGORIES, type AbuseResult } from "@/lib/abuseipdb.functions";
import { recordSearch } from "@/lib/history.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/_authenticated/ip")({
  head: () => ({ meta: [{ title: "Reputación de IP — URLab" }] }),
  component: IpPage,
});

function scoreColor(s: number) {
  if (s >= 75) return "text-destructive border-destructive/40 bg-destructive/10";
  if (s >= 25) return "text-accent border-accent/40 bg-accent/10";
  return "text-primary border-primary/40 bg-primary/10";
}

function IpPage() {
  const check = useServerFn(checkAbuseIp);
  const record = useServerFn(recordSearch);
  const [ip, setIp] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<AbuseResult | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ip.trim()) return;
    setLoading(true); setRes(null);
    try {
      const r = await check({ data: { ip: ip.trim() } });
      setRes(r);
      if (r.ok) {
        try { await record({ data: { kind: "ip", input: ip.trim(), result: r } }); } catch { /* ignore */ }
      }
    } catch (e) {
      setRes({ ok: false, error: (e as Error).message });
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Network className="w-4 h-4 text-primary" /> Reputación de IP (AbuseIPDB)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex gap-2">
            <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="8.8.8.8 o 2001:db8::1" className="font-mono" />
            <Button type="submit" disabled={loading || !ip.trim()}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Comprobar"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {res && !res.ok && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6"><p className="text-sm text-destructive">{res.error}</p></CardContent>
        </Card>
      )}

      {res?.ok && (
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="md:col-span-1 border-border/60">
            <CardHeader>
              <CardTitle className="text-sm">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className={`rounded-md border px-3 py-2 ${scoreColor(res.abuseConfidenceScore ?? 0)}`}>
                <div className="text-xs uppercase tracking-wide opacity-80">Confianza de abuso</div>
                <div className="text-2xl font-bold">{res.abuseConfidenceScore}%</div>
              </div>
              <Field label="IP" value={res.ipAddress} mono />
              <Field label="País" value={res.countryName ? `${res.countryName} (${res.countryCode})` : res.countryCode} />
              <Field label="ISP" value={res.isp} />
              <Field label="Dominio" value={res.domain} mono />
              <Field label="Uso" value={res.usageType} />
              <Field label="Hostnames" value={res.hostnames?.join(", ") || "—"} mono />
              <Field label="Tor" value={res.isTor ? "Sí" : "No"} />
              <Field label="Whitelisted" value={res.isWhitelisted ? "Sí" : "No"} />
              <Field label="Reportes" value={`${res.totalReports} (${res.numDistinctUsers} usuarios)`} />
              <Field label="Último reporte" value={res.lastReportedAt ? new Date(res.lastReportedAt).toLocaleString() : "—"} />
            </CardContent>
          </Card>

          <Card className="md:col-span-2 border-border/60">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                {(res.totalReports ?? 0) > 0
                  ? <><AlertTriangle className="w-4 h-4 text-destructive" /> Reportes ({res.reports?.length ?? 0})</>
                  : <><ShieldCheck className="w-4 h-4 text-primary" /> Sin reportes</>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[480px]">
                <div className="space-y-3">
                  {(res.reports ?? []).map((r, i) => (
                    <div key={i} className="rounded-md border border-border/60 bg-card/40 p-3">
                      <div className="flex flex-wrap gap-1 mb-1">
                        {r.categories.map((c) => (
                          <Badge key={c} variant="outline" className="text-[10px]">
                            {ABUSE_CATEGORIES[c] ?? `Cat ${c}`}
                          </Badge>
                        ))}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {new Date(r.reportedAt).toLocaleString()} · {r.reporterCountryCode ?? "??"}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap break-words">{r.comment || <span className="text-muted-foreground">(sin comentario)</span>}</p>
                    </div>
                  ))}
                  {(res.reports?.length ?? 0) === 0 && (
                    <p className="text-sm text-muted-foreground">Esta IP no tiene reportes en los últimos 90 días.</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono text-xs break-all" : "text-sm"}>{value ?? "—"}</div>
    </div>
  );
}
