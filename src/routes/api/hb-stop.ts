import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/hb-stop")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { id } = (await request.json()) as { id?: string };
          if (!id) return new Response("missing id", { status: 400 });
          const key = process.env.HYPERBROWSER_API_KEY;
          if (!key) return new Response("no key", { status: 500 });
          await fetch(`https://app.hyperbrowser.ai/api/session/${id}/stop`, {
            method: "PUT",
            headers: { "x-api-key": key },
          });
          return new Response("ok");
        } catch {
          return new Response("err", { status: 500 });
        }
      },
    },
  },
});
