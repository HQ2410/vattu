/* ============================================================================
 * KIO BRIDGE — nối kio-api.js (adapter của công ty, KHÔNG sửa) với các *-api.js.
 *
 * Các *-api.js gọi KioStore.bind({ tênDB: 'bảng_kio' }) và nhận về { boot(), save(name) }.
 * Adapter của công ty không có bind(), nên file này bổ sung bind() bằng cách chỉ dùng
 * các hàm công khai của KioStore: listCollection / syncCollection / appendCollection /
 * deleteKeys / saveSingleton / loadSingleton.
 *
 * Hành vi:
 *   boot()  : đọc từng bảng từ server vào DB[name]. Bảng chưa có dữ liệu và chưa từng
 *             được seed → ghi dữ liệu seed trong data.js lên server (đúng 1 lần).
 *   save(n) : đẩy DB[n] lên server (chạy nền, xếp hàng, gộp các lần lưu liên tiếp).
 *             Record bị xóa trong app sẽ được xóa trên server (trừ audit: chỉ thêm mới).
 * Phải nạp SAU kio-api.js và TRƯỚC supply-api.js, purchase-api.js, ...
 * ========================================================================== */
(() => {
  if (typeof KioStore === 'undefined') throw new Error('kio-bridge.js phải nạp sau kio-api.js');

  const META_TABLE = 'vtsc_meta';
  const META_ID = 'seeded';
  // Thông báo lỗi khi bảng chưa tồn tại (bảng được KIO tạo ở lần insert đầu tiên).
  const MISSING_TABLE = /doesn'?t exist|does not exist|no such table|unknown table|not found|42S02|1146|không tồn tại|không tìm thấy/i;
  // Các collection app dùng unshift (mới nhất đứng đầu) — server trả theo thứ tự insert (cũ → mới).
  const NEWEST_FIRST = new Set([
    'audit', 'requests', 'repairs', 'transfers', 'stocktakes', 'issues', 'receipts', 'maintLogs',
    'purchaseRequests', 'quotes', 'orders', 'standards', 'approvals', 'alerts', 'recommendations',
  ]);

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const isMissing = (err) => MISSING_TABLE.test(String(err?.message || err));

  // Trùng khớp keyOf() của kio-api.js để so sánh key local ↔ server.
  function keyOf(item, index = 0) {
    if (item && typeof item === 'object') {
      const c = [item.id, item.code, item.key, item.lotId, item.lotNumber, item.transactionId,
        item.transferId, item.countId, item.requestId, item.inspectionId, item.moveId];
      const found = c.find((v) => v !== undefined && v !== null && String(v) !== '');
      if (found !== undefined) return String(found);
    }
    return `ROW-${index + 1}`;
  }
  const keysOf = (list) => new Set(list.map((x, i) => keyOf(x, i)));

  // ---- Hàng đợi ghi: tuần tự toàn cục, gộp các lần save() cùng bảng chưa kịp chạy ----
  let chain = Promise.resolve();
  let pending = 0;
  const queued = new Map(); // table → Promise (chưa bắt đầu chạy)

  function enqueue(table, job) {
    if (queued.has(table)) return queued.get(table);
    pending += 1;
    const p = chain.then(() => { queued.delete(table); return job(); });
    queued.set(table, p);
    chain = p.catch(() => {});
    p.then(() => {}, () => {}).then(() => { pending -= 1; });
    return p;
  }

  window.addEventListener('beforeunload', (e) => {
    if (pending > 0) { e.preventDefault(); e.returnValue = ''; }
  });

  function report(err, table) {
    console.error(`[KIO] Lưu bảng ${table} thất bại:`, err);
    try { Toast.err(`Không lưu được lên server (${table}): ${err?.message || err}`); } catch (_) { /* Toast chưa sẵn sàng */ }
  }

  // ---- Đánh dấu bảng đã seed, để bảng bị xóa sạch không bị seed lại ----
  let seededSet = null;
  async function readSeeded() {
    if (seededSet) return seededSet;
    try {
      const meta = await KioStore.loadSingleton(META_TABLE, META_ID);
      seededSet = new Set(Array.isArray(meta?.tables) ? meta.tables : []);
    } catch (err) {
      if (!isMissing(err)) throw err;
      seededSet = new Set();
    }
    return seededSet;
  }
  async function markSeeded(table) {
    const set = await readSeeded();
    if (set.has(table)) return;
    set.add(table);
    const meta = { id: META_ID, tables: [...set] };
    try { await KioStore.syncCollection(META_TABLE, [meta]); }
    catch (err) {
      if (!isMissing(err)) throw err;
      await KioStore.appendCollection(META_TABLE, [meta]); // bảng meta chưa có: insert sẽ tự tạo
    }
  }

  // ---- Đọc bảng; bảng chưa tồn tại coi như rỗng ----
  async function readTable(table, opts) {
    try { return await KioStore.listCollection(table, opts); }
    catch (err) { if (isMissing(err)) return []; throw err; }
  }

  /** Đẩy toàn bộ `local` lên server và xóa các record đã bị xóa trong app. */
  async function push(table, local, known, { appendOnly = false } = {}) {
    const localKeys = keysOf(local);
    if (appendOnly) {
      // audit lưu mới nhất ở đầu mảng → ghi ngược lại để server giữ thứ tự cũ → mới.
      const fresh = local.filter((x, i) => !known.has(keyOf(x, i))).reverse();
      if (fresh.length) await KioStore.appendCollection(table, fresh);
    } else {
      try { await KioStore.syncCollection(table, local); }
      catch (err) {
        if (!isMissing(err)) throw err;
        await KioStore.appendCollection(table, local); // bảng chưa có: insert sẽ tự tạo bảng
      }
      const removed = [...known].filter((k) => !localKeys.has(k));
      if (removed.length) await KioStore.deleteKeys(table, removed);
    }
    return localKeys;
  }

  /** Gắn nhóm DB.<name> ↔ bảng KIO: trả về { boot(), save(name) } — cùng giao diện bản localStorage cũ. */
  KioStore.bind = function bind(map) {
    const known = new Map(); // name → Set key đang có trên server (theo lần đọc/ghi gần nhất)

    async function loadKnown(name) {
      if (known.has(name)) return known.get(name);
      const rows = await readTable(map[name], { force: true });
      const keys = keysOf(rows);
      known.set(name, keys);
      return keys;
    }

    return {
      async boot() {
        for (const [name, table] of Object.entries(map)) {
          let rows = await readTable(table);
          if (!rows.length) {
            const seeded = await readSeeded();
            const seed = Array.isArray(DB[name]) ? clone(DB[name]) : [];
            if (!seeded.has(table) && seed.length) {
              await push(table, seed, new Set());
              await markSeeded(table);
              rows = seed;
            }
          }
          if (NEWEST_FIRST.has(name)) rows = rows.slice().reverse();
          DB[name] = rows;
          known.set(name, keysOf(rows));
        }
      },

      save(name) {
        const table = map[name];
        if (!table) return Promise.reject(new Error(`Collection không được ánh xạ: ${name}`));
        const p = enqueue(table, async () => {
          // Collection chưa boot (vd. bảng AI): đọc key hiện có trên server để diff xóa đúng.
          const prev = await loadKnown(name);
          const local = Array.isArray(DB[name]) ? clone(DB[name]) : [];
          const next = await push(table, local, prev, { appendOnly: name === 'audit' });
          known.set(name, name === 'audit' ? new Set([...prev, ...next]) : next);
          await markSeeded(table);
          return true;
        });
        return p.then(() => true, (err) => { report(err, table); return false; });
      },
    };
  };
})();
