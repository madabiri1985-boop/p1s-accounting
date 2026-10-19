'use strict';
/* Voxara.3d accounting – data model, storage and all calculations (same logic as the Excel workbook v7). */

const Core = (() => {
  // ------------------------------------------------------------------ helpers
  const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹', AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  const toEnDigits = s => String(s ?? '').replace(/[۰-۹]/g, d => FA_DIGITS.indexOf(d)).replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d));
  const num = v => {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const s = toEnDigits(v).replace(/[,،٬\s]/g, '').replace('٫', '.');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };
  const round = (v, d = 0) => { const f = 10 ** d; return Math.round(v * f) / f; };
  const sum = (arr, fn) => arr.reduce((a, x) => a + (fn ? fn(x) : x), 0);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ------------------------------------------------------------------ Jalali calendar
  function g2j(gy, gm, gd) {
    const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    const gy2 = gm > 2 ? gy + 1 : gy;
    let days = 355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + gdm[gm - 1];
    let jy = -1595 + 33 * Math.floor(days / 12053); days %= 12053;
    jy += 4 * Math.floor(days / 1461); days %= 1461;
    if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    const jd = days < 186 ? 1 + (days % 31) : 1 + ((days - 186) % 30);
    return [jy, jm, jd];
  }
  function j2g(jy, jm, jd) {
    jy += 1595;
    let days = -355668 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
    let gy = 400 * Math.floor(days / 146097); days %= 146097;
    if (days > 36524) { gy += 100 * Math.floor(--days / 36524); days %= 36524; if (days >= 365) days++; }
    gy += 4 * Math.floor(days / 1461); days %= 1461;
    if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    let gd = days + 1;
    const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
    const ml = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let gm = 0;
    for (gm = 1; gm <= 12 && gd > ml[gm]; gm++) gd -= ml[gm];
    return [gy, gm, gd];
  }
  const pad = n => String(n).padStart(2, '0');
  const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayIso = () => isoOf(new Date());
  function jOfIso(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const [jy, jm, jd] = g2j(y, m, d);
    return `${jy}/${pad(jm)}/${pad(jd)}`;
  }
  function jParts(iso) { const [y, m, d] = iso.split('-').map(Number); return g2j(y, m, d); }
  // Jalali text (Persian or Latin digits, / - .) -> ISO date or null
  function isoOfJ(text) {
    const s = toEnDigits(text).trim().replace(/[-.]/g, '/');
    const m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!m) return null;
    const jy = +m[1], jm = +m[2], jd = +m[3];
    if (jm < 1 || jm > 12 || jd < 1 || jd > (jm <= 6 ? 31 : jm < 12 ? 30 : 30)) return null;
    const [gy, gm, gd] = j2g(jy, jm, jd);
    return `${gy}-${pad(gm)}-${pad(gd)}`;
  }
  const todayJ = () => jOfIso(todayIso());
  const daysBetween = (a, b) => (new Date(b) - new Date(a)) / 86400000;

  // ------------------------------------------------------------------ constants & defaults
  const ITEM_TYPES = ['فیلامنت', 'اکسسوری', 'بسته‌بندی', 'لوازم مصرفی', 'قطعات یدکی'];
  const TYPE_PREFIX = { 'فیلامنت': 'F', 'اکسسوری': 'A', 'بسته‌بندی': 'B', 'لوازم مصرفی': 'C', 'قطعات یدکی': 'S' };
  const CASH_TYPES = [
    { type: 'دریافت از مشتری', dir: 1, kind: 'دریافت', manual: true },
    { type: 'پرداخت هزینه', dir: -1, kind: 'هزینه', manual: true },
    { type: 'خرید دارایی', dir: -1, kind: 'دارایی', manual: true },
    { type: 'انتقال بین حساب‌ها', dir: -1, kind: 'انتقال', manual: true },
    { type: 'آورده سرمایه', dir: 1, kind: 'سرمایه', manual: true },
    { type: 'برداشت مالک', dir: -1, kind: 'سرمایه', manual: true },
    { type: 'سایر دریافت', dir: 1, kind: 'سایر', manual: true },
    { type: 'دریافت فروش', dir: 1, kind: 'دریافت', manual: false },
    { type: 'پرداخت خرید', dir: -1, kind: 'خرید', manual: false },
    { type: 'هزینه ارسال فروش', dir: -1, kind: 'هزینه', manual: false },
    { type: 'پرداخت ارسال امانی', dir: -1, kind: 'امانی', manual: false }
  ];
  const ADJ_TYPES = ['مرجوعی - سالم (برگشت به انبار)', 'مرجوعی - معیوب', 'خرابی محصول در انبار', 'ضایعات مواد اولیه'];
  const REFUND_MODES = ['نقدی بازگردانده شد', 'از بدهی کسر شود', 'بازگردانده نمی‌شود'];
  const SHIP_PAYERS = ['خریدار - پس‌کرایه', 'خریدار - اضافه به فاکتور', 'فروشنده - هزینه ما'];
  const ASSET_TYPES = ['چاپ - ساعتی', 'عمومی - ماهانه'];
  const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

  function defaultState() {
    const it = (code, type, name, color, unit, initPrice, minStock) => ({ code, type, name, color, unit, initPrice, overridePrice: 0, initStock: 0, minStock });
    return {
      version: 2,
      users: [],
      settings: {
        bizName: 'Voxara.3d', bizInfo: '',
        rateLabor: 150000, rateDesign: 250000, rateResearch: 150000, rateSocial: 150000, ratePower: 5000,
        setupMin: 10, machineHours: 200, machineMaint: 10000000, timeFactor: 1.1, matFactor: 1.05, markup1: 0.5, markup2: 1.0
      },
      lists: {
        expCats: ['تبلیغات', 'مدیریت شبکه‌های اجتماعی', 'حمل و نقل', 'اجاره و قبوض', 'ابزار کوچک و مصرفی', 'تعمیرات', 'سایر'],
        reasons: ['آسیب در ارسال', 'ایراد کیفیت چاپ', 'عدم تطابق با سفارش', 'انصراف مشتری', 'آسیب در انبار', 'رطوبت یا خرابی فیلامنت', 'شکستگی', 'سایر'],
        productCats: ['دکوری', 'لامپ و چراغ', 'صنعتی', 'جاکلیدی', 'مگنت', 'زیورآلات', 'اسباب‌بازی', 'کاربردی و خانگی', 'سایر']
      },
      accounts: [{ name: 'صندوق نقدی', open: 0 }, { name: 'کارت بانکی', open: 0 }],
      items: [
        it('F-001', 'فیلامنت', 'PLA Basic', 'مشکی', 'گرم', 6000000, 300),
        it('F-002', 'فیلامنت', 'PLA Basic', 'سفید', 'گرم', 6000000, 300),
        it('F-003', 'فیلامنت', 'PLA Matte', 'سفید عاجی', 'گرم', 6500000, 300),
        it('F-004', 'فیلامنت', 'PLA Silk+', 'طلایی', 'گرم', 7000000, 300),
        it('F-005', 'فیلامنت', 'PETG HF', 'مشکی', 'گرم', 7000000, 300),
        it('A-001', 'اکسسوری', 'آهن‌ربای 6×3', '', 'عدد', 15000, 20),
        it('A-002', 'اکسسوری', 'پین گوشواره', 'نقره‌ای', 'عدد', 20000, 20),
        it('A-003', 'اکسسوری', 'حلقه جاکلیدی', 'نقره‌ای', 'عدد', 10000, 20),
        it('B-001', 'بسته‌بندی', 'جعبه کوچک', '', 'عدد', 25000, 20),
        it('B-002', 'بسته‌بندی', 'کیسه زیپ‌دار', '', 'عدد', 3000, 50)
      ],
      products: [
        { code: 'P-001', name: 'جاکلیدی چندرنگ', cat: 'جاکلیدی', post: 3, assm: 1, pack: 2, listPrice: 0,
          plates: [{ desc: 'پلیت ۱', upp: 5, h: 7, m: 48, model: 91.04, fils: [{ item: 'F-001', grams: 84 }, { item: 'F-002', grams: 42.86 }] }],
          accs: [{ item: 'A-003', qty: 1, lost: false }, { item: 'B-002', qty: 1, lost: false }] },
        { code: 'P-002', name: 'مگنت یخچالی', cat: 'مگنت', post: 1, assm: 1, pack: 1, listPrice: 0,
          plates: [{ desc: 'پلیت ۱', upp: 12, h: 3, m: 30, model: 96, fils: [{ item: 'F-003', grams: 96 }] }],
          accs: [{ item: 'A-001', qty: 1, lost: true }] }
      ],
      assets: [{ code: 'AST-001', name: 'پرینتر Bambu Lab P1S Combo', date: '2026-09-01', cost: 300000000, salv: 0, life: 36, dtype: 'چاپ - ساعتی' }],
      customers: [],
      purchases: [], productions: [], invoices: [], cash: [], adjustments: []
    };
  }

  // ------------------------------------------------------------------ local storage (IndexedDB key/value; copy of the server data + pending changes)
  let state = null;
  const DB = 'voxara3d', STORE = 'kv';
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function kvGet(key) {
    try {
      const db = await idb();
      return await new Promise((res, rej) => {
        const q = db.transaction(STORE).objectStore(STORE).get(key);
        q.onsuccess = () => res(q.result ?? null); q.onerror = () => rej(q.error);
      });
    } catch (e) {
      try { return JSON.parse(localStorage.getItem('vx-' + key) || 'null'); } catch (e2) { return null; }
    }
  }
  async function kvSet(key, value) {
    const json = value == null ? null : JSON.parse(JSON.stringify(value));
    try {
      const db = await idb();
      await new Promise((res, rej) => {
        const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(json, key);
        t.oncomplete = res; t.onerror = () => rej(t.error);
      });
    } catch (e) {
      try { localStorage.setItem('vx-' + key, JSON.stringify(json)); } catch (e2) { console.warn('storage full', e2); }
    }
  }
  async function load() {
    state = await kvGet('state');
    if (state) migrate();
    return state;
  }
  function migrate() {
    const d = defaultState();
    for (const k of Object.keys(d)) if (state[k] === undefined) state[k] = d[k];
    for (const k of Object.keys(d.settings)) if (state.settings[k] === undefined) state.settings[k] = d.settings[k];
    for (const k of Object.keys(d.lists)) if (!state.lists[k]) state.lists[k] = d.lists[k];
    if (state.settings.bizName === 'Nook Art House') state.settings.bizName = 'Voxara.3d';
    state.version = 2;
  }
  const save = () => kvSet('state', state);
  const S = () => state;
  function replaceState(obj) { state = obj; if (state) migrate(); }
  // run fn against another copy of the data (used by sync to replay changes on the server copy)
  function withState(obj, fn) {
    const keep = state; state = obj; migrate();
    try { return fn(); } finally { state = keep; }
  }
  const clone = o => JSON.parse(JSON.stringify(o));

  // who is making the change (stamped on every document)
  let actor = '', actorAt = '';
  const stamp = () => ({ by: actor, at: actorAt || new Date().toISOString() });

  // ------------------------------------------------------------------ codes
  function nextCode(list, prefix, width = 3) {
    let mx = 0;
    for (const x of list) {
      const c = x.code || x.doc || x.no || '';
      if (c.startsWith(prefix + '-')) mx = Math.max(mx, parseInt(c.slice(prefix.length + 1), 10) || 0);
    }
    return `${prefix}-${String(mx + 1).padStart(width, '0')}`;
  }

  // ------------------------------------------------------------------ items
  const itemBy = code => state.items.find(i => i.code === code);
  const itemLabel = i => i ? `${i.code} | ${i.name}${i.color ? ' ' + i.color : ''}` : '';
  const isFil = i => i && i.type === ITEM_TYPES[0];
  const itemFactor = i => (i && i.unit === 'گرم') ? 1000 : 1;
  const itemPriceUnit = i => (i && i.unit === 'گرم') ? 'کیلوگرم' : (i ? i.unit : '');
  function lastPurchasePrice(code) {
    let last = null;
    for (const p of state.purchases) for (const l of p.lines) if (l.item === code && (!last || p.date >= last.date)) last = { date: p.date, price: l.unitPrice };
    return last ? last.price : 0;
  }
  function itemEffPrice(code) {           // per kg or per piece
    const i = itemBy(code); if (!i) return 0;
    if (num(i.overridePrice) > 0) return num(i.overridePrice);
    const lp = lastPurchasePrice(code);
    return lp > 0 ? lp : num(i.initPrice);
  }
  const itemUnitCost = code => itemEffPrice(code) / itemFactor(itemBy(code));   // per gram or per piece
  function itemMoves(code) {
    let buy = 0, use = 0, waste = 0;
    for (const p of state.purchases) for (const l of p.lines) if (l.item === code) buy += num(l.qty);
    for (const pr of state.productions) for (const u of pr.uses) if (u.item === code) use += num(u.qty);
    for (const a of state.adjustments) if (a.type === ADJ_TYPES[3] && a.item === code) waste += num(a.qty);
    return { buy, use, waste };
  }
  function itemStock(code) {
    const i = itemBy(code); if (!i) return 0;
    const m = itemMoves(code);
    return num(i.initStock) + m.buy - m.use - m.waste;
  }
  function itemStatus(code) {
    const i = itemBy(code); const m = itemMoves(code); const st = itemStock(code);
    if (num(i.initStock) + m.buy === 0) return 'خریداری نشده';
    if (st <= 0) return 'ناموجود';
    if (st < num(i.minStock)) return 'رو به اتمام';
    return 'کافی';
  }

  // ------------------------------------------------------------------ machine rate & products
  function rateMachine() {
    const s = state.settings; const mh = num(s.machineHours);
    if (mh <= 0) return 0;
    let dep = 0;
    for (const a of state.assets) if (a.dtype === ASSET_TYPES[0] && num(a.life) > 0) dep += (num(a.cost) - num(a.salv)) / num(a.life);
    return (dep + num(s.machineMaint)) / mh;
  }
  const productBy = code => state.products.find(p => p.code === code);
  const productLabel = p => p ? `${p.code} | ${p.name}` : '';
  function productCalc(p) {
    const s = state.settings;
    let hours = 0, grams = 0, wasteG = 0, mat = 0, setupH = 0;
    for (const pl of p.plates || []) {
      const upp = num(pl.upp) || 1;
      const ph = num(pl.h) + num(pl.m) / 60;
      const tot = sum(pl.fils || [], f => num(f.grams));
      hours += ph / upp;
      if (ph > 0) setupH += num(s.setupMin) / 60 / upp;
      grams += tot / upp;
      if (num(pl.model) > 0) wasteG += Math.max(0, tot - num(pl.model)) / upp;
      for (const f of pl.fils || []) mat += num(f.grams) / upp * num(s.matFactor) * itemUnitCost(f.item);
    }
    for (const a of p.accs || []) mat += num(a.qty) * itemUnitCost(a.item);
    const mac = hours * num(s.timeFactor) * (rateMachine() + num(s.ratePower));
    const labH = setupH + (num(p.post) + num(p.assm) + num(p.pack)) / 60;
    const lab = labH * num(s.rateLabor);
    const cost = mat + mac + lab;
    const p1 = cost * (1 + num(s.markup1)), p2 = cost * (1 + num(s.markup2));
    return { hours, grams, wasteG: wasteG * num(s.matFactor), mat, mac, labH, lab, cost, p1, p2, sug: num(p.listPrice) > 0 ? num(p.listPrice) : p1 };
  }
  function productMoves(code) {
    let made = 0, fail = 0, sold = 0, gift = 0, ret = 0, dmg = 0, rev = 0;
    for (const pr of state.productions) if (pr.product === code) { made += num(pr.good); fail += num(pr.fail); }
    for (const inv of state.invoices) for (const l of inv.lines) if (l.product === code) {
      if (inv.kind === 'هدیه') gift += num(l.qty); else { sold += num(l.qty); rev += num(l.net); }
    }
    for (const a of state.adjustments) if (a.product === code) {
      if (a.type === ADJ_TYPES[0]) ret += num(a.qty);
      if (a.type === ADJ_TYPES[2]) dmg += num(a.qty);
      rev -= num(a.credit);
    }
    return { made, fail, sold, gift, ret, dmg, rev, stock: made - sold - gift + ret - dmg };
  }

  // ------------------------------------------------------------------ customers, invoices, accounts
  function invoiceCalc(inv) {
    const rcv = sum(state.cash.filter(c => c.inv === inv.no && cashDir(c.type) === 1), c => num(c.amount));
    const adj = state.adjustments.filter(a => a.inv === inv.no);
    const credit = sum(adj, a => num(a.credit)), refund = sum(adj, a => num(a.refund)), retQty = sum(adj, a => num(a.qty));
    const due = num(inv.total) - rcv - credit + refund;
    return { rcv, credit, refund, retQty, due, settled: Math.round(due) <= 0 };
  }
  function customerCalc(name) {
    const invs = state.invoices.filter(i => i.customer === name);
    const sales = invs.filter(i => i.kind !== 'هدیه');
    const paid = sum(state.cash.filter(c => c.customer === name && cashDir(c.type) === 1), c => num(c.amount));
    const adj = state.adjustments.filter(a => a.customer === name);
    const credit = sum(adj, a => num(a.credit)), refund = sum(adj, a => num(a.refund));
    const total = sum(invs, i => num(i.total));
    return {
      invoices: sales.length, net: sum(sales, i => num(i.net)) - credit, paid, debt: total - paid - credit + refund,
      last: invs.length ? invs.map(i => i.date).sort().pop() : ''
    };
  }
  const cashDef = t => CASH_TYPES.find(c => c.type === t) || { dir: 0, kind: '' };
  const cashDir = t => cashDef(t).dir;
  function accountCalc(name) {
    const a = state.accounts.find(x => x.name === name) || { open: 0 };
    let inn = 0, out = 0;
    for (const c of state.cash) {
      const d = cashDir(c.type);
      if (c.acc === name) { if (d === 1) inn += num(c.amount); if (d === -1) out += num(c.amount); }
      if (c.type === 'انتقال بین حساب‌ها' && c.acc2 === name) inn += num(c.amount);
    }
    for (const x of state.adjustments) if (x.acc === name) out += num(x.refund);
    return { open: num(a.open), inn, out, bal: num(a.open) + inn - out };
  }
  function accountStatement(name) {
    const rows = [];
    for (const c of state.cash) {
      if (c.acc === name || (c.type === 'انتقال بین حساب‌ها' && c.acc2 === name)) {
        const toThis = c.type === 'انتقال بین حساب‌ها' && c.acc2 === name;
        const d = cashDir(c.type);
        rows.push({ date: c.date, type: c.type, desc: [c.customer, c.desc, c.acc2 ? `(${c.acc} > ${c.acc2})` : ''].filter(Boolean).join(' '),
          inn: toThis ? num(c.amount) : (d === 1 ? num(c.amount) : 0), out: toThis ? 0 : (d === -1 ? num(c.amount) : 0) });
      }
    }
    for (const x of state.adjustments) if (x.acc === name && num(x.refund) > 0)
      rows.push({ date: x.date, type: 'استرداد به مشتری', desc: `${x.customer} ${x.inv}`, inn: 0, out: num(x.refund) });
    rows.sort((a, b) => a.date.localeCompare(b.date));
    let bal = accountCalc(name).open;
    for (const r of rows) { bal += r.inn - r.out; r.bal = bal; }
    return rows;
  }
  function ensureCustomer(name) {
    if (name && !state.customers.find(c => c.name === name)) state.customers.push({ name, phone: '', city: '', note: '' });
  }

  // ------------------------------------------------------------------ purchase
  // lines: [{item:'F-001'} or {newName, newType, newColor}, pkgs, perPkg, price]
  function purchasePreview(f) {
    const lines = f.lines.filter(l => l.item || (l.newName || '').trim()).map(l => {
      const it = l.item ? itemBy(l.item) : null;
      const fact = it ? itemFactor(it) : (l.newType === ITEM_TYPES[0] ? 1000 : 1);
      const qty = num(l.pkgs) * (num(l.perPkg) > 0 ? num(l.perPkg) : fact);
      return { ...l, fact, qty, amount: num(l.pkgs) * num(l.price) };
    });
    const totAmt = sum(lines, l => l.amount), totQty = sum(lines, l => l.qty), ship = num(f.ship);
    for (const l of lines) {
      l.shipShare = f.alloc === 'qty' ? (totQty ? ship * l.qty / totQty : 0) : (totAmt ? ship * l.amount / totAmt : 0);
      l.cost = l.amount + l.shipShare;
      l.unitPrice = l.qty ? l.cost / l.qty * l.fact : 0;
      l.current = l.item ? itemEffPrice(l.item) : 0;
    }
    return { lines, goods: totAmt, ship, total: totAmt + ship };
  }
  function registerPurchase(f) {
    const pv = purchasePreview(f);
    if (!f.date) throw new Error('تاریخ معتبر نیست.');
    if (!state.accounts.find(a => a.name === f.acc)) throw new Error('حساب پرداخت را انتخاب کنید.');
    if (!pv.lines.length) throw new Error('حداقل یک کالا وارد کنید.');
    for (const l of pv.lines) {
      if (!l.item && !ITEM_TYPES.includes(l.newType)) throw new Error(`نوع کالای جدید «${l.newName}» را انتخاب کنید.`);
      if (num(l.pkgs) <= 0) throw new Error('تعداد همه ردیف‌ها را وارد کنید.');
      if (num(l.price) <= 0) throw new Error('قیمت همه ردیف‌ها را وارد کنید.');
    }
    const doc = nextCode(state.purchases, 'PUR', 4);
    const lines = [];
    for (const l of pv.lines) {
      let code = l.item;
      if (!code) {
        const exist = state.items.find(i => i.name === l.newName.trim() && (i.color || '') === (l.newColor || '').trim());
        if (exist) code = exist.code;
        else {
          code = nextCode(state.items.filter(i => i.code.startsWith(TYPE_PREFIX[l.newType] + '-')), TYPE_PREFIX[l.newType], 3);
          state.items.push({ code, type: l.newType, name: l.newName.trim(), color: (l.newColor || '').trim(), unit: l.newType === ITEM_TYPES[0] ? 'گرم' : 'عدد',
            initPrice: round(l.unitPrice), overridePrice: 0, initStock: 0, minStock: l.newType === ITEM_TYPES[0] ? 300 : 10 });
        }
      }
      const it = itemBy(code);
      if (num(it.initPrice) <= 0) it.initPrice = round(l.unitPrice);
      lines.push({ item: code, pkgs: num(l.pkgs), perPkg: l.qty / num(l.pkgs), price: num(l.price), qty: l.qty, amount: l.amount, ship: l.shipShare, cost: l.cost, unitPrice: l.unitPrice });
    }
    state.purchases.push({ ...stamp(), doc, date: f.date, vendor: f.vendor || '', acc: f.acc, ship: pv.ship, note: f.note || '', lines });
    state.cash.push({ ...stamp(), id: uid(), date: f.date, type: 'پرداخت خرید', acc: f.acc, amount: pv.total, customer: '', inv: doc, expCat: '', hours: 0, acc2: '', desc: `خرید ${lines.length} قلم از ${f.vendor || ''}`.trim() });
    return doc;
  }

  // ------------------------------------------------------------------ production
  // f: {date, product (code or ''), newName, good, fail, actualH, actualG, designH, researchH, post, assm, pack, saveDef, cat, note,
  //     plates:[{desc, prints, h, m, model, fils:[{item, grams}]}], accs:[{item, qty}]}
  function productionPreview(f) {
    const s = state.settings;
    const good = num(f.good), fail = num(f.fail), units = good + fail;
    let prints = 0, estH = 0, estG = 0, wasteRaw = 0;
    for (const pl of f.plates) {
      const pr = num(pl.prints), tot = sum(pl.fils.filter(x => x.item), x => num(x.grams));
      if (num(pl.h) + num(pl.m) > 0) prints += pr;
      estH += pr * (num(pl.h) + num(pl.m) / 60);
      estG += pr * tot;
      if (num(pl.model) > 0) wasteRaw += pr * Math.max(0, tot - num(pl.model));
    }
    const hrs = num(f.actualH) > 0 ? num(f.actualH) : estH * num(s.timeFactor);
    const matF = num(f.actualG) > 0 && estG > 0 ? num(f.actualG) / estG : num(s.matFactor);
    let matCost = 0, wasteCost = 0;
    const uses = [];
    for (const pl of f.plates) {
      const pr = num(pl.prints), tot = sum(pl.fils.filter(x => x.item), x => num(x.grams));
      const share = num(pl.model) > 0 && tot > 0 ? Math.max(0, 1 - num(pl.model) / tot) : 0;
      for (const fl of pl.fils) {
        if (!fl.item) continue;
        const uc = itemUnitCost(fl.item), used = pr * num(fl.grams) * matF;
        const proc = used * share, model = used - proc, failQ = units ? model * fail / units : 0;
        matCost += used * uc; wasteCost += proc * uc;
        uses.push({ item: fl.item, kind: 'مصرف', qty: model - failQ, ucost: uc });
        uses.push({ item: fl.item, kind: 'پرت فرآیند', qty: proc, ucost: uc });
        uses.push({ item: fl.item, kind: 'خرابی چاپ', qty: failQ, ucost: uc });
      }
    }
    for (const a of f.accs) {
      if (!a.item) continue;
      const uc = itemUnitCost(a.item);
      matCost += num(a.qty) * uc;
      uses.push({ item: a.item, kind: 'مصرف', qty: num(a.qty), ucost: uc });
    }
    const mac = hrs * (rateMachine() + num(s.ratePower));
    const labH = prints * num(s.setupMin) / 60 + good * (num(f.post) + num(f.assm) + num(f.pack)) / 60;
    const lab = labH * num(s.rateLabor);
    const des = num(f.designH) * num(s.rateDesign) + num(f.researchH) * num(s.rateResearch);
    const total = matCost + mac + lab + des;
    const grams = estG * matF;
    return {
      units, prints, estH, hrs, estG, matF, grams, wasteG: wasteRaw * matF, failG: units ? (grams - wasteRaw * matF) * fail / units : 0,
      matCost, mac, labH, lab, des, total, wasteCost, failCost: units ? total * fail / units : 0, unit: good ? total / good : 0,
      p1: good ? total / good * (1 + num(s.markup1)) : 0, p2: good ? total / good * (1 + num(s.markup2)) : 0,
      uses: uses.filter(u => u.qty > 1e-7)
    };
  }
  function loadDefinition(code, good, fail) {
    const p = productBy(code); if (!p) return null;
    const units = num(good) + num(fail);
    return {
      post: p.post, assm: p.assm, pack: p.pack,
      plates: (p.plates || []).map(pl => ({ desc: pl.desc, prints: Math.ceil((units || num(pl.upp)) / (num(pl.upp) || 1)), h: pl.h, m: pl.m, model: pl.model, fils: pl.fils.map(x => ({ ...x })) })),
      accs: (p.accs || []).map(a => ({ item: a.item, qty: num(a.qty) * (a.lost ? units : num(good)) }))
    };
  }
  function definitionFromForm(f) {
    const good = num(f.good), units = good + num(f.fail);
    return {
      plates: f.plates.filter(pl => pl.fils.some(x => x.item)).map((pl, i) => ({
        desc: pl.desc || `پلیت ${i + 1}`, upp: num(pl.prints) ? units / num(pl.prints) : 1, h: num(pl.h), m: num(pl.m), model: num(pl.model),
        fils: pl.fils.filter(x => x.item).map(x => ({ item: x.item, grams: num(x.grams) }))
      })),
      accs: f.accs.filter(a => a.item).map(a => ({ item: a.item, qty: good ? num(a.qty) / good : num(a.qty), lost: false }))
    };
  }
  function registerProduction(f) {
    if (!f.date) throw new Error('تاریخ معتبر نیست.');
    const pv = productionPreview(f);
    if (pv.units <= 0) throw new Error('تعداد محصول سالم یا خراب را وارد کنید.');
    if (!pv.uses.length) throw new Error('حداقل یک پلیت با فیلامنت یا یک قلم مصرفی وارد کنید.');
    let code = f.product, p = productBy(code);
    if (!p) {
      const name = (f.newName || '').trim();
      if (!name) throw new Error('محصول را انتخاب کنید یا نام محصول جدید را بنویسید.');
      code = nextCode(state.products, 'P', 3);
      p = { code, name, cat: f.cat || '', post: num(f.post), assm: num(f.assm), pack: num(f.pack), listPrice: 0, plates: [], accs: [] };
      Object.assign(p, definitionFromForm(f));
      state.products.push(p);
    } else if (f.saveDef) {
      Object.assign(p, { post: num(f.post), assm: num(f.assm), pack: num(f.pack) }, definitionFromForm(f));
    }
    const doc = nextCode(state.productions, 'PRD', 4);
    state.productions.push({ ...stamp(),
      doc, date: f.date, product: code, good: num(f.good), fail: num(f.fail), prints: pv.prints, estH: pv.estH, actualH: num(f.actualH), hrs: pv.hrs,
      estG: pv.estG, actualG: num(f.actualG), grams: pv.grams, wasteG: pv.wasteG, failG: pv.failG, labH: pv.labH, desH: num(f.designH) + num(f.researchH),
      matCost: pv.matCost, mac: pv.mac, lab: pv.lab, des: pv.des, total: pv.total, wasteCost: pv.wasteCost, failCost: pv.failCost, unit: pv.unit,
      note: f.note || '', uses: pv.uses
    });
    return { doc, code };
  }

  // ------------------------------------------------------------------ sale
  // f: {date, kind, customer, acc, disc, ship, shipPayer, rcv, note, lines:[{product, qty, price}]}
  function salePreview(f) {
    const gift = f.kind === 'هدیه';
    const lines = f.lines.filter(l => l.product).map(l => {
      const p = productBy(l.product), c = p ? productCalc(p) : { cost: 0, sug: 0 };
      const price = gift ? 0 : (num(l.price) > 0 ? num(l.price) : c.sug);
      return { ...l, name: p ? p.name : '', stock: productMoves(l.product).stock, sug: c.sug, price, amount: num(l.qty) * price, ucost: c.cost, cost: num(l.qty) * c.cost };
    });
    const gross = sum(lines, l => l.amount);
    const disc = gift ? 0 : num(f.disc);
    const net = gross - disc;
    const shipIn = f.shipPayer === SHIP_PAYERS[1] ? num(f.ship) : 0;
    const shipOurs = f.shipPayer === SHIP_PAYERS[2] ? num(f.ship) : 0;
    const total = net + shipIn, rcv = gift ? 0 : num(f.rcv), cogs = sum(lines, l => l.cost);
    const debtNow = f.customer ? customerCalc(f.customer).debt : 0;
    return { lines, gross, disc, net, shipIn, shipOurs, total, rcv, remain: total - rcv, cogs, profit: net - cogs - shipOurs, debtNow, debtAfter: debtNow + total - rcv };
  }
  function registerSale(f) {
    if (!f.date) throw new Error('تاریخ معتبر نیست.');
    const customer = (f.customer || '').trim();
    if (!customer) throw new Error('نام مشتری یا گیرنده را وارد کنید.');
    const pv = salePreview({ ...f, customer });
    if (!pv.lines.length) throw new Error('حداقل یک محصول وارد کنید.');
    const need = {};
    for (const l of pv.lines) {
      if (num(l.qty) <= 0) throw new Error(`تعداد «${l.name}» را وارد کنید.`);
      if (f.kind !== 'هدیه' && l.price <= 0) throw new Error(`قیمت «${l.name}» صفر است.`);
      need[l.product] = (need[l.product] || 0) + num(l.qty);
    }
    for (const [code, q] of Object.entries(need)) {
      const st = productMoves(code).stock;
      if (q > st + 1e-6) throw new Error(`موجودی «${productBy(code).name}» کافی نیست (موجودی ${st}). اول تولید را ثبت کنید.`);
    }
    if (pv.net < 0) throw new Error('تخفیف بیشتر از مبلغ فاکتور است.');
    if ((pv.rcv > 0 || pv.shipIn > 0 || pv.shipOurs > 0) && !state.accounts.find(a => a.name === f.acc)) throw new Error('حساب واریز را انتخاب کنید.');
    ensureCustomer(customer);
    const no = nextCode(state.invoices, 'INV', 4);
    const lines = pv.lines.map(l => {
      const share = pv.gross ? pv.disc * l.amount / pv.gross : 0;
      return { product: l.product, name: l.name, qty: num(l.qty), price: l.price, disc: share, net: l.amount - share, ucost: l.ucost, cogs: l.cost };
    });
    state.invoices.push({ ...stamp(), no, date: f.date, kind: f.kind, customer, acc: f.acc, gross: pv.gross, disc: pv.disc, net: pv.net, ship: num(f.ship), shipPayer: f.shipPayer,
      shipIn: pv.shipIn, total: pv.total, cogs: pv.cogs, note: f.note || '', lines });
    if (pv.rcv > 0) state.cash.push({ ...stamp(), id: uid(), date: f.date, type: 'دریافت فروش', acc: f.acc, amount: pv.rcv, customer, inv: no, expCat: '', hours: 0, acc2: '', desc: 'دریافت هنگام فروش' });
    if (pv.shipIn > 0) state.cash.push({ ...stamp(), id: uid(), date: f.date, type: 'پرداخت ارسال امانی', acc: f.acc, amount: pv.shipIn, customer, inv: no, expCat: '', hours: 0, acc2: '', desc: 'هزینه ارسال به حساب مشتری' });
    if (pv.shipOurs > 0) state.cash.push({ ...stamp(), id: uid(), date: f.date, type: 'هزینه ارسال فروش', acc: f.acc, amount: pv.shipOurs, customer, inv: no, expCat: 'حمل و نقل', hours: 0, acc2: '', desc: 'ارسال بر عهده فروشنده' });
    return no;
  }

  // ------------------------------------------------------------------ cash, payments, adjustments
  function registerCash(c) {
    if (!c.date) throw new Error('تاریخ معتبر نیست.');
    if (!cashDef(c.type).manual) throw new Error('نوع را انتخاب کنید.');
    if (!state.accounts.find(a => a.name === c.acc)) throw new Error('حساب را انتخاب کنید.');
    if (num(c.amount) <= 0 && !(c.type === 'پرداخت هزینه' && num(c.hours) > 0)) throw new Error('مبلغ را وارد کنید.');
    if (c.type === 'انتقال بین حساب‌ها' && (!state.accounts.find(a => a.name === c.acc2) || c.acc2 === c.acc)) throw new Error('حساب مقصد را درست انتخاب کنید.');
    if (c.type === 'دریافت از مشتری') {
      if (!state.customers.find(x => x.name === c.customer)) throw new Error('مشتری را انتخاب کنید.');
      if (c.inv) { const inv = state.invoices.find(i => i.no === c.inv); if (!inv) throw new Error('شماره فاکتور پیدا نشد.'); if (inv.customer !== c.customer) throw new Error(`فاکتور ${c.inv} متعلق به ${inv.customer} است.`); }
    }
    state.cash.push({ ...stamp(), id: uid(), date: c.date, type: c.type, acc: c.acc, amount: num(c.amount), customer: c.customer || '', inv: c.inv || '', expCat: c.expCat || '',
      hours: num(c.hours), acc2: c.type === 'انتقال بین حساب‌ها' ? c.acc2 : '', desc: c.desc || '' });
  }
  function adjustmentPreview(a) {
    const isRet = a.type === ADJ_TYPES[0] || a.type === ADJ_TYPES[1];
    const inv = isRet ? state.invoices.find(i => i.no === a.inv) : null;
    let soldQ = 0, net = 0, cogs = 0;
    if (inv) for (const l of inv.lines) if (l.product === a.product) { soldQ += num(l.qty); net += num(l.net); cogs += num(l.cogs); }
    const prevRet = isRet ? sum(state.adjustments.filter(x => x.inv === a.inv && x.product === a.product), x => num(x.qty)) : 0;
    const unitPrice = soldQ ? net / soldQ : 0;
    const value = num(a.qty) * unitPrice;
    const credit = isRet && a.rmode !== REFUND_MODES[2] ? value : 0;
    const refund = isRet && a.rmode === REFUND_MODES[0] ? value : 0;
    let ucost = 0;
    if (a.type === ADJ_TYPES[3]) ucost = itemUnitCost(a.item);
    else if (isRet) ucost = soldQ ? cogs / soldQ : 0;
    else { const p = productBy(a.product); ucost = p ? productCalc(p).cost : 0; }
    const cost = num(a.qty) * ucost;
    return { isRet, customer: inv ? inv.customer : '', soldQ, returnable: soldQ - prevRet, unitPrice, value, credit, refund, ucost, cost,
      stockNow: a.type === ADJ_TYPES[3] ? (a.item ? itemStock(a.item) : 0) : (a.product ? productMoves(a.product).stock : 0),
      unit: a.type === ADJ_TYPES[3] ? (itemBy(a.item) || {}).unit || '' : 'عدد',
      gpEffect: isRet ? -credit + (a.type === ADJ_TYPES[0] ? cost : 0) : 0,
      loss: (a.type === ADJ_TYPES[2] || a.type === ADJ_TYPES[3]) ? cost : 0 };
  }
  function registerAdjustment(a) {
    if (!a.date) throw new Error('تاریخ معتبر نیست.');
    if (!ADJ_TYPES.includes(a.type)) throw new Error('نوع را انتخاب کنید.');
    if (num(a.qty) <= 0) throw new Error('تعداد یا مقدار را وارد کنید.');
    const pv = adjustmentPreview(a);
    if (pv.isRet) {
      if (!state.invoices.find(i => i.no === a.inv)) throw new Error('شماره فاکتور را انتخاب کنید.');
      if (!a.product) throw new Error('محصول مرجوعی را انتخاب کنید.');
      if (num(a.qty) > pv.returnable + 1e-6) throw new Error(`حداکثر ${pv.returnable} عدد از این محصول در این فاکتور قابل مرجوع است.`);
      if (!REFUND_MODES.includes(a.rmode)) throw new Error('وضعیت استرداد وجه را انتخاب کنید.');
      if (pv.refund > 0 && !state.accounts.find(x => x.name === a.acc)) throw new Error('حساب استرداد را انتخاب کنید.');
    } else if (a.type === ADJ_TYPES[2]) {
      if (!a.product) throw new Error('محصول را انتخاب کنید.');
      if (num(a.qty) > productMoves(a.product).stock + 1e-6) throw new Error('تعداد بیشتر از موجودی محصول است.');
    } else if (!a.item) throw new Error('کالای مواد اولیه را انتخاب کنید.');
    state.adjustments.push({ ...stamp(), id: uid(), date: a.date, type: a.type, inv: pv.isRet ? a.inv : '', product: a.type === ADJ_TYPES[3] ? '' : a.product, item: a.type === ADJ_TYPES[3] ? a.item : '',
      qty: num(a.qty), reason: a.reason || '', rmode: pv.isRet ? a.rmode : '', acc: pv.refund > 0 ? a.acc : '', note: a.note || '',
      customer: pv.customer, unitPrice: pv.unitPrice, value: pv.value, credit: pv.credit, refund: pv.refund, ucost: pv.ucost, cost: pv.cost, gpEffect: pv.gpEffect, loss: pv.loss });
  }

  // ------------------------------------------------------------------ reports
  function assetDep(a, upTo = todayIso()) {
    const md = num(a.life) ? (num(a.cost) - num(a.salv)) / num(a.life) : 0;
    if (!a.date) return { md, months: 0, acc: 0 };
    const [y1, m1] = a.date.split('-').map(Number), [y2, m2] = upTo.split('-').map(Number);
    const months = Math.min(num(a.life), Math.max(0, (y2 - y1) * 12 + m2 - m1));
    return { md, months, acc: md * months };
  }
  function pnl(filter = () => true) {
    const inv = state.invoices.filter(i => filter(i.date)), sales = inv.filter(i => i.kind !== 'هدیه'), gifts = inv.filter(i => i.kind === 'هدیه');
    const adj = state.adjustments.filter(a => filter(a.date)), cash = state.cash.filter(c => filter(c.date)), prods = state.productions.filter(p => filter(p.date));
    const gross = sum(sales, i => num(i.gross)), disc = sum(sales, i => num(i.disc)), returns = sum(adj, a => num(a.credit));
    const net = gross - disc - returns;
    const cogs = sum(sales, i => num(i.cogs)) - sum(adj.filter(a => a.type === ADJ_TYPES[0]), a => num(a.cost));
    const gp = net - cogs;
    const expenses = sum(cash.filter(c => cashDef(c.type).kind === 'هزینه'), c => num(c.amount));
    const timeVal = sum(cash, c => num(c.hours) * num(state.settings.rateSocial));
    const giftCost = sum(gifts, i => num(i.cogs));
    const waste = sum(prods, p => num(p.failCost)) + sum(adj, a => num(a.loss));
    const dep = sum(state.assets.filter(a => a.dtype === ASSET_TYPES[1]), a => assetDep(a).acc);
    const np = gp - expenses - timeVal - giftCost - waste - (filter.all ? dep : 0);
    return { gross, disc, returns, net, cogs, gp, expenses, timeVal, giftCost, waste, dep: filter.all ? dep : 0, np,
      invoices: sales.length, cashIn: sum(cash, c => cashDir(c.type) === 1 ? num(c.amount) : 0), cashOut: sum(cash, c => cashDir(c.type) === -1 && c.type !== 'انتقال بین حساب‌ها' ? num(c.amount) : 0) + sum(adj, a => num(a.refund)),
      hours: sum(prods, p => num(p.hrs)) };
  }
  function dashboard() {
    const all = () => true; all.all = true;
    const p = pnl(all);
    const year = jParts(todayIso())[0];
    const months = MONTHS.map((name, i) => {
      const f = d => { if (!d) return false; const [jy, jm] = jParts(d); return jy === year && jm === i + 1; };
      const x = pnl(f);
      return { name, net: x.net, gp: x.gp, np: x.np, cashIn: x.cashIn, cashOut: x.cashOut, hours: x.hours, invoices: x.invoices };
    });
    const cashTotal = sum(state.accounts, a => accountCalc(a.name).bal);
    const receivables = sum(state.customers, c => Math.max(0, customerCalc(c.name).debt));
    const matValue = sum(state.items, i => Math.max(0, itemStock(i.code)) * itemUnitCost(i.code));
    const prodValue = sum(state.products, x => Math.max(0, productMoves(x.code).stock) * productCalc(x).cost);
    const filKg = sum(state.items.filter(isFil), i => itemStock(i.code)) / 1000;
    const usedG = sum(state.productions, x => num(x.grams));
    const wasteG = sum(state.productions, x => num(x.wasteG) + num(x.failG)) + sum(state.adjustments.filter(a => a.type === ADJ_TYPES[3] && isFil(itemBy(a.item))), a => num(a.qty));
    const lowStock = state.items.filter(i => ['رو به اتمام', 'ناموجود'].includes(itemStatus(i.code)) && itemStatus(i.code) !== 'خریداری نشده');
    const topProducts = state.products.map(x => ({ name: x.name, ...productMoves(x.code) })).filter(x => x.sold > 0).sort((a, b) => b.rev - a.rev).slice(0, 5);
    const topCustomers = state.customers.map(c => ({ name: c.name, ...customerCalc(c.name) })).filter(c => c.net > 0).sort((a, b) => b.net - a.net).slice(0, 5);
    const debtors = state.customers.map(c => ({ name: c.name, debt: customerCalc(c.name).debt })).filter(c => c.debt > 0.5).sort((a, b) => b.debt - a.debt).slice(0, 5);
    return { p, year, months, cashTotal, receivables, matValue, prodValue, filKg, usedG, wasteG, lowStock, topProducts, topCustomers, debtors };
  }

  // ------------------------------------------------------------------ delete last document (undo)
  function deleteDoc(kind, key) {
    const map = { purchase: ['purchases', 'doc'], production: ['productions', 'doc'], invoice: ['invoices', 'no'], cash: ['cash', 'id'], adjustment: ['adjustments', 'id'] };
    const [list, k] = map[kind];
    const idx = state[list].findIndex(x => x[k] === key);
    if (idx < 0) return false;
    state[list].splice(idx, 1);
    if (kind === 'purchase') state.cash = state.cash.filter(c => !(c.type === 'پرداخت خرید' && c.inv === key));
    if (kind === 'invoice') state.cash = state.cash.filter(c => !(c.inv === key && ['دریافت فروش', 'پرداخت ارسال امانی', 'هزینه ارسال فروش'].includes(c.type)));
    return true;
  }

  // ------------------------------------------------------------------ export
  function csvTables() {
    const j = d => jOfIso(d);
    const t = {};
    t['کالاها'] = [['کد', 'نوع', 'نام', 'رنگ', 'واحد', 'قیمت مؤثر', 'موجودی', 'وضعیت'], ...state.items.map(i => [i.code, i.type, i.name, i.color, i.unit, round(itemEffPrice(i.code)), round(itemStock(i.code), 1), itemStatus(i.code)])];
    t['محصولات'] = [['کد', 'نام', 'دسته', 'بهای تمام‌شده', 'قیمت پیشنهادی', 'تولید', 'فروش', 'هدیه', 'موجودی'], ...state.products.map(p => { const c = productCalc(p), m = productMoves(p.code); return [p.code, p.name, p.cat, round(c.cost), round(c.sug), m.made, m.sold, m.gift, m.stock]; })];
    t['خریدها'] = [['سند', 'تاریخ', 'فروشنده', 'کالا', 'مقدار', 'مبلغ', 'سهم ارسال', 'بهای هر کیلو/عدد', 'حساب'], ...state.purchases.flatMap(p => p.lines.map(l => [p.doc, j(p.date), p.vendor, itemLabel(itemBy(l.item)), l.qty, round(l.amount), round(l.ship), round(l.unitPrice), p.acc]))];
    t['تولیدها'] = [['سند', 'تاریخ', 'محصول', 'سالم', 'خراب', 'ساعت چاپ', 'فیلامنت (گرم)', 'پرت (گرم)', 'بهای کل', 'بهای هر محصول'], ...state.productions.map(p => [p.doc, j(p.date), (productBy(p.product) || {}).name, p.good, p.fail, round(p.hrs, 2), round(p.grams), round(p.wasteG), round(p.total), round(p.unit)])];
    t['فاکتورها'] = [['شماره', 'تاریخ', 'نوع', 'مشتری', 'جمع', 'تخفیف', 'مبلغ کل', 'دریافتی', 'مرجوعی', 'مانده'], ...state.invoices.map(i => { const c = invoiceCalc(i); return [i.no, j(i.date), i.kind, i.customer, round(i.gross), round(i.disc), round(i.total), round(c.rcv), round(c.credit), round(c.due)]; })];
    t['اقلام فروش'] = [['فاکتور', 'تاریخ', 'مشتری', 'محصول', 'تعداد', 'قیمت', 'مبلغ', 'بهای تمام‌شده'], ...state.invoices.flatMap(i => i.lines.map(l => [i.no, j(i.date), i.customer, l.name, l.qty, round(l.price), round(l.net), round(l.cogs)]))];
    t['دریافت و پرداخت'] = [['تاریخ', 'نوع', 'حساب', 'مبلغ', 'مشتری', 'فاکتور', 'دسته هزینه', 'ساعت', 'حساب مقصد', 'شرح'], ...state.cash.map(c => [j(c.date), c.type, c.acc, round(c.amount), c.customer, c.inv, c.expCat, c.hours, c.acc2, c.desc])];
    t['مرجوعی و ضایعات'] = [['تاریخ', 'نوع', 'فاکتور', 'مشتری', 'محصول یا کالا', 'مقدار', 'دلیل', 'اعتبار مشتری', 'استرداد', 'بها'], ...state.adjustments.map(a => [j(a.date), a.type, a.inv, a.customer, a.product ? (productBy(a.product) || {}).name : itemLabel(itemBy(a.item)), a.qty, a.reason, round(a.credit), round(a.refund), round(a.cost)])];
    t['مشتریان'] = [['نام', 'تلفن', 'شهر', 'تعداد فاکتور', 'خرید خالص', 'دریافتی', 'مانده بدهی'], ...state.customers.map(c => { const x = customerCalc(c.name); return [c.name, c.phone, c.city, x.invoices, round(x.net), round(x.paid), round(x.debt)]; })];
    t['حساب‌ها'] = [['حساب', 'موجودی اولیه', 'ورودی', 'خروجی', 'مانده'], ...state.accounts.map(a => { const x = accountCalc(a.name); return [a.name, x.open, round(x.inn), round(x.out), round(x.bal)]; })];
    return t;
  }

  // ------------------------------------------------------------------ master-data changes (each one is a replayable change)
  function saveItem(code, it) {
    if (!it.name || !ITEM_TYPES.includes(it.type)) throw new Error('نوع و نام کالا را وارد کنید.');
    const clean = { code: it.code, type: it.type, name: String(it.name).trim(), color: String(it.color || '').trim(), unit: it.unit || (it.type === ITEM_TYPES[0] ? 'گرم' : 'عدد'),
      initPrice: num(it.initPrice), overridePrice: num(it.overridePrice), initStock: num(it.initStock), minStock: num(it.minStock) };
    if (!code) {
      clean.code = nextCode(state.items.filter(i => i.code.startsWith(TYPE_PREFIX[it.type] + '-')), TYPE_PREFIX[it.type]);
      state.items.push(clean);
    } else {
      const ex = itemBy(code); if (!ex) throw new Error('کالا پیدا نشد.');
      Object.assign(ex, clean, { code });
    }
    return clean.code;
  }
  function saveProduct(code, p) {
    if (!p.name) throw new Error('نام محصول را وارد کنید.');
    const clean = { name: String(p.name).trim(), cat: p.cat || '', post: num(p.post), assm: num(p.assm), pack: num(p.pack), listPrice: num(p.listPrice),
      plates: (p.plates || []).map(pl => ({ desc: pl.desc || '', upp: num(pl.upp) || 1, h: num(pl.h), m: num(pl.m), model: num(pl.model),
        fils: (pl.fils || []).filter(f => f.item).map(f => ({ item: f.item, grams: num(f.grams) })) })),
      accs: (p.accs || []).filter(x => x.item).map(x => ({ item: x.item, qty: num(x.qty), lost: !!x.lost })) };
    if (!code) { clean.code = nextCode(state.products, 'P'); state.products.push(clean); return clean.code; }
    const ex = productBy(code); if (!ex) throw new Error('محصول پیدا نشد.');
    Object.assign(ex, clean); return code;
  }
  function addAccount(name) {
    name = String(name || '').trim(); if (!name) throw new Error('نام حساب را وارد کنید.');
    if (state.accounts.find(x => x.name === name)) throw new Error('این حساب هست.');
    state.accounts.push({ name, open: 0 });
  }
  function setAccountOpen(name, open) { const a = state.accounts.find(x => x.name === name); if (a) a.open = num(open); }
  function setCustomer(name, key, value) { const c = state.customers.find(x => x.name === name); if (c && ['phone', 'city', 'note'].includes(key)) c[key] = String(value); }
  function setSetting(key, value) {
    if (!(key in defaultState().settings)) return;
    state.settings[key] = typeof defaultState().settings[key] === 'number' ? num(value) : String(value);
  }
  function setList(key, values) { if (key in state.lists) state.lists[key] = (values || []).map(x => String(x).trim()).filter(Boolean); }
  function addAsset(x) {
    if (!x.name || num(x.cost) <= 0) throw new Error('نام و مبلغ دارایی را وارد کنید.');
    if (!x.date) throw new Error('تاریخ معتبر نیست.');
    state.assets.push({ code: nextCode(state.assets, 'AST'), name: x.name, date: x.date, cost: num(x.cost), salv: num(x.salv), life: num(x.life), dtype: x.dtype });
  }
  function wipeDocs() { Object.assign(state, { purchases: [], productions: [], invoices: [], cash: [], adjustments: [] }); }
  function restoreState(obj) {
    if (!obj || !obj.settings || !obj.items) throw new Error('فایل پشتیبان معتبر نیست.');
    const users = state.users;
    const fresh = clone(obj); delete fresh.users;
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, fresh, { users }); migrate();
  }

  // ------------------------------------------------------------------ users (password hashes only, never the password)
  const userBy = name => (state.users || []).find(u => u.name === name);
  const admins = () => state.users.filter(u => u.role === 'admin' && u.active);
  function addUser(u) {
    const name = String(u.name || '').trim();
    if (!name) throw new Error('نام کاربری را وارد کنید.');
    if (userBy(name)) throw new Error('این نام کاربری هست.');
    if (!u.hash || !u.salt) throw new Error('رمز را وارد کنید.');
    state.users.push({ name, full: u.full || '', role: u.role === 'admin' ? 'admin' : 'staff', salt: u.salt, hash: u.hash, iter: u.iter, active: true, created: actorAt });
  }
  function setUser(name, patch) {
    const u = userBy(name); if (!u) throw new Error('کاربر پیدا نشد.');
    const next = { ...u };
    if (patch.role) next.role = patch.role === 'admin' ? 'admin' : 'staff';
    if (patch.active !== undefined) next.active = !!patch.active;
    if (patch.full !== undefined) next.full = String(patch.full);
    if (patch.hash) Object.assign(next, { hash: patch.hash, salt: patch.salt, iter: patch.iter });
    if (u.role === 'admin' && u.active && (next.role !== 'admin' || !next.active) && admins().length <= 1) throw new Error('حداقل یک ادمین فعال باید بماند.');
    Object.assign(u, next);
  }
  function delUser(name) {
    const u = userBy(name); if (!u) return;
    if (u.role === 'admin' && u.active && admins().length <= 1) throw new Error('حداقل یک ادمین فعال باید بماند.');
    state.users = state.users.filter(x => x.name !== name);
  }
  function docOwner(kind, key) {
    const map = { purchase: ['purchases', 'doc'], production: ['productions', 'doc'], invoice: ['invoices', 'no'], cash: ['cash', 'id'], adjustment: ['adjustments', 'id'] };
    const [list, k] = map[kind] || []; const d = list ? state[list].find(x => x[k] === key) : null;
    return d ? d.by || '' : null;
  }

  // ------------------------------------------------------------------ changes ("ops"): every edit goes through apply() so it can be replayed on the server copy
  const OPS = {
    purchase: a => registerPurchase(a), production: a => registerProduction(a), sale: a => registerSale(a), cash: a => registerCash(a), adj: a => registerAdjustment(a),
    delDoc: a => deleteDoc(a.kind, a.key),
    saveItem: a => saveItem(a.code, a.item), saveProduct: a => saveProduct(a.code, a.product), addAccount: a => addAccount(a.name), setAccountOpen: a => setAccountOpen(a.name, a.open),
    setCustomer: a => setCustomer(a.name, a.key, a.value), setSetting: a => setSetting(a.key, a.value), setList: a => setList(a.key, a.values), addAsset: a => addAsset(a),
    wipeDocs: () => wipeDocs(), restore: a => restoreState(a.state),
    addUser: a => addUser(a), setUser: a => setUser(a.name, a.patch), delUser: a => delUser(a.name)
  };
  const ADMIN_OPS = new Set(['saveItem', 'saveProduct', 'addAccount', 'setAccountOpen', 'setSetting', 'setList', 'addAsset', 'wipeDocs', 'restore', 'addUser', 'delUser']);
  function apply(op) {
    const u = userBy(op.by);
    if (!u || !u.active) throw new Error(`کاربر «${op.by}» فعال نیست.`);
    if (!OPS[op.type]) throw new Error('تغییر ناشناخته: ' + op.type);
    const admin = u.role === 'admin';
    if (ADMIN_OPS.has(op.type) && !admin) throw new Error('این کار فقط برای ادمین مجاز است.');
    if (op.type === 'setUser' && !admin && (op.args.name !== op.by || Object.keys(op.args.patch).some(k => !['hash', 'salt', 'iter'].includes(k)))) throw new Error('فقط رمز خودتان را می‌توانید عوض کنید.');
    if (op.type === 'delDoc' && !admin && docOwner(op.args.kind, op.args.key) !== op.by) throw new Error('فقط اسنادی را که خودتان ثبت کرده‌اید می‌توانید حذف کنید.');
    actor = op.by; actorAt = op.at;
    try { return OPS[op.type](clone(op.args)); } finally { actor = ''; actorAt = ''; }
  }

  return {
    toEnDigits, num, round, sum, uid, g2j, j2g, jOfIso, isoOfJ, todayIso, todayJ, jParts, daysBetween,
    ITEM_TYPES, CASH_TYPES, ADJ_TYPES, REFUND_MODES, SHIP_PAYERS, ASSET_TYPES, MONTHS,
    load, save, S, replaceState, withState, clone, defaultState, nextCode, kvGet, kvSet, apply, userBy, docOwner,
    itemBy, itemLabel, isFil, itemFactor, itemPriceUnit, itemEffPrice, itemUnitCost, itemStock, itemStatus, itemMoves, lastPurchasePrice,
    rateMachine, productBy, productLabel, productCalc, productMoves,
    invoiceCalc, customerCalc, accountCalc, accountStatement, cashDef, cashDir, ensureCustomer,
    purchasePreview, registerPurchase, productionPreview, loadDefinition, registerProduction, salePreview, registerSale,
    registerCash, adjustmentPreview, registerAdjustment, assetDep, pnl, dashboard, deleteDoc, csvTables
  };
})();
