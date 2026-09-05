import { useCallback, useEffect, useState } from 'react';
import supabase from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Reads and flips the driver's own `profiles.is_online` toggle (see
 * migration_v15_driver_online_status.sql). Read/write goes straight through
 * the browser Supabase client — no dedicated API route needed, since the
 * existing "profiles_update_own" RLS policy already lets a user update
 * their own row.
 *
 * api/driver-orders.js's GET ?scope=available checks this same column
 * server-side, so toggling offline here immediately stops new orders from
 * being handed to this driver — not just a client-side filter.
 */
export default function useDriverOnlineStatus() {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase.from('profiles').select('is_online').eq('id', user.id).single();
      if (!cancelled) {
        setIsOnline(Boolean(data?.is_online));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const setOnline = useCallback(
    async (next: boolean) => {
      if (!user || busy) return;
      setBusy(true);
      const prev = isOnline;
      setIsOnline(next); // optimistic — the header toggle should feel instant
      const { error } = await supabase.from('profiles').update({ is_online: next }).eq('id', user.id);
      if (error) setIsOnline(prev); // revert on failure
      setBusy(false);
    },
    [user, isOnline, busy],
  );

  return { isOnline, loading, busy, setOnline };
}