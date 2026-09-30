/* KIO DATA UTILS — helper thuần: clone, đọc/ghi localStorage an toàn. */
const KioDataUtils = {
  clone: (v) => JSON.parse(JSON.stringify(v)),
  storageGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  storageSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
  readJson(k) { try { return JSON.parse(this.storageGet(k)); } catch (_) { return null; } },
  writeJson(k, v) { this.storageSet(k, JSON.stringify(v)); },
};
