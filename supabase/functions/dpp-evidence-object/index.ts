import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const BUCKET = "dpp-evidence";
const MAX_BYTES = 10_485_760;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/csv",
  "application/json",
]);
const ORG_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/.+/i;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function json(status: number, code: string) {
  return new Response(JSON.stringify({ ok: false, code }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function safePath(raw: string | null): raw is string {
  if (!raw || raw.length > 1024 || raw.startsWith("/") || raw.includes("\\") || raw.includes("\0")) return false;
  const segments = raw.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return false;
  return ORG_PATH.test(raw);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, "AUTH_REQUIRED");

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !anonKey) return json(503, "STORAGE_BRIDGE_NOT_CONFIGURED");

  const token = authHeader.slice(7);
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) return json(401, "AUTH_INVALID");

  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!safePath(path)) return json(400, "EVIDENCE_PATH_INVALID");

  if (req.method === "POST") {
    const contentType = (req.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) return json(415, "EVIDENCE_TYPE_NOT_ALLOWED");

    const declared = Number(req.headers.get("Content-Length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_BYTES) return json(413, "EVIDENCE_TOO_LARGE");

    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength === 0) return json(400, "EVIDENCE_EMPTY");
    if (bytes.byteLength > MAX_BYTES) return json(413, "EVIDENCE_TOO_LARGE");

    const { error } = await client.storage.from(BUCKET).upload(path, bytes, {
      contentType,
      upsert: false,
    });
    if (error) return json(403, "EVIDENCE_UPLOAD_DENIED");

    return new Response(JSON.stringify({ ok: true, operation: "upload", path, bytes: bytes.byteLength }), {
      status: 201,
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  if (req.method === "GET") {
    const { data, error } = await client.storage.from(BUCKET).download(path);
    if (error || !data) return json(404, "EVIDENCE_NOT_AVAILABLE");
    const headers = new Headers(CORS);
    headers.set("Content-Type", data.type || "application/octet-stream");
    headers.set("Cache-Control", "private, no-store");
    return new Response(await data.arrayBuffer(), { status: 200, headers });
  }

  if (req.method === "DELETE") {
    const { error } = await client.storage.from(BUCKET).remove([path]);
    if (error) return json(403, "EVIDENCE_DELETE_DENIED");
    return new Response(JSON.stringify({ ok: true, operation: "delete", path }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  return json(405, "METHOD_NOT_ALLOWED");
});
