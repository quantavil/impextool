import { afterEach, describe, expect, test } from "bun:test";
import { onRequest as apiRoute } from "../functions/api/[[route]]";
import { handleApi } from "../server/handler";

type Upstream = (url: string, body: Record<string, unknown>) => Response;

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockUpstream(handler: Upstream): void {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return handler(url, body);
  }) as typeof fetch;
}

const post = (path: string, body: unknown): Request =>
  new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const jsonOf = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("worker routing and validation", () => {
  test("rejects non-POST requests", async () => {
    const res = await handleApi(new Request("https://example.test/api/duty"));
    expect(res.status).toBe(405);
  });

  test("rejects unknown routes", async () => {
    const res = await handleApi(post("/api/nope", {}));
    expect(res.status).toBe(404);
  });

  test("rejects HSN codes that are not digits or dots", async () => {
    mockUpstream(() => {
      throw new Error("should not reach upstream");
    });
    for (const hsn of ["", "..", "...", ".1", "9403; DROP", "<script>", "x".repeat(40)]) {
      const res = await handleApi(post("/api/duty", { hsn }));
      expect(res.status).toBe(400);
    }
  });
});

describe("worker duty proxy", () => {
  test("combines description, DBK and RoDTEP into one normalized response", async () => {
    const seen: string[] = [];
    mockUpstream((url, body) => {
      seen.push(`${url.split("/").pop()}:${String(body.Mode)}:${String(body.Country)}`);
      if (url.endsWith("/FillDescription")) return jsonOf([{ StandardUQC: "NOS" }]);
      if (url.endsWith("/FillDBK"))
        return jsonOf([{ ActualDBK_SERNo: "10", ActualDBKRate: 1.5, ActualUnit: "KGS" }]);
      return jsonOf([{ RoDTEPUQC: "nos" }]);
    });
    const res = await handleApi(post("/api/duty", { hsn: "9403" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string; uqc: string; dbk: unknown[]; rodetep: unknown[] };
    expect(data.status).toBe("ok");
    expect(data.uqc).toBe("NOS");
    expect(data.dbk).toHaveLength(1);
    expect(data.rodetep).toHaveLength(1);
    expect(seen.sort()).toEqual([
      "FillDBK:DBK:null",
      "FillDescription:Description:null",
      "GetDetails:RODEP:null",
    ]);
  });

  test("returns no-data when the description is empty", async () => {
    mockUpstream(() => jsonOf([]));
    const res = await handleApi(post("/api/duty", { hsn: "7318" }));
    expect(await res.json()).toEqual({ status: "no-data", hsn: "7318" });
  });

  test("a login page instead of JSON becomes a clear 502", async () => {
    mockUpstream(
      () => new Response("<html>Login</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
    );
    const res = await handleApi(post("/api/duty", { hsn: "9403" }));
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toContain("did not return JSON");
  });

  test("optional DBK/RoDTEP failures degrade to empty lists instead of failing the lookup", async () => {
    mockUpstream((url) => {
      if (url.endsWith("/FillDescription")) return jsonOf([{ StandardUQC: "KGS" }]);
      return new Response("boom", { status: 500 });
    });
    const res = await handleApi(post("/api/duty", { hsn: "9403" }));
    const data = (await res.json()) as { status: string; dbk: unknown[]; rodetep: unknown[] };
    expect(data.status).toBe("ok");
    expect(data.dbk).toEqual([]);
    expect(data.rodetep).toEqual([]);
  });
});

describe("worker exchange rates proxy", () => {
  test("forwards the rate request and passes the JSON through with caching", async () => {
    mockUpstream((url) => {
      expect(url).toBe("https://impexcube.in/Home/LoadExRate");
      return jsonOf([{ CurrencyCode: "USD", CurrencyName: "US DOLLARS", Export: "95.10" }]);
    });
    const res = await handleApi(post("/api/exchange-rates", {}));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=900");
    expect(await res.json()).toHaveLength(1);
  });
});

describe("Pages adapter and response shape", () => {
  test("the Cloudflare Pages Function delegates to the shared handler", async () => {
    const res = await apiRoute({ request: post("/api/duty", { hsn: "bad hsn" }) });
    expect(res.status).toBe(400);
  });

  test("upstream fields outside the contract are dropped", async () => {
    mockUpstream((url) => {
      if (url.endsWith("/FillDescription")) return jsonOf([{ StandardUQC: "NOS", Secret: "x" }]);
      if (url.endsWith("/FillDBK")) return jsonOf([{ ActualDBK_SERNo: "10", Extra: "leak" }]);
      return jsonOf([{ RoDTEPUQC: "NOS", Extra: "leak" }]);
    });
    const data = (await (await handleApi(post("/api/duty", { hsn: "9403" }))).json()) as Record<
      string,
      unknown
    >;
    expect(JSON.stringify(data)).not.toContain("leak");
    expect(JSON.stringify(data)).not.toContain("Secret");
  });
});
