// This separate browser client uses only Supabase's publishable key. It is kept
// distinct from supabase-server.js so public frontend configuration cannot gain
// access to the server service-role credential.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env and fill in both values.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
