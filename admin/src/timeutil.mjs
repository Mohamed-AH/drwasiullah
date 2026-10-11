/* The portal's date-time fields are in Makkah time (UTC+3); the database stores UTC "YYYY-MM-DD HH:MM:SS". */
export const makkahToUtc = v => {                       // "YYYY-MM-DDTHH:MM" -> UTC string; "" -> null; junk -> NaN
  v = String(v ?? "").trim(); if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return NaN;
  const d = new Date(`${v}:00+03:00`);
  return isNaN(d) ? NaN : d.toISOString().slice(0, 19).replace("T", " ");
};
export const utcToMakkahInput = s => { if (!s) return ""; const d = new Date(String(s).replace(" ", "T") + "Z"); return isNaN(d) ? "" : new Date(d.getTime() + 3 * 3600e3).toISOString().slice(0, 16); };
export const makkahToday = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
export const nowUtc = () => new Date().toISOString().slice(0, 19).replace("T", " ");
