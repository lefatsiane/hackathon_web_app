import "dotenv/config";
import { supabaseServer } from "../src/lib/supabase-server.js";

const args = process.argv.slice(2);
const adminKey = process.env.ADMIN_API_KEY || process.env.GRADURAT_ADMIN_KEY;
const adminFlagIndex = args.indexOf("--admin-key");
const providedKey = adminFlagIndex >= 0 ? args[adminFlagIndex + 1] : process.env.ADMIN_API_KEY || process.env.GRADURAT_ADMIN_KEY;

if (!adminKey || !providedKey || providedKey !== adminKey) {
  console.error("Protected admin script: provide a matching ADMIN_API_KEY value via .env or --admin-key.");
  process.exit(1);
}

const command = args[0];
const targetId = args[1];

const guard = (value, message) => {
  if (!value) {
    throw new Error(message);
  }
};

const toCsv = (rows) => {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    const stringValue = value == null ? "" : String(value);
    return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
};

const listPending = async () => {
  const [opportunities, employers] = await Promise.all([
    supabaseServer.from("opportunities").select("*").in("status", ["draft", "published"]).order("created_at", { ascending: false }),
    supabaseServer.from("employers").select("*").eq("verification_status", "pending").order("created_at", { ascending: false }),
  ]);

  if (opportunities.error) throw opportunities.error;
  if (employers.error) throw employers.error;

  return { opportunities: opportunities.data, employers: employers.data };
};

const approveOpportunity = async (id) => {
  const { data, error } = await supabaseServer
    .from("opportunities")
    .update({ status: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

const rejectOpportunity = async (id, reason = "Rejected by admin") => {
  const { data, error } = await supabaseServer
    .from("opportunities")
    .update({ status: "closed", closing_reason: reason, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

const archiveOpportunity = async (id) => {
  const { data, error } = await supabaseServer
    .from("opportunities")
    .update({ status: "archived", archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

const markEmployerVerified = async (id) => {
  const { data, error } = await supabaseServer
    .from("employers")
    .update({ verification_status: "verified", verification_timestamp: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

const exportCsv = async () => {
  const [employers, opportunities] = await Promise.all([
    supabaseServer.from("employers").select("*").order("created_at", { ascending: false }),
    supabaseServer.from("opportunities").select("*").order("created_at", { ascending: false }),
  ]);

  if (employers.error) throw employers.error;
  if (opportunities.error) throw opportunities.error;

  console.log(toCsv(employers.data));
  console.log("\n--- OPPORTUNITIES ---\n");
  console.log(toCsv(opportunities.data));
};

const detectDuplicates = async () => {
  const [employers, opportunities] = await Promise.all([
    supabaseServer.from("employers").select("*").order("company_name"),
    supabaseServer.from("opportunities").select("*").order("title"),
  ]);
  if (employers.error) throw employers.error;
  if (opportunities.error) throw opportunities.error;

  const employerGroups = new Map();
  for (const employer of employers.data) {
    const key = String(employer.company_name || "").trim().toLowerCase();
    if (!key) continue;
    if (!employerGroups.has(key)) employerGroups.set(key, []);
    employerGroups.get(key).push(employer);
  }

  const opportunityGroups = new Map();
  for (const opportunity of opportunities.data) {
    const key = String(opportunity.title || "").trim().toLowerCase();
    if (!key) continue;
    if (!opportunityGroups.has(key)) opportunityGroups.set(key, []);
    opportunityGroups.get(key).push(opportunity);
  }

  return {
    duplicate_employers: [...employerGroups.entries()].filter(([, rows]) => rows.length > 1).map(([key, rows]) => ({ key, rows })),
    duplicate_opportunities: [...opportunityGroups.entries()].filter(([, rows]) => rows.length > 1).map(([key, rows]) => ({ key, rows })),
  };
};

const detectExpired = async () => {
  const { data, error } = await supabaseServer
    .from("opportunities")
    .select("*")
    .eq("status", "published")
    .lt("application_deadline", new Date().toISOString().slice(0, 10));
  if (error) throw error;
  return data;
};

const toggleFeatured = async (id, featured = true) => {
  const { data, error } = await supabaseServer
    .from("opportunities")
    .update({ featured, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

try {
  switch (command) {
    case "list-pending": {
      const result = await listPending();
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "approve-opportunity": {
      guard(targetId, "Provide an opportunity id.");
      const result = await approveOpportunity(targetId);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "reject-opportunity": {
      guard(targetId, "Provide an opportunity id.");
      const result = await rejectOpportunity(targetId, args[2] || "Rejected by admin");
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "archive-opportunity": {
      guard(targetId, "Provide an opportunity id.");
      const result = await archiveOpportunity(targetId);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "mark-employer-verified": {
      guard(targetId, "Provide an employer id.");
      const result = await markEmployerVerified(targetId);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "export-csv": {
      await exportCsv();
      break;
    }
    case "detect-duplicates": {
      const result = await detectDuplicates();
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "detect-expired": {
      const result = await detectExpired();
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "toggle-featured": {
      guard(targetId, "Provide an opportunity id.");
      const featured = args[2] ? args[2].toLowerCase() !== "false" : true;
      const result = await toggleFeatured(targetId, featured);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    default:
      console.log("Usage: node scripts/admin.js <command> [id] [flags]\nCommands: list-pending | approve-opportunity | reject-opportunity | archive-opportunity | mark-employer-verified | export-csv | detect-duplicates | detect-expired | toggle-featured");
      process.exit(1);
  }
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
