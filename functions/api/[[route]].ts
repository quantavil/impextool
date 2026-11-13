import { handleApi } from "../../server/handler";

/** Cloudflare Pages catch-all for /api/*: one adapter, routing lives in handleApi. Other hosts call handleApi directly. */
export const onRequest = (context: { request: Request }): Promise<Response> => handleApi(context.request);
