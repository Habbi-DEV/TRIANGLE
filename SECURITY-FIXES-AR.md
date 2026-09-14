# TRIANGLE — Security fixes applied (expert audit, 20y)

## 1) Critical (C1-C3) — DONE
- `api/orders.js`: GET list/counts/id now require `requireManager`; customer self-lookup via `?order_token=` (new `access_token` column). Legacy rows without token return masked data (no phone/address). List limit capped 100, status/order_type validated.
- Table-merge hijack disabled: public POST always creates a new ticket; merge only by cashier manually. Added `access_token` + `delivery_otp` per order.
- `api/push.js`: strict endpoint/p256dh/auth format, per-IP rate-limit 10/min, ownership proof via `order_token`, 404 vs 403 preserved, generic 500.

## 2) High (H1-H5) — DONE
- Roles split in `api/_lib/auth.js`: `requireManager` (admin/cashier/kitchen) vs `requireDriver` vs `requireAdmin`. Products/categories/sauces/tables/inventory/stats/orders-PUT now manager-only. CORS fail-open removed (no `*` in prod), Bearer regex robust.
- Mass-assignment closed: allowlists in products/categories/sauces; price validated `0..100000` (+ DB CHECK constraints in migration).
- Negative-price addons ignored server-side; `total` floored at 0.
- State machine `ORDER_TRANSITIONS` enforced; delivery `completed` requires OTP (staff PUT `otp`, driver PUT `otp`). Driver `available` scope masks PII (no name/phone/address/lat-lng until accept).
- `settings.js` GET whitelisted columns; tables GET manager-only (+ `?public=1` numbers-only); stats timezone fixed to Africa/Algiers + `limit 2000` + `Cache-Control: private,max-age=30`.

## 3) Medium — DONE
- New `api/_lib/validate.js`: validators, `rateLimit()` per-function, `audit()` writer, `internalError()` generic 500.
- Upload: base64 pre-size check, magic-byte verification, polyglot `<script` rejection, `upsert:false`, random filename, per-IP limit.
- All handlers return `{error:'Internal error'}` on 500; details only in server logs.
- Staff: UUID validation + last-admin guard + trigger-revert check + audit.
- Inventory: delta bounded ±100000, notes sanitized, update error now surfaces.

## 4) Frontend — DONE
- `vercel.json`: full CSP, `frame-ancestors 'none'`, `geolocation=(self)` (was `()` breaking maps), `Cross-Origin-Opener-Policy`, `Cache-Control: no-store` on /api.
- `vite.config.ts`: removed `triangle-orders` cache (NetworkOnly for sensitive APIs).
- `public/push-sw.js`: `safePushUrl()` allowlist + same-origin navigate check + length caps.
- New `src/lib/security.ts`: `isSafeImageUrl`, `sanitizeTel`, `sanitizeLatLng`, `secureSignOut()` (purges tracking keys + sensitive caches).
- `supabase.ts`: PKCE flow + missing-env warning. Admin/Driver layouts use `secureSignOut`.
- `LocationPickerModal`: no auto-geolocation on open (explicit consent button only).
- `push.ts`: sends `order_token` with subscription.

## 5) New features added
- Delivery OTP (4-digit `delivery_otp` per order) — customer shows it, staff/driver enter it to complete.
- Per-order tracking token (`access_token`/`order_token`) — shareable secret link, no login needed.
- Audit trail (`audit_logs` table + `supabase-migration-security.sql`).
- `.env.example` with safe/unsafe variable guide.

## Run
1. Apply `supabase-migration-security.sql` in Supabase SQL editor.
2. Set `ALLOWED_ORIGINS` in Vercel env (required now — no wildcard fallback).
3. Redeploy. Old customer tracking links still work but masked until new orders carry tokens.
