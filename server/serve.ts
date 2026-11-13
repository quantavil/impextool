import { resolve } from "node:path";
import { handleApi } from "./handler";

/** Local and self-hosted server: serves dist/ and the API from one port. */
const DIST = resolve(import.meta.dir, "../dist");
const PORT = Number(Bun.env.PORT ?? 8787);
const notFound = () => new Response("Not found", { status: 404 });

Bun.serve({
  port: PORT,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) return handleApi(request);
    let relative: string;
    try {
      relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    const target = resolve(DIST, relative);
    if (!target.startsWith(`${DIST}/`)) return notFound();
    const file = Bun.file(target);
    return (await file.exists()) ? new Response(file) : notFound();
  },
});

console.log(`ImpexTool: http://localhost:${PORT}`);
