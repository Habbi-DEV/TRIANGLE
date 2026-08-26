-- ============================================================================
--  RESTOLINK · Migration v3
--  Adds: `settings` — a single-row table centralizing values that used to be
--  hard-coded across the codebase (VAT rate duplicated in api/orders.js AND
--  tables.tax_rate in schema.sql, the € sign hard-coded in src/lib/format.ts,
--  the low-stock threshold hard-coded in InventoryPage.tsx, etc).
--
--  Run in the Supabase SQL Editor AFTER schema.sql and migration_v2.sql have
--  already been applied.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. SETTINGS — singleton row (id is always 1, enforced by the check
--    constraint below so the table can never hold more than one row).
--    Read publicly (the customer e-menu needs name/logo/hours/currency),
--    written by admins only.
-- ----------------------------------------------------------------------------
create table public.settings (
  id                       smallint primary key default 1 check (id = 1),

  -- General
  restaurant_name          text          not null default 'Restolink',
  logo_url                 text          not null default '',
  address                  text          not null default '',
  phone                    text          not null default '',
  contact_email            text          not null default '',
  -- Free-text for v1 (e.g. "Mon–Sat 11:00–23:00, Sun closed"); a structured
  -- day-by-day schedule can replace this column later without breaking
  -- readers, since it stays a single text field either way.
  opening_hours            text          not null default '',

  -- Order & payment
  currency                 text          not null default 'EUR'
                              check (currency in ('EUR', 'USD', 'MAD', 'DZD')),
  -- Single source of truth for VAT, replacing the TAX_RATE constant that was
  -- duplicated in api/orders.js and the tables.tax_rate default in schema.sql.
  tax_rate                 numeric(5,4)  not null default 0.10
                              check (tax_rate >= 0 and tax_rate <= 1),
  delivery_fee             numeric(10,2) not null default 0
                              check (delivery_fee >= 0),
  delivery_min_order       numeric(10,2) not null default 0
                              check (delivery_min_order >= 0),
  payment_cash_enabled     boolean       not null default true,
  payment_card_enabled     boolean       not null default true,

  -- Notifications
  new_order_sound_enabled  boolean       not null default true,
  low_stock_threshold      integer       not null default 8
                              check (low_stock_threshold >= 0),

  -- Branding — informational in v1 (see api/settings.js / SettingsPage.tsx
  -- comments): the brand-500 Tailwind color is still compiled at build time,
  -- so changing this field alone does not repaint the UI.
  brand_color              text          not null default '#f97316',

  updated_at               timestamptz   not null default now()
);
comment on table public.settings is 'Single-row app configuration (general info, tax/currency, notifications, branding). Public read, admin write.';

create trigger trg_settings_updated
  before update on public.settings
  for each row execute function public.set_updated_at();

alter table public.settings enable row level security;

-- Public read: the customer e-menu (unauthenticated) needs restaurant name,
-- logo, hours and currency to render.
create policy "settings_public_read" on public.settings
  for select using (true);

-- Admin-only write: settings are app-wide config, not something any staff
-- role should be able to change from the register/kitchen screens.
create policy "settings_admin_update" on public.settings
  for update using (public.is_admin()) with check (public.is_admin());

-- Seed the single row. tax_rate keeps the same 0.10 default that was
-- previously hard-coded in api/orders.js and schema.sql, so behavior is
-- unchanged until an admin edits it from /admin/settings.
insert into public.settings (id) values (1)
  on conflict (id) do nothing;

commit;

-- ============================================================================
-- DONE. Next steps:
--   · api/orders.js now reads tax_rate from this table instead of the
--     TAX_RATE = 0.10 constant — no further DB action needed, the seeded row
--     already matches the old hard-coded value.
--   · Visit /admin/settings to fill in the restaurant's real name, address,
--     currency, etc.
-- ============================================================================
