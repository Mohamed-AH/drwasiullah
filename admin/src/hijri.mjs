/* Hijri <-> Gregorian (Umm al-Qura through Intl, Makkah calendar day). The site shows Hijri dates only; Gregorian `date` is kept for sorting. */
const HP = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Riyadh" });
const RIYADH = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Riyadh" });
const parts = t => { const o = {}; for (const p of HP.formatToParts(t)) if (p.type !== "literal" && p.type !== "era") o[p.type] = +p.value; return o; };

export function hijriToGregorian(y, m, d) {                    // -> "YYYY-MM-DD" or "" when that Hijri day does not exist
  if (!(y >= 1300 && y <= 1600 && m >= 1 && m <= 12 && d >= 1 && d <= 30)) return "";
  const est = Date.UTC(622, 6, 16, 9) + ((y - 1) * 354.36709 + (m - 1) * 29.5306 + (d - 1)) * 864e5;
  for (const off of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
    const t = new Date(est + off * 864e5), p = parts(t);
    if (p.year === y && p.month === m && p.day === d) return RIYADH.format(t);
  }
  return "";
}
export function hijriFromGregorian(date) {                     // "YYYY-MM-DD" -> {y, m, d} or null
  const t = new Date(date + "T12:00:00+03:00");
  if (isNaN(t)) return null;
  const p = parts(t);
  return p.year ? { y: p.year, m: p.month, d: p.day } : null;
}
