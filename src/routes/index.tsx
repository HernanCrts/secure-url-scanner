import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Shield, Globe, Loader2, AlertTriangle, ArrowRight, Eye, Code2, Link2, FileSearch, History as HistoryIcon, Trash2, ExternalLink, KeyRound, ShieldCheck, ShieldAlert, RefreshCw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { analyzeUrl, type AnalyzeResult } from "@/lib/analyze.functions";
import { checkVirusTotal, type VTResult } from "@/lib/virustotal.functions";
import { createHbSession, stopHbSession, type HBSession } from "@/lib/hyperbrowser.functions";
import { UA_PRESETS } from "@/lib/ua-presets";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "URLab — Analizador de URLs sospechosas" },
      {
        name: "description",
        content:
          "Inspecciona URLs sospechosas de forma segura: redirecciones, headers, metadatos y vista previa aislada con User Agent personalizable.",
      },
    ],
  }),
  component: Home,
});

const HISTORY_KEY = "urlab.history.v1";
const VT_KEY_STORAGE = "urlab.vt.apikey.v1";

type HistoryItem = {
  url: string;
  ua: string;
  at: number;
  finalStatus?: number;
  finalUrl?: string;
  hops: number;
};

function statusVariant(status?: number): { color: string; label: string } {
  if (!status) return { color: "bg-muted text-muted-foreground", label: "—" };
  if (status >= 200 && status < 300) return { color: "bg-primary/20 text-primary border-primary/40", label: String(status) };
  if (status >= 300 && status < 400) return { color: "bg-accent/20 text-accent border-accent/40", label: String(status) };
  if (status >= 400) return { color: "bg-destructive/20 text-destructive border-destructive/40", label: String(status) };
  return { color: "bg-muted text-muted-foreground", label: String(status) };
}

function Home() {
  const analyze = useServerFn(analyzeUrl);
  const vtCheck = useServerFn(checkVirusTotal);
  const hbStart = useServerFn(createHbSession);
  const hbStop = useServerFn(stopHbSession);
  const [url, setUrl] = useState("");
  const [uaPreset, setUaPreset] = useState(UA_PRESETS[0].value);
  const [uaCustom, setUaCustom] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [followRedirects, setFollowRedirects] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  // VirusTotal
  const [vtKey, setVtKey] = useState("");
  const [vtOpen, setVtOpen] = useState(false);
  const [vtResult, setVtResult] = useState<VTResult | null>(null);
  const [vtLoading, setVtLoading] = useState(false);

  // Hyperbrowser sandbox VM
  const [hbSession, setHbSession] = useState<HBSession | null>(null);
  const [hbLoading, setHbLoading] = useState(false);
  const [hbError, setHbError] = useState<string | null>(null);

  const effectiveUA = useCustom ? uaCustom : uaPreset;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
      const k = localStorage.getItem(VT_KEY_STORAGE);
      if (k) setVtKey(k);
    } catch { /* ignore */ }
  }, []);

  function saveVtKey(k: string) {
    setVtKey(k);
    try {
      if (k) localStorage.setItem(VT_KEY_STORAGE, k);
      else localStorage.removeItem(VT_KEY_STORAGE);
    } catch { /* ignore */ }
  }

  async function runVt(targetUrl: string, force = false) {
    if (!vtKey) return;
    setVtLoading(true);
    setVtResult(null);
    try {
      const r = await vtCheck({ data: { url: targetUrl, apiKey: vtKey, forceRescan: force } });
      setVtResult(r);
    } catch (err) {
      setVtResult({ ok: false, error: (err as Error).message });
    } finally {
      setVtLoading(false);
    }
  }

  function pushHistory(item: HistoryItem) {
    setHistory((prev) => {
      const next = [item, ...prev.filter((h) => h.url !== item.url)].slice(0, 30);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  async function onAnalyze(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setShowPreview(false);
    setResult(null);
    try {
      let normalized = url.trim();
      if (!/^https?:\/\//i.test(normalized)) normalized = "http://" + normalized;
      const r = await analyze({ data: { url: normalized, userAgent: effectiveUA, followRedirects } });
      setResult(r);
      setVtResult(null);
      if (r.ok) {
        pushHistory({
          url: normalized,
          ua: effectiveUA,
          at: Date.now(),
          finalStatus: r.finalStatus,
          finalUrl: r.finalUrl,
          hops: r.hops.length,
        });
        if (vtKey && r.finalUrl) {
          // disparar consulta a VT en background
          runVt(r.finalUrl);
        }
      }
    } catch (err) {
      setResult({ ok: false, error: (err as Error).message, hops: [] });
    } finally {
      setLoading(false);
    }
  }

  const previewSrc = useMemo(() => {
    if (!result?.ok || !result.finalUrl) return "";
    return `/api/proxy?ua=${encodeURIComponent(effectiveUA)}&url=${encodeURIComponent(result.finalUrl)}`;
  }, [result, effectiveUA]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-primary/15 border border-primary/30 grid place-items-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">URLab</h1>
              <p className="text-xs text-muted-foreground -mt-0.5">Sandbox para inspección de URLs sospechosas</p>
            </div>
          </div>
          <Badge variant="outline" className="border-primary/40 text-primary hidden sm:inline-flex">
            <span className="w-1.5 h-1.5 rounded-full bg-primary mr-2 animate-pulse" />
            Aislado en servidor
          </Badge>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <Card className="border-border/60 bg-card/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSearch className="w-4 h-4 text-primary" /> Analizar URL
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onAnalyze} className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Globe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://ejemplo-sospechoso.com/login"
                    className="pl-9 font-mono text-sm"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <Button type="submit" disabled={loading || !url.trim()} className="min-w-32">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Analizar <ArrowRight className="w-4 h-4 ml-1" /></>}
                </Button>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">User Agent</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Personalizado</span>
                      <Switch checked={useCustom} onCheckedChange={setUseCustom} />
                    </div>
                  </div>
                  {useCustom ? (
                    <Input
                      value={uaCustom}
                      onChange={(e) => setUaCustom(e.target.value)}
                      placeholder="Mi-UA/1.0 (...)"
                      className="font-mono text-xs"
                    />
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {UA_PRESETS.map((p) => (
                        <Button
                          key={p.label}
                          type="button"
                          variant={uaPreset === p.value ? "default" : "outline"}
                          size="sm"
                          className="justify-start truncate text-xs"
                          onClick={() => setUaPreset(p.value)}
                          title={p.label}
                        >
                          {p.label}
                        </Button>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground font-mono truncate">{effectiveUA || "(sin User-Agent)"}</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Opciones</Label>
                  <div className="flex items-center justify-between rounded-md border border-border bg-input/40 px-3 py-2">
                    <div>
                      <div className="text-sm">Seguir redirecciones</div>
                      <div className="text-xs text-muted-foreground">Trazar toda la cadena 3xx</div>
                    </div>
                    <Switch checked={followRedirects} onCheckedChange={setFollowRedirects} />
                  </div>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        <Collapsible open={vtOpen} onOpenChange={setVtOpen}>
          <Card className={`border-border/60 ${vtKey ? "bg-card/60" : "bg-card/40"}`}>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-card/30 transition-colors rounded-t-xl">
                <div className="flex items-center gap-3">
                  <KeyRound className="w-4 h-4 text-primary" />
                  <div>
                    <div className="text-sm font-medium">Integración con VirusTotal</div>
                    <div className="text-xs text-muted-foreground">
                      {vtKey ? "API key configurada — se consultará automáticamente" : "Opcional · pega tu API key para revisar reputación"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {vtKey && (
                    <Badge variant="outline" className="border-primary/40 text-primary">
                      <ShieldCheck className="w-3 h-3 mr-1" />Activo
                    </Badge>
                  )}
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${vtOpen ? "rotate-180" : ""}`} />
                </div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-3">
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={vtKey}
                    onChange={(e) => saveVtKey(e.target.value.trim())}
                    placeholder="API key de VirusTotal (64 caracteres)"
                    className="font-mono text-xs"
                    autoComplete="off"
                  />
                  {vtKey && (
                    <Button variant="outline" onClick={() => saveVtKey("")}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Se guarda solo en tu navegador (localStorage). Cada análisis se enviará a VirusTotal usando esta key.
                  Consíguela gratis en{" "}
                  <a href="https://www.virustotal.com/gui/my-apikey" target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    virustotal.com/gui/my-apikey
                  </a>.
                </p>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {result && !result.ok && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="py-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <div>
                <div className="font-medium">No se pudo analizar la URL</div>
                <div className="text-sm text-muted-foreground">{result.error}</div>
              </div>
            </CardContent>
          </Card>
        )}

        {result?.ok && (
          <ResultsView
            result={result}
            previewSrc={previewSrc}
            showPreview={showPreview}
            setShowPreview={setShowPreview}
            vtEnabled={!!vtKey}
            vtResult={vtResult}
            vtLoading={vtLoading}
            onVtRescan={() => result.finalUrl && runVt(result.finalUrl, true)}
          />
        )}

        <Card className="border-border/60 bg-card/40">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <HistoryIcon className="w-4 h-4 text-primary" /> Historial (local)
            </CardTitle>
            {history.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => { setHistory([]); localStorage.removeItem(HISTORY_KEY); }}>
                <Trash2 className="w-4 h-4 mr-1" /> Limpiar
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin análisis previos.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {history.map((h) => {
                  const v = statusVariant(h.finalStatus);
                  return (
                    <li key={h.at} className="py-2 flex items-center gap-3 text-sm">
                      <Badge variant="outline" className={`font-mono ${v.color}`}>{v.label}</Badge>
                      <span className="text-xs text-muted-foreground">{h.hops} hop{h.hops !== 1 ? "s" : ""}</span>
                      <button
                        className="font-mono text-xs truncate flex-1 text-left hover:text-primary"
                        onClick={() => { setUrl(h.url); }}
                        title={h.url}
                      >
                        {h.url}
                      </button>
                      <span className="text-[10px] text-muted-foreground hidden sm:inline">
                        {new Date(h.at).toLocaleString()}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center pt-4">
          Las peticiones salen desde el servidor de URLab, no desde tu equipo. La vista previa se ejecuta dentro de un iframe sandboxed.
        </p>
      </main>
    </div>
  );
}

function ResultsView({
  result,
  previewSrc,
  showPreview,
  setShowPreview,
  vtEnabled,
  vtResult,
  vtLoading,
  onVtRescan,
}: {
  result: AnalyzeResult;
  previewSrc: string;
  showPreview: boolean;
  setShowPreview: (b: boolean) => void;
  vtEnabled: boolean;
  vtResult: VTResult | null;
  vtLoading: boolean;
  onVtRescan: () => void;
}) {
  const final = statusVariant(result.finalStatus);
  const malicious = vtResult?.ok ? (vtResult.stats?.malicious ?? 0) : 0;
  const suspicious = vtResult?.ok ? (vtResult.stats?.suspicious ?? 0) : 0;
  return (
    <div className="space-y-6">
      <Card className="border-border/60">
        <CardContent className="py-4 grid sm:grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Status final</div>
            <div className="text-2xl font-semibold mt-1">
              <Badge variant="outline" className={`font-mono text-base px-2 py-1 ${final.color}`}>{final.label}</Badge>
            </div>
          </div>
          <div className="sm:col-span-2 min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">URL final</div>
            <div className="font-mono text-sm break-all mt-2">{result.finalUrl}</div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="redirects">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="redirects"><Link2 className="w-3.5 h-3.5 mr-1.5" />Redirecciones ({result.hops.length})</TabsTrigger>
          <TabsTrigger value="headers">Headers</TabsTrigger>
          <TabsTrigger value="meta">Metadatos</TabsTrigger>
          <TabsTrigger value="resources">Recursos</TabsTrigger>
          <TabsTrigger value="html"><Code2 className="w-3.5 h-3.5 mr-1.5" />HTML</TabsTrigger>
          <TabsTrigger value="preview"><Eye className="w-3.5 h-3.5 mr-1.5" />Vista previa</TabsTrigger>
          {vtEnabled && (
            <TabsTrigger value="vt">
              {malicious > 0 ? <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-destructive" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-primary" />}
              VirusTotal{vtResult?.ok ? ` (${malicious + suspicious}/${vtResult.totalEngines})` : ""}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="redirects" className="mt-4">
          <Card><CardContent className="py-4">
            <ol className="space-y-2">
              {result.hops.map((h, i) => {
                const v = statusVariant(h.status);
                return (
                  <li key={i} className="flex items-start gap-3 p-2 rounded-md border border-border/60 bg-card/40">
                    <span className="text-xs text-muted-foreground font-mono mt-1">{i + 1}</span>
                    <Badge variant="outline" className={`font-mono ${v.color}`}>{v.label}</Badge>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs break-all">{h.url}</div>
                      {h.location && (
                        <div className="text-xs text-muted-foreground mt-1 break-all">
                          → {h.location}
                        </div>
                      )}
                      {h.setCookies.length > 0 && (
                        <div className="text-[10px] text-accent mt-1">{h.setCookies.length} cookie(s) seteada(s)</div>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{h.durationMs}ms</span>
                  </li>
                );
              })}
            </ol>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="headers" className="mt-4">
          <Card><CardContent className="py-4 space-y-4">
            {result.hops.map((h, i) => (
              <div key={i}>
                <div className="text-xs text-muted-foreground mb-2 font-mono">#{i + 1} · {h.status} · {h.url}</div>
                <div className="rounded-md border border-border/60 bg-input/30 p-3 font-mono text-xs space-y-1">
                  {Object.entries(h.headers).map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[180px_1fr] gap-2">
                      <span className="text-primary">{k}</span>
                      <span className="break-all text-foreground/80">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="meta" className="mt-4">
          <Card><CardContent className="py-4">
            {result.metadata && (
              <dl className="grid sm:grid-cols-2 gap-3 text-sm">
                {Object.entries(result.metadata).map(([k, v]) => (
                  <div key={k} className="rounded-md border border-border/60 p-3 bg-card/40">
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                    <dd className="font-mono text-xs mt-1 break-all">{v ?? <span className="text-muted-foreground">—</span>}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="resources" className="mt-4">
          <Card><CardContent className="py-4 space-y-4">
            <ResourceList title="Enlaces" items={(result.links ?? []).map((l) => `${l.text || "(sin texto)"} → ${l.href}`)} />
            <ResourceList title="Scripts externos" items={result.scripts ?? []} />
            <ResourceList title="Iframes" items={result.iframes ?? []} />
            <ResourceList title="Formularios" items={(result.forms ?? []).map((f) => `${f.method} ${f.action}`)} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="html" className="mt-4">
          <Card><CardContent className="py-4">
            <div className="text-xs text-muted-foreground mb-2">{(result.htmlSize ?? 0).toLocaleString()} bytes</div>
            <ScrollArea className="h-[500px] rounded-md border border-border/60 bg-input/30">
              <pre className="text-xs p-3 font-mono whitespace-pre-wrap break-all">{result.htmlPreview}</pre>
            </ScrollArea>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Eye className="w-4 h-4 text-primary" />Vista renderizada (sandbox)</CardTitle>
                <a
                  href={previewSrc}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-accent hover:underline inline-flex items-center gap-1"
                >
                  Abrir aislado <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </CardHeader>
            <CardContent>
              {!showPreview ? (
                <div className="rounded-md border border-warning/40 bg-warning/5 p-6 text-center space-y-3">
                  <AlertTriangle className="w-6 h-6 text-warning mx-auto" />
                  <p className="text-sm">
                    La vista previa renderiza la página dentro de un iframe sandboxed. Aunque está aislada del resto de la app,
                    el contenido sigue ejecutándose en tu navegador.
                  </p>
                  <Button onClick={() => setShowPreview(true)} variant="default">
                    Cargar vista previa
                  </Button>
                </div>
              ) : (
                <iframe
                  src={previewSrc}
                  sandbox="allow-forms allow-popups allow-scripts allow-same-origin"
                  className="w-full h-[700px] rounded-md border border-border bg-background"
                  title="Vista previa aislada"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {vtEnabled && (
          <TabsContent value="vt" className="mt-4">
            <VirusTotalPanel result={vtResult} loading={vtLoading} onRescan={onVtRescan} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function ResourceList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{title} ({items.length})</div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground">Ninguno</div>
      ) : (
        <ScrollArea className="max-h-48 rounded-md border border-border/60 bg-input/30">
          <ul className="p-2 space-y-1 font-mono text-xs">
            {items.map((it, i) => (
              <li key={i} className="break-all">{it}</li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}

function VirusTotalPanel({
  result,
  loading,
  onRescan,
}: {
  result: VTResult | null;
  loading: boolean;
  onRescan: () => void;
}) {
  if (loading) {
    return (
      <Card><CardContent className="py-10 flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="text-sm">Consultando VirusTotal…</p>
      </CardContent></Card>
    );
  }
  if (!result) {
    return (
      <Card><CardContent className="py-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Aún no se ha consultado esta URL.</p>
        <Button variant="outline" size="sm" onClick={onRescan}>
          <RefreshCw className="w-4 h-4 mr-1.5" />Consultar ahora
        </Button>
      </CardContent></Card>
    );
  }
  if (!result.ok) {
    return (
      <Card className="border-destructive/40 bg-destructive/5"><CardContent className="py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          <div>
            <div className="font-medium">VirusTotal devolvió un error</div>
            <div className="text-sm text-muted-foreground">{result.error}</div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onRescan}>
          <RefreshCw className="w-4 h-4 mr-1.5" />Reintentar
        </Button>
      </CardContent></Card>
    );
  }

  const s = result.stats ?? { harmless: 0, malicious: 0, suspicious: 0, undetected: 0, timeout: 0 };
  const total = result.totalEngines ?? 0;
  const verdict =
    s.malicious > 0 ? { label: "Malicioso", color: "bg-destructive/20 text-destructive border-destructive/40", icon: ShieldAlert }
    : s.suspicious > 0 ? { label: "Sospechoso", color: "bg-warning/20 text-warning-foreground border-warning/40", icon: ShieldAlert }
    : { label: "Limpio", color: "bg-primary/20 text-primary border-primary/40", icon: ShieldCheck };
  const Icon = verdict.icon;

  return (
    <Card>
      <CardContent className="py-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={`${verdict.color} text-sm py-1.5 px-3`}>
              <Icon className="w-4 h-4 mr-1.5" />{verdict.label}
            </Badge>
            <div className="text-sm text-muted-foreground">
              {s.malicious + s.suspicious}/{total} motores marcaron esta URL
            </div>
          </div>
          <div className="flex items-center gap-2">
            {result.permalink && (
              <a href={result.permalink} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline inline-flex items-center gap-1">
                Ver en VirusTotal <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <Button variant="outline" size="sm" onClick={onRescan}>
              <RefreshCw className="w-4 h-4 mr-1.5" />Reescanear
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Stat label="Maliciosos" value={s.malicious} tone={s.malicious > 0 ? "destructive" : "muted"} />
          <Stat label="Sospechosos" value={s.suspicious} tone={s.suspicious > 0 ? "warning" : "muted"} />
          <Stat label="Limpios" value={s.harmless} tone="primary" />
          <Stat label="Sin detectar" value={s.undetected} tone="muted" />
          <Stat label="Timeout" value={s.timeout} tone="muted" />
        </div>

        {result.scannedAt && (
          <p className="text-xs text-muted-foreground">
            Último análisis: {new Date(result.scannedAt * 1000).toLocaleString()}{result.fresh ? " (recién escaneado)" : ""}
          </p>
        )}

        {result.flaggedBy && result.flaggedBy.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Motores que han marcado la URL ({result.flaggedBy.length})
            </div>
            <ScrollArea className="max-h-72 rounded-md border border-border/60 bg-input/30">
              <ul className="p-2 space-y-1 text-xs font-mono">
                {result.flaggedBy.map((f, i) => (
                  <li key={i} className="grid grid-cols-[160px_100px_1fr] gap-2 px-2 py-1 rounded hover:bg-card/40">
                    <span className="text-foreground/90 truncate">{f.engine}</span>
                    <Badge variant="outline" className={f.category === "malicious" ? "border-destructive/40 text-destructive" : "border-warning/40 text-foreground/80"}>
                      {f.category}
                    </Badge>
                    <span className="text-muted-foreground truncate">{f.result}</span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "destructive" | "warning" | "primary" | "muted" }) {
  const toneClass =
    tone === "destructive" ? "text-destructive border-destructive/40 bg-destructive/10"
    : tone === "warning" ? "text-foreground border-warning/40 bg-warning/10"
    : tone === "primary" ? "text-primary border-primary/40 bg-primary/10"
    : "text-muted-foreground border-border bg-input/30";
  return (
    <div className={`rounded-md border px-3 py-2 ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-xl font-semibold mt-0.5">{value}</div>
    </div>
  );
}
