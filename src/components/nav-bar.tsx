import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogIn, LogOut, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const links = [
  { to: "/", label: "URL" },
  { to: "/ip", label: "IP" },
  { to: "/email-headers", label: "Cabeceras" },
  { to: "/cyberchef", label: "CyberChef" },
  { to: "/history", label: "Historial" },
] as const;

export function NavBar() {
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const load = async (uid: string | null) => {
      if (!uid) { setIsAdmin(false); return; }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
    };
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      load(data.session?.user.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user.email ?? null);
      load(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <nav className="flex items-center gap-1 flex-wrap">
      {links.map((l) => (
        <Button key={l.to} asChild size="sm" variant="ghost" className="text-xs">
          <Link
            to={l.to}
            activeProps={{ className: "bg-primary/15 text-primary" }}
            activeOptions={{ exact: l.to === "/" }}
          >
            {l.label}
          </Link>
        </Button>
      ))}
      {isAdmin && (
        <Button asChild size="sm" variant="ghost" className="text-xs">
          <Link to="/admin" activeProps={{ className: "bg-accent/15 text-accent" }}>
            <ShieldCheck className="w-3 h-3 mr-1" />Admin
          </Link>
        </Button>
      )}
      <div className="w-px h-5 bg-border mx-1" />
      {email ? (
        <>
          <span className="text-xs text-muted-foreground hidden md:inline px-2" title={email}>
            {email}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/";
            }}
          >
            <LogOut className="w-3 h-3 mr-1" />Salir
          </Button>
        </>
      ) : (
        <Button asChild size="sm" variant="outline" className="text-xs">
          <Link to="/login"><LogIn className="w-3 h-3 mr-1" />Entrar</Link>
        </Button>
      )}
    </nav>
  );
}
