import { createClient } from '@supabase/supabase-js';

const envSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const envSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseUrl = envSupabaseUrl || 'https://placeholder.supabase.co';
const supabaseAnonKey = envSupabaseAnonKey || 'placeholder-anon-key';

if (!envSupabaseUrl || !envSupabaseAnonKey) {
  console.warn(
    'Supabase environment variables are missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to run SangamSetu.',
  );
}

// Temporary hackathon scaffolding:
// Phase 1 assumes anon select/insert/update are open so centers can demo cross-center
// realtime immediately. This MUST be replaced with real auth + restrictive RLS policies
// before any real-world deployment or exposure of personal data.
export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');
