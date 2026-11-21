export const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR_PUBLIC_KEY";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY
} from "./supabase-config.js";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

console.log("NaijaClips Supabase client initialized.");
