const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  (process.env.ADMIN_API_KEY && process.env.ADMIN_API_KEY.startsWith("sb_") ? process.env.ADMIN_API_KEY : null);

let supabase = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  } catch (error) {
    console.warn("[CivicPulse] Warning: Could not initialize Supabase client:", error.message);
  }
} else {
  console.warn("[CivicPulse] Note: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env.");
}

module.exports = supabase;
