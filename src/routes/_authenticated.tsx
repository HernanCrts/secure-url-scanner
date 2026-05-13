import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NavBar } from "@/components/nav-bar";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login", search: { redirect: location.href } as never });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary/15 border border-primary/30 grid place-items-center">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <span className="text-sm font-semibold tracking-tight">URLab</span>
          </div>
          <NavBar />
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
