import "dotenv/config";
import { supabase } from "../src/lib/supabase.js";

const { error } = await supabase.auth.getSession();

if (error) {
  console.error(`Supabase connection failed: ${error.message}`);
  process.exitCode = 1;
} else {
  console.log("Supabase client reached the project successfully.");
  console.log(
    "No user session is expected until authentication is implemented.",
  );
}
