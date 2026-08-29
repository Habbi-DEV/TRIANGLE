import supabase from './supabase';

/**
 * Starts "Sign in with Google" using Supabase's built-in OAuth flow.
 *
 * This redirects the whole browser tab to Google's consent screen, then
 * back to Supabase (which exchanges the code for a session) and finally
 * back to `redirectTo` below, already signed in — no popup window and no
 * separate proxy server required.
 *
 * For this to work, the Google provider must be turned on in the Supabase
 * project: Dashboard → Authentication → Sign In / Providers → Google, with
 * a Client ID and Client Secret from Google Cloud Console, and the site's
 * URL (and this /login route) added under Authentication → URL Configuration.
 */
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/login`,
    },
  });
  if (error) throw error;
}
