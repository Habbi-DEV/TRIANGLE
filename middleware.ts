// Vercel Edge Middleware — s'exécute AVANT que la requête n'atteigne l'une
// des 10 fonctions /api, donc réduit la charge (et la facturation) sur ces
// dernières pour tout trafic abusif rejeté ici.
//
// Ce projet n'utilise pas Next.js (Vite + React), donc ce middleware
// n'importe PAS 'next/server' — uniquement les API Web standard
// (Request/Response) plus `@vercel/edge`, le paquet officiel et léger conçu
// précisément pour le Edge Middleware hors-Next.js.

import { next } from '@vercel/edge';

export const config = {
  matcher: '/api/:path*',
};

// ----------------------------------------------------------------------------
// Liste noire d'IP — variable d'environnement, une IP par ligne/virgule.
//   BLOCKED_IPS=1.2.3.4,5.6.7.8
// ----------------------------------------------------------------------------
const BLOCKED_IPS = new Set(
  (process.env.BLOCKED_IPS || '').split(',').map((ip) => ip.trim()).filter(Boolean)
);

// ----------------------------------------------------------------------------
// Rate limiting — fenêtre glissante EN MÉMOIRE.
//
// LIMITE IMPORTANTE À CONNAÎTRE : chaque instance Edge de Vercel a sa PROPRE
// mémoire. Sous forte charge, Vercel répartit les requêtes sur plusieurs
// instances dans le monde entier, donc cette limite est "par instance", pas
// globale — un attaquant distribué peut en théorie la contourner. C'est une
// protection de référence contre les abus basiques (scripts naïfs, un seul
// client qui martèle une route), PAS une protection anti-DDoS distribuée.
//
// Pour une limite globale fiable en production, remplacez ce bloc par
// @upstash/ratelimit + Upstash Redis (quelques lignes, service gratuit en
// dessous d'un certain volume) :
//
//   import { Ratelimit } from '@upstash/ratelimit';
//   import { Redis } from '@upstash/redis';
//   const ratelimit = new Ratelimit({
//     redis: Redis.fromEnv(),
//     limiter: Ratelimit.slidingWindow(60, '1 m'),
//   });
//   const { success } = await ratelimit.limit(ip);
// ----------------------------------------------------------------------------
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;
const hits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  timestamps.push(now);
  hits.set(ip, timestamps);

  // Purge best-effort pour éviter une fuite mémoire non bornée sur une
  // instance Edge longue durée.
  if (hits.size > 5000) {
    for (const [key, arr] of hits) {
      if (arr.every((t) => now - t > WINDOW_MS)) hits.delete(key);
    }
  }

  return timestamps.length > MAX_REQUESTS_PER_WINDOW;
}

export default function middleware(request: Request) {
  const ip =
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';

  if (BLOCKED_IPS.has(ip)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '60',
      },
    });
  }

  // Laisse passer la requête vers la fonction /api ciblée.
  return next();
}
