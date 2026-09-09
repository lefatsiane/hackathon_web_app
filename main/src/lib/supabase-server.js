// The server-side Supabase client uses the service-role key for trusted writes.
// It is isolated in this module so frontend code cannot accidentally bundle or
// expose that credential, while ws supplies the Node realtime transport.
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Fail during startup rather than allowing every API request to fail later
// with an opaque authentication or row-level-security error.
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and add the server-only key.",
  );
}

const isAnonymousJwt = (() => {
  try {
    const payload = serviceRoleKey.split(".")[1];
    if (!payload) return false;
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(decoded).role === "anon";
  } catch {
    return false;
  }
})();

if (isAnonymousJwt) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is an anon/public key. Replace it with the server-only service_role key from Supabase Project Settings > API, then restart the server.",
  );
}

export const supabaseServer = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  // Node 20 does not provide the native WebSocket used by Supabase Realtime.
  // Supplying ws keeps the server compatible without exposing Realtime to pages.
  realtime: { transport: WebSocket },
});
