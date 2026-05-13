import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { listUsers, setAdminRole } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — URLab" }] }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) throw redirect({ to: "/login" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", s.session.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!data) throw redirect({ to: "/" });
  },
  component: AdminPage,
});

function AdminPage() {
  const list = useServerFn(listUsers);
  const setRole = useServerFn(setAdminRole);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => list({ data: undefined as never }),
  });

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="w-4 h-4 text-accent" /> Panel de administración
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
          </div>
        )}
        {data?.ok === false && <p className="text-sm text-destructive">{data.error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border/60">
                <th className="py-2 px-2">Email</th>
                <th className="px-2">Nombre</th>
                <th className="px-2">Búsquedas</th>
                <th className="px-2">Última</th>
                <th className="px-2">Alta</th>
                <th className="px-2">Admin</th>
              </tr>
            </thead>
            <tbody>
              {(data?.users ?? []).map((u) => (
                <tr key={u.id} className="border-b border-border/30">
                  <td className="py-2 px-2 font-mono text-xs">{u.email}</td>
                  <td className="px-2">{u.display_name}</td>
                  <td className="px-2">
                    <Badge variant="outline">{u.searches}</Badge>
                  </td>
                  <td className="px-2 text-xs text-muted-foreground">
                    {u.last_search_at ? new Date(u.last_search_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-2 text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-2">
                    <Switch
                      checked={u.is_admin}
                      onCheckedChange={async (v) => {
                        await setRole({ data: { userId: u.id, isAdmin: v } });
                        qc.invalidateQueries({ queryKey: ["admin-users"] });
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
