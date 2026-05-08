import createClient, { type Middleware } from "openapi-fetch";

import type { paths } from "./api-types";

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Match the backend gate: API_KEY is required on POST/PATCH/PUT/DELETE only.
// GETs intentionally go without the header so we don't leak the key in
// server-side fetches that don't need it.
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    if (request.method === "GET") return;
    const apiKey = process.env.NEXT_PUBLIC_API_KEY;
    if (apiKey) {
      request.headers.set("X-API-Key", apiKey);
    }
  },
};

export const api = createClient<paths>({ baseUrl });
api.use(authMiddleware);
