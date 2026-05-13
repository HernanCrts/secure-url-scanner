import { createFileRoute } from "@tanstack/react-router";
import { ChefHat, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/cyberchef")({
  head: () => ({ meta: [{ title: "CyberChef — URLab" }] }),
  component: CyberChefPage,
});

function CyberChefPage() {
  const url = "https://gchq.github.io/CyberChef/";
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <ChefHat className="w-4 h-4 text-primary" /> CyberChef
          </span>
          <Button asChild size="sm" variant="outline">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="w-3 h-3 mr-1" />Abrir en nueva pestaña
            </a>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          CyberChef se ejecuta íntegramente en tu navegador: ningún dato sale de tu equipo.
        </p>
        <div className="rounded-md overflow-hidden border border-border/60 bg-background">
          <iframe
            src={url}
            title="CyberChef"
            className="w-full"
            style={{ height: "calc(100vh - 220px)", minHeight: 600 }}
            sandbox="allow-scripts allow-same-origin allow-downloads allow-popups allow-forms"
          />
        </div>
      </CardContent>
    </Card>
  );
}
