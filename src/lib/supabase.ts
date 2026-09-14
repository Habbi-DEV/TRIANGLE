import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL) as string;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string;

if (!url || !anonKey) {
  console.error('[supabase] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Set them in Vercel env.');
}

// SECURITY: anon key is public by design — never put SERVICE_ROLE under VITE_.
// Session persists in localStorage by default (XSS-readable): compensated by
// CSP (vercel.json), short-lived JWTs (Supabase dashboard -> Auth -> JWT expiry),
// and secureSignOut() which purges cached PII on logout. Never store PII manually.
const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

export default supabase;
