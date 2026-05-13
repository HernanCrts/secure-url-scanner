import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

async function assertAdmin(supabase: import("@supabase/supabase-js").SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Solo administradores");
}

export type AdminUserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  is_admin: boolean;
  searches: number;
  last_search_at: string | null;
};

export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; users?: AdminUserRow[]; error?: string }> => {
    try {
      await assertAdmin(context.supabase, context.userId);
      const { data: profiles, error } = await supabaseAdmin
        .from("profiles")
        .select("id,email,display_name,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const ids = (profiles ?? []).map((p) => p.id);
      const [{ data: roles }, { data: hist }] = await Promise.all([
        supabaseAdmin.from("user_roles").select("user_id,role").in("user_id", ids),
        supabaseAdmin
          .from("search_history")
          .select("user_id,created_at")
          .in("user_id", ids)
          .order("created_at", { ascending: false }),
      ]);
      const adminSet = new Set((roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id));
      const counts: Record<string, { n: number; last: string | null }> = {};
      for (const h of hist ?? []) {
        const c = counts[h.user_id] ?? { n: 0, last: null };
        c.n += 1;
        if (!c.last || h.created_at > c.last) c.last = h.created_at;
        counts[h.user_id] = c;
      }
      const users: AdminUserRow[] = (profiles ?? []).map((p) => ({
        id: p.id,
        email: p.email,
        display_name: p.display_name,
        created_at: p.created_at,
        is_admin: adminSet.has(p.id),
        searches: counts[p.id]?.n ?? 0,
        last_search_at: counts[p.id]?.last ?? null,
      }));
      return { ok: true, users };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

export const setAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; isAdmin: boolean }) =>
    z.object({ userId: z.string().uuid(), isAdmin: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    try {
      await assertAdmin(context.supabase, context.userId);
      if (data.isAdmin) {
        await supabaseAdmin.from("user_roles").upsert(
          { user_id: data.userId, role: "admin" },
          { onConflict: "user_id,role" },
        );
      } else {
        await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", data.userId)
          .eq("role", "admin");
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
