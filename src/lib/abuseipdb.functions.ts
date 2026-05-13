import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const IP_RE = /^([0-9]{1,3}\.){3}[0-9]{1,3}$|^[0-9a-fA-F:]+$/;

export type AbuseReport = {
  reportedAt: string;
  comment: string;
  categories: number[];
  reporterId: number;
  reporterCountryCode: string | null;
  reporterCountryName: string | null;
};

export type AbuseResult = {
  ok: boolean;
  error?: string;
  ipAddress?: string;
  isPublic?: boolean;
  ipVersion?: number;
  isWhitelisted?: boolean | null;
  abuseConfidenceScore?: number;
  countryCode?: string | null;
  countryName?: string | null;
  usageType?: string | null;
  isp?: string | null;
  domain?: string | null;
  hostnames?: string[];
  isTor?: boolean;
  totalReports?: number;
  numDistinctUsers?: number;
  lastReportedAt?: string | null;
  reports?: AbuseReport[];
};

// Catálogo de categorías de AbuseIPDB
export const ABUSE_CATEGORIES: Record<number, string> = {
  1: "DNS Compromise", 2: "DNS Poisoning", 3: "Fraud Orders", 4: "DDoS Attack",
  5: "FTP Brute-Force", 6: "Ping of Death", 7: "Phishing", 8: "Fraud VoIP",
  9: "Open Proxy", 10: "Web Spam", 11: "Email Spam", 12: "Blog Spam",
  13: "VPN IP", 14: "Port Scan", 15: "Hacking", 16: "SQL Injection",
  17: "Spoofing", 18: "Brute-Force", 19: "Bad Web Bot", 20: "Exploited Host",
  21: "Web App Attack", 22: "SSH", 23: "IoT Targeted",
};

export const checkAbuseIp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ip: string }) =>
    z.object({ ip: z.string().min(3).max(64).regex(IP_RE, "IP no válida") }).parse(d),
  )
  .handler(async ({ data }): Promise<AbuseResult> => {
    const key = process.env.ABUSEIPDB_API_KEY;
    if (!key) return { ok: false, error: "Falta ABUSEIPDB_API_KEY" };
    try {
      const url = `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(
        data.ip,
      )}&maxAgeInDays=90&verbose`;
      const res = await fetch(url, {
        headers: { Key: key, Accept: "application/json" },
      });
      const json = (await res.json()) as { data?: Record<string, unknown>; errors?: { detail: string }[] };
      if (!res.ok || !json.data) {
        return { ok: false, error: json.errors?.[0]?.detail || `HTTP ${res.status}` };
      }
      const d = json.data as Record<string, unknown>;
      return {
        ok: true,
        ipAddress: d.ipAddress as string,
        isPublic: d.isPublic as boolean,
        ipVersion: d.ipVersion as number,
        isWhitelisted: (d.isWhitelisted as boolean | null) ?? null,
        abuseConfidenceScore: d.abuseConfidenceScore as number,
        countryCode: (d.countryCode as string | null) ?? null,
        countryName: (d.countryName as string | null) ?? null,
        usageType: (d.usageType as string | null) ?? null,
        isp: (d.isp as string | null) ?? null,
        domain: (d.domain as string | null) ?? null,
        hostnames: (d.hostnames as string[]) ?? [],
        isTor: (d.isTor as boolean) ?? false,
        totalReports: (d.totalReports as number) ?? 0,
        numDistinctUsers: (d.numDistinctUsers as number) ?? 0,
        lastReportedAt: (d.lastReportedAt as string | null) ?? null,
        reports: ((d.reports as Record<string, unknown>[]) ?? []).map((r) => ({
          reportedAt: r.reportedAt as string,
          comment: (r.comment as string) ?? "",
          categories: (r.categories as number[]) ?? [],
          reporterId: r.reporterId as number,
          reporterCountryCode: (r.reporterCountryCode as string | null) ?? null,
          reporterCountryName: (r.reporterCountryName as string | null) ?? null,
        })),
      };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
