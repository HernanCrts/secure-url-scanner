import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const recordSchema = z.object({
  kind: z.enum(["url", "ip", "email_headers"]),
  input: z.string().min(1).max(8000),
  result: z.unknown().optional(),
});

export const recordSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => recordSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("search_history").insert({
      user_id: userId,
      kind: data.kind,
      input: data.input.slice(0, 8000),
      result: (data.result ?? null) as never,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

export type HistoryRow = {
  id: string;
  user_id: string;
  kind: "url" | "ip" | "email_headers";
  input: string;
  result: unknown;
  created_at: string;
  email?: string | null;
};

const listSchema = z.object({
  kind: z.enum(["all", "url", "ip", "email_headers"]).optional(),
  search: z.string().max(200).optional(),
  limit: z.number().min(1).max(200).optional(),
});

export const listHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => listSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("search_history")
      .select("id,user_id,kind,input,result,created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.kind && data.kind !== "all") q = q.eq("kind", data.kind);
    if (data.search) q = q.ilike("input", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) return { ok: false as const, error: error.message, rows: [] };

    // Hidrata email del usuario (si admin podemos ver varios usuarios)
    const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    let emails: Record<string, string | null> = {};
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,email")
        .in("id", ids);
      emails = Object.fromEntries((profs ?? []).map((p) => [p.id, p.email]));
    }
    return {
      ok: true as const,
      rows: (rows ?? []).map((r) => ({ ...r, email: emails[r.user_id] ?? null })) as HistoryRow[],
    };
  });

export const deleteHistoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("search_history").delete().eq("id", data.id);
    return { ok: !error, error: error?.message };
  });
