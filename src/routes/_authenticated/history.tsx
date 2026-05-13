import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Trash2, Search, Globe, Network, Mail } from "lucide-react";
import { listHistory, deleteHistoryItem, type HistoryRow } from "@/lib/history.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "Historial — URLab" }] }),
  component: HistoryPage,
});

const KIND_LABEL: Record<HistoryRow["kind"], { label: string; icon: typeof Globe }> = {
  url: { label: "URL", icon: Globe },
  ip: { label: "IP", icon: Network },
  email_headers: { label: "Cabeceras", icon: Mail },
};

function HistoryPage() {
  const list = useServerFn(listHistory);
  const del = useServerFn(deleteHistoryItem);
  const qc = useQueryClient();
  const [kind, setKind] = useState<"all" | HistoryRow["kind"]>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["history", kind, search],
    queryFn: () => list({ data: { kind, search: search || undefined, limit: 200 } }),
  });

  return (
    <div className="space-y-4">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Historial de búsquedas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Tabs value={kind} onValueChange={(v) => setKind(v as never)}>
              <TabsList>
                <TabsTrigger value="all">Todas</TabsTrigger>
                <TabsTrigger value="url">URL</TabsTrigger>
                <TabsTrigger value="ip">IP</TabsTrigger>
                <TabsTrigger value="email_headers">Cabeceras</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar en entradas…"
                className="pl-9"
              />
            </div>
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
            </div>
          )}
          {data?.ok === false && <p className="text-sm text-destructive">{data.error}</p>}

          <div className="space-y-2">
            {(data?.rows ?? []).map((r) => {
              const K = KIND_LABEL[r.kind];
              return (
                <div key={r.id} className="rounded-md border border-border/60 bg-card/40 p-3 flex items-start gap-3">
                  <div className="w-8 h-8 rounded bg-primary/10 grid place-items-center shrink-0">
                    <K.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{K.label}</Badge>
                      {r.email && <span className="text-xs text-muted-foreground">{r.email}</span>}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(r.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm font-mono break-all mt-1">{r.input}</div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      await del({ data: { id: r.id } });
                      qc.invalidateQueries({ queryKey: ["history"] });
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
            {data?.rows?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Sin resultados.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
