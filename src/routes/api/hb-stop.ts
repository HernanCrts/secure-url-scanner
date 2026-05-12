// Endpoint usado por navigator.sendBeacon al cerrar la pestaña.
// Reenvía la orden de destruir la VM al host de sandbox.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/hb-stop")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { id } = (await request.json()) as { id?: string };
          if (!id) return new Response("missing id", { status: 400 });
          const h = process.env.SANDBOX_HOST_URL;
          const t = process.env.SANDBOX_API_TOKEN;
          if (!h || !t) return new Response("not configured", { status: 500 });
          await fetch(`${h.replace(/\/$/, "")}/session/${id}`, {
            method: "DELETE",
            headers: { authorization: `Bearer ${t}` },
          });
          return new Response("ok");
        } catch {
          return new Response("err", { status: 500 });
        }
      },
    },
  },
});
