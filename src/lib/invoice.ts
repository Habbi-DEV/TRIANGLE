import type { Order } from './types';
import { money, orderNumber } from './format';
import { getCurrentLang } from './i18n';
import { getCachedSettings } from './settings';

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const INVOICE_STRINGS = {
  fr: {
    receipt: 'Facture / Reçu',
    order: 'Commande',
    date: 'Date',
    type: 'Type',
    table: 'Table',
    pickup: 'À récupérer au comptoir',
    subtotal: 'Sous-total',
    delivery: 'Livraison',
    total: 'Total',
    payment: 'Paiement',
    cash: 'Espèces',
    notes: 'Notes',
    thanks: 'Merci pour votre commande ! 🧡',
    popup_blocked: "Merci d'autoriser les pop-ups pour afficher la facture.",
    back: 'Retour',
    types: { dine_in: 'Sur place', takeaway: 'À emporter', delivery: 'Livraison' } as Record<Order['order_type'], string>,
  },
  ar: {
    receipt: 'فاتورة / إيصال',
    order: 'الطلب',
    date: 'التاريخ',
    type: 'النوع',
    table: 'طاولة',
    pickup: 'استلام من الكاونتر',
    subtotal: 'المجموع الفرعي',
    delivery: 'التوصيل',
    total: 'المجموع',
    payment: 'الدفع',
    cash: 'نقداً',
    notes: 'ملاحظات',
    thanks: 'شكراً لطلبكم! 🧡',
    popup_blocked: 'الرجاء السماح بالنوافذ المنبثقة لعرض الفاتورة.',
    back: 'رجوع',
    types: { dine_in: 'في المطعم', takeaway: 'استلام', delivery: 'توصيل' } as Record<Order['order_type'], string>,
  },
} as const;

/**
 * Builds the self-contained receipt HTML (no app CSS dependency, so it
 * renders/prints the same regardless of what's on screen). Branding
 * (name/logo) comes from the live restaurant settings — see lib/settings —
 * so the ticket always matches whatever's configured in the admin Settings
 * page instead of a hardcoded name, with 'TRIANGLE' / the plate emoji as
 * the same fallback used everywhere else in the app.
 *
 * `withBackButton` adds a screen-only "Back" button at the top (hidden in
 * @media print) that closes this tab/window — used by the "just view it"
 * customer flow, which has no browser chrome of its own to go back with.
 * See viewInvoice() below.
 */
function buildReceiptHtml(order: Order, withBackButton: boolean): string {
  const lang = getCurrentLang();
  const L = INVOICE_STRINGS[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const settings = getCachedSettings();
  const brandName = escapeHtml(settings?.restaurant_name || 'TRIANGLE');
  const logoUrl = settings?.logo_url;

  const created = new Date(order.created_at);
  const locale = lang === 'ar' ? 'ar-DZ' : 'fr-FR';
  const dateStr = created.toLocaleDateString(locale);
  const timeStr = created.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  const contextLine =
    order.order_type === 'dine_in'
      ? `${L.table} ${order.table_number ?? '—'}`
      : order.order_type === 'delivery'
      ? [order.customer_name, order.customer_phone, order.delivery_address]
          .filter((v): v is string => Boolean(v))
          .map(escapeHtml)
          .join('<br/>')
      : L.pickup;

  const itemsHtml = (order.items ?? [])
    .map((it) => {
      const addOns = [...(it.sauces ?? []), ...(it.supplements ?? [])];
      const sauces = addOns.length
        ? `<div class="sauces">+ ${addOns.map((s) => escapeHtml(s.name) + (s.price > 0 ? ` (${money(s.price)})` : '')).join(', ')}</div>`
        : '';
      return `
        <tr>
          <td class="qty">${it.quantity}×</td>
          <td class="name">${escapeHtml(it.product_name)}${sauces}</td>
          <td class="amt">${money(it.line_total)}</td>
        </tr>`;
    })
    .join('');

  const contactLine = [settings?.address, settings?.phone]
    .filter((v): v is string => Boolean(v))
    .map(escapeHtml)
    .join(' · ');

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${L.receipt} ${orderNumber(order.id)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #18181b;
    max-width: 380px;
    margin: 0 auto;
    padding: 24px 20px 32px;
    direction: ${dir};
    background: #fff;
  }
  .top-bar { position: sticky; top: 0; display: flex; justify-content: center; padding-bottom: 16px; background: #fff; }
  .back-btn {
    display: inline-flex; align-items: center; gap: 6px;
    background: #f4f4f5; color: #18181b; border: none; border-radius: 999px;
    padding: 10px 20px; font-size: 13px; font-weight: 700; font-family: inherit;
    cursor: pointer;
  }
  .back-btn:active { transform: scale(0.97); }
  .brand { text-align: center; margin-bottom: 4px; }
  .brand .logo-wrap {
    display: inline-flex; align-items: center; justify-content: center;
    width: 52px; height: 52px; border-radius: 16px; margin-bottom: 8px;
    background: #fff7ed; overflow: hidden;
  }
  .brand .logo-wrap img { width: 100%; height: 100%; object-fit: contain; }
  .brand .logo-emoji { font-size: 26px; }
  .brand h1 { font-family: "Outfit", "Inter", sans-serif; font-size: 19px; font-weight: 800; margin: 0; letter-spacing: 0.02em; color: #18181b; }
  .brand p { font-size: 11px; color: #a1a1aa; margin: 3px 0 0; text-transform: uppercase; letter-spacing: 0.06em; }
  .brand .contact { font-size: 10.5px; color: #a1a1aa; margin-top: 4px; text-transform: none; letter-spacing: 0; }
  .divider { border: none; border-top: 1px dashed #d4d4d8; margin: 16px 0; }
  .meta { font-size: 12px; color: #52525b; }
  .meta .row { display: flex; justify-content: space-between; margin: 2px 0; }
  .meta .label { color: #a1a1aa; }
  .context { font-size: 12px; margin-top: 8px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
  td { padding: 5px 0; vertical-align: top; }
  td.qty { width: 32px; color: #71717a; font-weight: 700; }
  td.name { padding-left: 4px; }
  td.amt { text-align: right; white-space: nowrap; font-weight: 600; }
  .sauces { font-size: 10.5px; color: #a1a1aa; margin-top: 1px; }
  .totals { margin-top: 12px; font-size: 13px; }
  .totals .row { display: flex; justify-content: space-between; padding: 3px 0; color: #52525b; }
  .totals .grand { display: flex; justify-content: space-between; padding-top: 8px; margin-top: 6px; border-top: 1px solid #18181b; font-size: 17px; font-weight: 800; color: #ea580c; }
  .payment { margin-top: 10px; font-size: 12px; color: #52525b; text-transform: capitalize; }
  .footer { text-align: center; margin-top: 24px; font-size: 11px; color: #a1a1aa; }
  @media print {
    .top-bar { display: none; }
    body { padding: 0; max-width: 100%; }
    @page { margin: 12mm; }
  }
</style>
</head>
<body>
  ${withBackButton ? `<div class="top-bar"><button class="back-btn" onclick="window.close()">🔙 ${L.back}</button></div>` : ''}
  <div class="brand">
    <div class="logo-wrap">
      ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="" />` : '<span class="logo-emoji">🍽️</span>'}
    </div>
    <h1>${brandName}</h1>
    <p>${L.receipt}</p>
    ${contactLine ? `<p class="contact">${contactLine}</p>` : ''}
  </div>

  <hr class="divider" />

  <div class="meta">
    <div class="row"><span class="label">${L.order}</span><span>${orderNumber(order.id)}</span></div>
    <div class="row"><span class="label">${L.date}</span><span>${dateStr} · ${timeStr}</span></div>
    <div class="row"><span class="label">${L.type}</span><span>${L.types[order.order_type]}</span></div>
  </div>
  <div class="context">${contextLine}</div>

  <hr class="divider" />

  <table>
    <tbody>${itemsHtml}</tbody>
  </table>

  <div class="totals">
    <div class="row"><span>${L.subtotal}</span><span>${money(order.subtotal)}</span></div>
    ${order.delivery_fee > 0 ? `<div class="row"><span>${L.delivery}</span><span>${money(order.delivery_fee)}</span></div>` : ''}
    <div class="grand"><span>${L.total}</span><span>${money(order.total)}</span></div>
  </div>

  <div class="payment">${L.payment}: ${L.cash}</div>
  ${order.notes ? `<div class="payment">${L.notes}: ${escapeHtml(order.notes)}</div>` : ''}

  <div class="footer">${L.thanks}</div>
</body>
</html>`;
}

/** Opens `html` in a new window, showing the pop-up-blocked notice instead
 *  if the browser refused it. Returns the window so the caller can decide
 *  what to do next (auto-print, or just leave it be). */
function openReceiptWindow(html: string): Window | null {
  const lang = getCurrentLang();
  const win = window.open('', '_blank', 'width=420,height=680');
  if (!win) {
    alert(INVOICE_STRINGS[lang].popup_blocked);
    return null;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  return win;
}

/**
 * Opens a print-ready receipt/invoice for the given order and immediately
 * triggers the browser's print dialog. Used on the staff side (register,
 * orders list) where printing a paper ticket is the actual goal.
 */
export function printInvoice(order: Order): void {
  const win = openReceiptWindow(buildReceiptHtml(order, false));
  if (!win) return;
  // Give the popup a beat to finish laying out before invoking print().
  win.onload = () => win.print();
  setTimeout(() => win.print(), 300);
}

/**
 * Opens the receipt for the given order so the customer can simply look at
 * it — no print dialog, no print button. A small "Back" button sits at the
 * top of the page and closes the tab/window, since it has no browser
 * chrome of its own to navigate back with.
 */
export function viewInvoice(order: Order): void {
  openReceiptWindow(buildReceiptHtml(order, true));
}
