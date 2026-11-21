
/*
 * NaijaClips — Cloud connection
 * File: public/cloud.js
 */

import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY
} from "./supabase-config.js";

const supabaseReady =
  typeof SUPABASE_URL === "string" &&
  SUPABASE_URL.startsWith("https://") &&
  typeof SUPABASE_ANON_KEY === "string" &&
  SUPABASE_ANON_KEY.length > 20 &&
  !SUPABASE_ANON_KEY.includes("PASTE_THE_");

window.NAIJACLIPS_CLOUD = {
  configured: supabaseReady,
  supabaseUrl: supabaseReady ? SUPABASE_URL : "",
  supabaseKey: supabaseReady ? SUPABASE_ANON_KEY : ""
};

if (!supabaseReady) {
  console.error(
    "NaijaClips: Supabase configuration is missing or invalid. Check public/supabase-config.js."
  );
} else {
  console.log("NaijaClips: Cloud configuration loaded.");
}
