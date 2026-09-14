import supabase from './supabase';

/**
 * Fetch helper for the Vercel API routes.
 * Automatically attaches the Supabase session token so staff-only
 * mutations (PUT/POST/DELETE) can verify the caller server-side.
 */
export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return body as T;
}

// ---------------------------------------------------------------------------
// Customer order tracking (no login): the POST /api/orders response carries a
// per-order secret `order_token`. It is saved under orderTokenKey(id) and sent
// back as ?order_token= so only the browser that placed the order can read it.
// ---------------------------------------------------------------------------
export const orderTokenKey = (id: number | string) => `restolink:orderToken:${id}`;

export function saveOrderToken(id: number | string, token: unknown) {
  try {
    if (typeof token === 'string' && token) localStorage.setItem(orderTokenKey(id), token);
  } catch { /* private mode — tracking just won't survive reload */ }
}

export function getOrderToken(id: number | string): string | null {
  try {
    return localStorage.getItem(orderTokenKey(id));
  } catch {
    return null;
  }
}

export async function fetchCustomerOrder<T = unknown>(id: number | string): Promise<T> {
  const token = getOrderToken(id);
  const res = await fetch(`/api/orders?id=${id}${token ? `&order_token=${encodeURIComponent(token)}` : ''}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return body as T;
}
