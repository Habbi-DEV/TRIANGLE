import { getCurrentLang } from './i18n';

// Algeria-only build: single currency, always Algerian Dinar. Written as a
// suffix ("1 250 da"), which is how DA amounts are normally read/written
// here — unlike a symbol like €/$ that goes before the number. No decimal
// places: prices are always whole dinars in this app.
export const money = (n: number): string =>
  `${Math.round(Number(n) || 0)} da`;

export const orderNumber = (id: number): string => `#${id + 1000}`;

const TIME_AGO = {
  fr: { just_now: "à l'instant", min_ago: (m: number) => `il y a ${m} min`, h_ago: (h: number) => `il y a ${h} h` },
  ar: { just_now: 'الآن', min_ago: (m: number) => `منذ ${m} د`, h_ago: (h: number) => `منذ ${h} س` },
} as const;

export function timeAgo(iso: string): string {
  const lang = getCurrentLang();
  const strings = TIME_AGO[lang];
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return strings.just_now;
  const m = Math.floor(s / 60);
  if (m < 60) return strings.min_ago(m);
  const h = Math.floor(m / 60);
  if (h < 24) return strings.h_ago(h);
  return new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-DZ' : 'fr-FR');
}

export const clock = (iso: string): string =>
  new Date(iso).toLocaleTimeString(getCurrentLang() === 'ar' ? 'ar-DZ' : 'fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
