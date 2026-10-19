'use strict';
/* Voxara.3d accounting – user interface (single page, RTL, offline, shared data through Sync). */

const C = Core;
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const faD = s => String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const fmt = n => Math.round(C.num(n)).toLocaleString('fa-IR');
const fq = n => { const v = C.num(n); return (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : C.round(v, 1)).toLocaleString('fa-IR'); };
const hm = h => { const t = Math.round(C.num(h) * 60); return `${Math.floor(t / 60).toLocaleString('fa-IR')}:${faD(String(t % 60).padStart(2, '0'))}`; };
const jd = iso => faD(esc(C.jOfIso(iso)));
const jdt = iso => { if (!iso) return '—'; const d = new Date(iso); return `${jd(isoLocal(d))} ${faD(String(d.getHours()).padStart(2, '0'))}:${faD(String(d.getMinutes()).padStart(2, '0'))}`; };
const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const opt = (list, val, ph = '— انتخاب کنید —') => (ph === null ? '' : `<option value="">${ph}</option>`) + list.map(o => {
  const v = typeof o === 'string' ? o : o.v, t = typeof o === 'string' ? o : o.t;
  return `<option value="${esc(v)}"${String(v) === String(val ?? '') ? ' selected' : ''}>${esc(t)}</option>`;
}).join('');
const itemOpts = filter => C.S().items.filter(filter || (() => true)).map(i => ({ v: i.code, t: C.itemLabel(i) }));
const prodOpts = () => C.S().products.map(p => ({ v: p.code, t: C.productLabel(p) }));
const accOpts = () => C.S().accounts.map(a => a.name);
const custOpts = () => C.S().customers.map(c => c.name);
const A = () => Sync.isAdmin();
const me = () => (Sync.user() || {}).name || '';

function toast(msg, bad = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.className = 'toast', bad ? 5000 : 3200);
}
// every change goes through Sync.run (saved on this phone at once, sent to the server in the background)
async function act(type, args, msg) { const r = await Sync.run(type, args); if (msg) toast(msg); render(); return r; }
const field = (label, input, hint = '') => `<label class="fld"><span>${label}</span>${input}${hint ? `<small>${hint}</small>` : ''}</label>`;
const txt = (bind, val, attrs = '') => `<input data-bind="${bind}" value="${esc(val ?? '')}" ${attrs}>`;
const numIn = (bind, val, attrs = '') => `<input data-bind="${bind}" inputmode="decimal" value="${esc(val ?? '')}" ${attrs}>`;
const dateIn = (bind, val) => `<input data-bind="${bind}" data-kind="date" inputmode="numeric" value="${esc(val ?? '')}" placeholder="۱۴۰۵/۰۷/۲۰">`;
const selIn = (bind, list, val, attrs = '', ph) => `<select data-bind="${bind}" ${attrs}>${opt(list, val, ph)}</select>`;
const row = (k, v, cls = '') => `<div class="kv ${cls}"><span>${k}</span><b>${v}</b></div>`;
const card = (title, body, extra = '') => `<section class="card ${extra}">${title ? `<h3>${title}</h3>` : ''}${body}</section>`;

// ------------------------------------------------------------------ drafts
const draft = {};
function newSale() { return { date: C.todayJ(), kind: 'فروش', customer: '', acc: accOpts()[1] || accOpts()[0] || '', disc: '', ship: '', shipPayer: C.SHIP_PAYERS[0], rcv: '', note: '', lines: [{ product: '', qty: '', price: '' }] }; }
function newBuy() { return { date: C.todayJ(), vendor: '', acc: accOpts()[1] || accOpts()[0] || '', ship: '', alloc: 'amount', note: '', lines: [{ item: '', newName: '', newType: '', newColor: '', pkgs: '', perPkg: '', price: '' }] }; }
function newPlate() { return { desc: '', prints: '', h: '', m: '', model: '', fils: [{ item: '', grams: '' }] }; }
function newProd() { return { date: C.todayJ(), product: '', newName: '', cat: '', good: '', fail: '', actualH: '', actualG: '', designH: '', researchH: '', post: '', assm: '', pack: '', saveDef: false, note: '', plates: [newPlate()], accs: [] }; }
function newPay() { return { date: C.todayJ(), customer: '', amount: '', acc: accOpts()[1] || accOpts()[0] || '', inv: '', desc: '' }; }
function newCash() { return { date: C.todayJ(), type: 'پرداخت هزینه', acc: accOpts()[1] || accOpts()[0] || '', amount: '', customer: '', inv: '', expCat: '', hours: '', acc2: '', desc: '' }; }
function newAdj() { return { date: C.todayJ(), type: C.ADJ_TYPES[0], inv: '', product: '', item: '', qty: '', reason: '', rmode: C.REFUND_MODES[1], acc: '', note: '' }; }
function newUser() { return { name: '', full: '', role: 'staff', pw: '' }; }
function resetDraft(k) { draft[k] = { sale: newSale, buy: newBuy, prod: newProd, pay: newPay, cash: newCash, adj: newAdj, user: newUser }[k](); }
const resetAll = () => ['sale', 'buy', 'prod', 'pay', 'cash', 'adj', 'user'].forEach(resetDraft);

function getPath(path) { return path.split('.').reduce((o, k) => o == null ? o : o[k], draft); }
function setPath(path, value) {
  const keys = path.split('.'); const last = keys.pop();
  const obj = keys.reduce((o, k) => o[k], draft); obj[last] = value;
}
const hoursOf = (h) => { // accepts 7:48, ۷:۴۸ or 7.8
  const s = C.toEnDigits(h).trim(); if (!s) return 0;
  const m = s.match(/^(\d+)[:٫.,](\d{1,2})$/); if (m && s.includes(':')) return +m[1] + +m[2] / 60;
  return C.num(s);
};

// ------------------------------------------------------------------ routing and permissions
let route = null, sub = null;
const NAV_ADMIN = [['dash', 'داشبورد', '▦'], ['sale', 'فروش', '₸'], ['prod', 'تولید', '⬢'], ['buy', 'خرید', '⇩'], ['more', 'بیشتر', '☰']];
const NAV_STAFF = [['sale', 'فروش', '₸'], ['prod', 'تولید', '⬢'], ['buy', 'خرید', '⇩'], ['invoices', 'فاکتورها', '▤'], ['more', 'بیشتر', '☰']];
const MORE = [ // [route, title, adminOnly]
  ['pay', 'دریافت بدهی مشتری'], ['cash', 'هزینه، انتقال و سایر'], ['adj', 'مرجوعی و ضایعات'], ['invoices', 'فاکتورها و PDF'],
  ['docs', 'همه اسناد (حذف سند اشتباه)'], ['items', 'کالاها و انبار مواد'], ['products', 'محصولات و پلیت‌ها'], ['customers', 'مشتریان و بدهی‌ها'],
  ['accounts', 'حساب‌ها و گردش', 1], ['assets', 'دارایی‌ها و تجهیزات', 1], ['settings', 'تنظیمات و نرخ‌ها', 1], ['users', 'کاربران و کد اتصال', 1],
  ['backup', 'پشتیبان‌گیری و خروجی Excel', 1], ['account', 'حساب کاربری من و همگام‌سازی']
];
const allowed = r => A() || !(r === 'dash' || MORE.some(m => m[0] === r && m[2]));
const homeRoute = () => A() ? 'dash' : 'sale';
function go(r, s = null) { route = allowed(r) ? r : homeRoute(); sub = s; render(); window.scrollTo(0, 0); }

function render() {
  updateBadge();
  if (!Sync.conn() || !C.S() || !Sync.user()) { renderAuth(); return; }
  document.body.classList.remove('auth');
  if (!route || !allowed(route)) route = homeRoute();
  const nav = A() ? NAV_ADMIN : NAV_STAFF;
  const titleOf = { dash: 'داشبورد', sale: 'فروش و هدیه', prod: 'ثبت تولید', buy: 'ثبت خرید', more: 'منو' };
  MORE.forEach(([k, t]) => titleOf[k] = t);
  $('#title').textContent = titleOf[route] || '';
  $('#back').hidden = !(MORE.some(m => m[0] === route) && !nav.some(n => n[0] === route)) && !sub;
  $('#nav').hidden = false;
  $('#nav').innerHTML = nav.map(([k, t, i]) => `<button data-go="${k}" class="${route === k || (k === 'more' && !nav.some(n => n[0] === route) && MORE.some(m => m[0] === route)) ? 'on' : ''}"><i>${i}</i>${t}</button>`).join('');
  const pages = { dash: pgDash, sale: pgSale, prod: pgProd, buy: pgBuy, more: pgMore, pay: pgPay, cash: pgCash, adj: pgAdj, invoices: pgInvoices, docs: pgDocs,
    items: pgItems, products: pgProducts, customers: pgCustomers, accounts: pgAccounts, assets: pgAssets, settings: pgSettings, users: pgUsers, backup: pgBackup, account: pgAccount };
  $('#main').innerHTML = pages[route]();
  refreshLive();
  if (route === 'invoices' && sub) { const inv = C.S().invoices.find(i => i.no === sub); if (inv) setTimeout(() => pdfFor(inv).catch(() => {}), 50); }
}

// live summaries (re-rendered without touching inputs)
function refreshLive() {
  document.querySelectorAll('[data-live]').forEach(el => { const f = LIVE[el.dataset.live]; if (f) el.innerHTML = f(); });
}
const LIVE = {};

// sync badge in the header
function updateBadge() {
  const b = $('#sync'); if (!b) return;
  const i = Sync.info(), on = !!(Sync.conn() && Sync.user());
  b.hidden = !on;
  const map = { ok: ['ok', 'همگام'], idle: ['wait', 'همگام'], sync: ['wait', 'ارسال…'], pending: ['wait', `${fq(i.pending)} در صف`], offline: ['off', 'آفلاین'], error: ['bad', 'خطا'] };
  let [cls, label] = map[i.status] || map.idle;
  if (i.pending && i.status !== 'sync') { cls = i.status === 'error' ? 'bad' : i.status === 'offline' ? 'off' : 'wait'; label = `${fq(i.pending)} در صف`; }
  b.className = 'syncb ' + cls; b.innerHTML = `<i></i>${label}`;
}

// ------------------------------------------------------------------ login and first setup
const auth = { mode: 'code', code: '', owner: '', repo: 'voxara-data', token: '', name: '', full: '', pw: '', pw2: '', backup: null, busy: false, step: '' };
const apiOverride = new URLSearchParams(location.search).get('api') || '';
function renderAuth() {
  document.body.classList.add('auth');
  $('#nav').hidden = true; $('#back').hidden = true;
  const conn = Sync.conn();
  let body;
  if (conn && C.S()) {
    $('#title').textContent = 'ورود';
    body = card('ورود به Voxara.3d', `
      ${field('نام کاربری', `<input data-auth="name" value="${esc(auth.name)}" autocomplete="username" autocapitalize="off">`)}
      ${field('رمز', `<input data-auth="pw" type="password" value="${esc(auth.pw)}" autocomplete="current-password">`)}
      <div class="actions"><button class="primary" data-act="login">ورود</button></div>
      <p class="muted">متصل به ${esc(conn.owner)}/${esc(conn.repo)}</p>
      <button class="link danger" data-act="forget">قطع اتصال این گوشی</button>`);
  } else if (conn && !C.S()) {
    $('#title').textContent = 'دریافت داده';
    body = card('دریافت داده از سرور', `<p class="muted">${auth.busy ? 'در حال دریافت…' : esc(auth.step || 'برای ادامه اینترنت لازم است.')}</p>
      <div class="actions"><button class="primary" data-act="refetch">دوباره امتحان کن</button></div><button class="link danger" data-act="forget">قطع اتصال</button>`);
  } else if (auth.step === 'create') {
    $('#title').textContent = 'راه‌اندازی';
    body = card('ساخت پایگاه داده', `
      <p class="muted">مخزن خالی است. اولین کاربر ادمین را بسازید. اگر از نسخه قبلی برنامه فایل پشتیبان دارید، انتخاب کنید تا داده‌ها منتقل شود.</p>
      <div class="grid2">${field('نام کاربری ادمین', `<input data-auth="name" value="${esc(auth.name)}" autocapitalize="off">`)}${field('نام و نام خانوادگی', `<input data-auth="full" value="${esc(auth.full)}">`)}</div>
      <div class="grid2">${field('رمز (حداقل ۶ حرف)', `<input data-auth="pw" type="password" value="${esc(auth.pw)}" autocomplete="new-password">`)}${field('تکرار رمز', `<input data-auth="pw2" type="password" value="${esc(auth.pw2)}" autocomplete="new-password">`)}</div>
      <label class="ghost filebtn">${auth.backup ? '✓ فایل پشتیبان انتخاب شد' : 'انتخاب فایل پشتیبان (اختیاری)'}<input type="file" accept=".json,application/json" id="authBackup" hidden></label>
      <div class="actions"><button class="primary" data-act="createDb" ${auth.busy ? 'disabled' : ''}>${auth.busy ? 'در حال ساخت…' : 'ساخت پایگاه داده'}</button><button class="ghost" data-act="authBack">بازگشت</button></div>`);
  } else {
    $('#title').textContent = 'اتصال';
    body = `<div class="seg">${[['code', 'کد اتصال دارم'], ['setup', 'راه‌اندازی اول (ادمین)']].map(([k, t]) => `<button data-act="authMode" data-v="${k}" class="${auth.mode === k ? 'on' : ''}">${t}</button>`).join('')}</div>` +
      (auth.mode === 'code' ? card('اتصال با کد', `
        <p class="muted">کد اتصال را ادمین از منوی «کاربران و کد اتصال» برایتان می‌فرستد.</p>
        ${field('کد اتصال', `<textarea data-auth="code" rows="4" dir="ltr" autocapitalize="off" spellcheck="false">${esc(auth.code)}</textarea>`)}
        <div class="actions"><button class="primary" data-act="connCode" ${auth.busy ? 'disabled' : ''}>${auth.busy ? 'در حال اتصال…' : 'اتصال'}</button></div>`)
      : card('راه‌اندازی اول', `
        <p class="muted">یک مخزن Private در GitHub بسازید (مثلاً voxara-data) و یک توکن Fine-grained با دسترسی Contents: Read and write فقط روی همان مخزن. مراحل در راهنما آمده است.</p>
        ${field('نام کاربری GitHub', `<input data-auth="owner" value="${esc(auth.owner)}" dir="ltr" autocapitalize="off">`)}
        ${field('نام مخزن داده', `<input data-auth="repo" value="${esc(auth.repo)}" dir="ltr" autocapitalize="off">`)}
        ${field('توکن (github_pat_...)', `<input data-auth="token" value="${esc(auth.token)}" dir="ltr" autocapitalize="off" spellcheck="false">`)}
        <div class="actions"><button class="primary" data-act="connSetup" ${auth.busy ? 'disabled' : ''}>${auth.busy ? 'در حال بررسی…' : 'بررسی و اتصال'}</button></div>`));
  }
  $('#main').innerHTML = `<div class="authlogo"><img src="icons/logo.png" alt="Voxara.3d"><small>حسابداری چاپ سه‌بعدی</small></div>` + body;
}
async function connectWith(c) {
  if (apiOverride) c.api = apiOverride;
  auth.busy = true; renderAuth();
  try {
    const r = await Sync.testRepo(c);
    if (r.exists) { await Sync.connect(c, r); auth.step = ''; toast('متصل شد. وارد شوید.'); }
    else { auth.pending = c; auth.step = 'create'; }
  } finally { auth.busy = false; render(); }
}

// ------------------------------------------------------------------ dashboard (admin)
function pgDash() {
  const d = C.dashboard(), p = d.p;
  const kpi = (t, v, s, cls) => `<div class="kpi ${cls}"><span>${t}</span><b>${v}</b><small>${s}</small></div>`;
  const maxM = Math.max(1, ...d.months.map(m => Math.abs(m.net)));
  const bars = d.months.map(m => `<div class="bar"><i style="height:${Math.round(Math.abs(m.net) / maxM * 100)}%"></i><em style="height:${Math.round(Math.max(0, m.gp) / maxM * 100)}%"></em><span>${m.name.slice(0, 3)}</span></div>`).join('');
  const list = (rows, f) => rows.length ? rows.map(f).join('') : '<p class="muted">موردی نیست.</p>';
  return `
  <div class="kpis">
    ${kpi('فروش خالص', fmt(p.net), `${fq(p.invoices)} فاکتور`, 'g')}
    ${kpi('سود ناخالص', fmt(p.gp), `حاشیه ${p.net ? Math.round(p.gp / p.net * 100).toLocaleString('fa-IR') : '۰'}٪`, 't')}
    ${kpi('سود خالص', fmt(p.np), 'بعد از هزینه‌ها و ضایعات', p.np < 0 ? 'r' : 'p')}
    ${kpi('موجودی نقد', fmt(d.cashTotal), `${fq(C.S().accounts.length)} حساب`, 'b')}
    ${kpi('مطالبات', fmt(d.receivables), `${fq(d.debtors.length)} مشتری بدهکار`, 'r')}
    ${kpi('انبار مواد', fmt(d.matValue), `${fq(d.filKg)} کیلو فیلامنت`, 'o')}
    ${kpi('انبار محصول', fmt(d.prodValue), 'به بهای روز', 'c')}
    ${kpi('خرابی و ضایعات', fmt(p.waste), `${fq(d.wasteG)} گرم پرت و خرابی`, 'o')}
  </div>
  ${card(`سال ${faD(d.year)}: فروش خالص و سود ناخالص ماهانه`, `<div class="bars">${bars}</div><div class="legend"><span class="l1">فروش خالص</span><span class="l2">سود ناخالص</span></div>`)}
  ${card('سود و زیان (از ابتدا)', [
    row('فروش ناخالص', fmt(p.gross)), row('تخفیف‌ها', fmt(p.disc)), row('مرجوعی‌ها', fmt(p.returns)), row('فروش خالص', fmt(p.net), 'hl'),
    row('بهای تمام‌شده فروش', fmt(p.cogs)), row('سود ناخالص', fmt(p.gp), 'hl'), row('هزینه‌های جاری', fmt(p.expenses)), row('ارزش زمان', fmt(p.timeVal)),
    row('هدایا', fmt(p.giftCost)), row('خرابی و ضایعات', fmt(p.waste)), row('استهلاک تجهیزات عمومی', fmt(p.dep)), row('سود خالص', fmt(p.np), 'hl')].join(''))}
  ${card('بیشترین بدهی', list(d.debtors, x => row(esc(x.name), fmt(x.debt), 'r')))}
  ${card('پرفروش‌ترین محصولات', list(d.topProducts, x => row(esc(x.name), `${fq(x.sold)} عدد | ${fmt(x.rev)}`)))}
  ${card('بهترین مشتریان', list(d.topCustomers, x => row(esc(x.name), fmt(x.net))))}
  ${card('کالاهای رو به اتمام', list(d.lowStock, i => row(esc(C.itemLabel(i)), `${fq(C.itemStock(i.code))} ${esc(i.unit)}`, 'r')))}
  ${card('زمان', row('ساعت چاپ کل', hm(p.hours)) + row('فیلامنت مصرفی', `${fq(d.usedG / 1000)} کیلوگرم`))}`;
}

// ------------------------------------------------------------------ sale
function pgSale() {
  const f = draft.sale, gift = f.kind === 'هدیه', adm = A();
  const lines = f.lines.map((l, i) => `
    <div class="line">
      ${field('محصول', selIn(`sale.lines.${i}.product`, prodOpts(), l.product, 'data-rerender'))}
      <div class="grid2">
        ${field('تعداد', numIn(`sale.lines.${i}.qty`, l.qty))}
        ${gift ? '' : field('قیمت توافقی (اختیاری)', numIn(`sale.lines.${i}.price`, l.price, 'placeholder="خالی = قیمت پیشنهادی"'))}
      </div>
      <div class="lineinfo" data-live="saleLine${i}"></div>
      ${f.lines.length > 1 ? `<button class="link danger" data-act="delLine" data-k="sale" data-i="${i}">حذف ردیف</button>` : ''}
    </div>`).join('');
  f.lines.forEach((_, i) => LIVE['saleLine' + i] = () => {
    const src = draft.sale.lines[i]; if (!src.product) return '';
    const pv = C.salePreview(draft.sale);
    const x = pv.lines[draft.sale.lines.slice(0, i + 1).filter(y => y.product).length - 1];
    return x ? `موجودی: <b class="${C.num(src.qty) > x.stock ? 'neg' : ''}">${fq(x.stock)}</b> | قیمت: <b>${fmt(x.price)}</b> | مبلغ: <b>${fmt(x.amount)}</b>${adm ? ` | سود: <b>${fmt(x.amount - x.cost)}</b>` : ''}` : '';
  });
  LIVE.saleSum = () => {
    const pv = C.salePreview(draft.sale);
    return [row('جمع اقلام', fmt(pv.gross)), gift ? '' : row('تخفیف', fmt(pv.disc)), pv.shipIn ? row('ارسال اضافه به فاکتور', fmt(pv.shipIn)) : '',
      row('مبلغ کل فاکتور', fmt(pv.total), 'hl'), gift ? '' : row('پرداختی همین الان', fmt(pv.rcv)), gift ? '' : row('مانده (نسیه)', fmt(pv.remain), pv.remain > 0 ? 'r' : ''),
      draft.sale.customer ? row('بدهی کل مشتری بعد از ثبت', fmt(pv.debtAfter), 'r') : '',
      adm ? row('بهای تمام‌شده', fmt(pv.cogs)) : '', adm ? row('سود این فاکتور', fmt(pv.profit), pv.profit < 0 ? 'r' : 'hl') : ''].join('');
  };
  return `
  ${card('', `
    <div class="seg">${['فروش', 'هدیه'].map(k => `<button data-act="setKind" data-v="${k}" class="${f.kind === k ? 'on' : ''}">${k}</button>`).join('')}</div>
    <div class="grid2">${field('تاریخ', dateIn('sale.date', f.date))}${field(gift ? 'گیرنده هدیه' : 'مشتری', txt('sale.customer', f.customer, 'list="custList" autocomplete="off"'))}</div>
    <datalist id="custList">${custOpts().map(c => `<option value="${esc(c)}">`).join('')}</datalist>`)}
  ${card('اقلام', lines + `<button class="ghost" data-act="addLine" data-k="sale">+ افزودن محصول</button>`)}
  ${gift ? '' : card('پرداخت و ارسال', `
    <div class="grid2">${field('مبلغ پرداختی مشتری همین الان', numIn('sale.rcv', f.rcv), 'خالی یا صفر = نسیه')}${field('حساب واریز', selIn('sale.acc', accOpts(), f.acc))}</div>
    <div class="grid2">${field('تخفیف کل فاکتور', numIn('sale.disc', f.disc))}${field('هزینه ارسال', numIn('sale.ship', f.ship))}</div>
    ${field('پرداخت‌کننده ارسال', selIn('sale.shipPayer', C.SHIP_PAYERS, f.shipPayer))}
    ${field('توضیحات', txt('sale.note', f.note))}`)}
  ${card('خلاصه', `<div data-live="saleSum"></div>`)}
  <div class="actions"><button class="primary" data-act="saveSale">ثبت ${f.kind}</button><button class="ghost" data-act="reset" data-k="sale">پاک‌کردن</button></div>`;
}

// ------------------------------------------------------------------ purchase
function pgBuy() {
  const f = draft.buy;
  const lines = f.lines.map((l, i) => {
    const isNew = !l.item;
    return `<div class="line">
      ${field('کالا', selIn(`buy.lines.${i}.item`, itemOpts(), l.item, 'data-rerender', '+ کالای جدید'))}
      ${isNew ? `<div class="grid3">${field('نام کالای جدید', txt(`buy.lines.${i}.newName`, l.newName))}${field('نوع', selIn(`buy.lines.${i}.newType`, C.ITEM_TYPES, l.newType))}${field('رنگ', txt(`buy.lines.${i}.newColor`, l.newColor))}</div>` : ''}
      <div class="grid3">${field('تعداد (قرقره / بسته)', numIn(`buy.lines.${i}.pkgs`, l.pkgs))}${field('مقدار هر بسته', numIn(`buy.lines.${i}.perPkg`, l.perPkg, 'placeholder="خالی = ۱ کیلو یا ۱ عدد"'))}${field('قیمت هر بسته', numIn(`buy.lines.${i}.price`, l.price))}</div>
      <div class="lineinfo" data-live="buyLine${i}"></div>
      ${f.lines.length > 1 ? `<button class="link danger" data-act="delLine" data-k="buy" data-i="${i}">حذف ردیف</button>` : ''}
    </div>`;
  }).join('');
  f.lines.forEach((_, i) => LIVE['buyLine' + i] = () => {
    const pv = C.purchasePreview(draft.buy); const src = draft.buy.lines[i];
    if (!src.item && !src.newName) return '';
    const idx = draft.buy.lines.slice(0, i + 1).filter(l => l.item || (l.newName || '').trim()).length - 1; const x = pv.lines[idx];
    if (!x) return '';
    const unit = src.item ? C.itemPriceUnit(C.itemBy(src.item)) : (src.newType === 'فیلامنت' ? 'کیلوگرم' : 'عدد');
    return `مبلغ: <b>${fmt(x.amount)}</b> | سهم ارسال: <b>${fmt(x.shipShare)}</b> | بهای هر ${unit}: <b>${fmt(x.unitPrice)}</b>${x.current ? ` | قیمت فعلی: ${fmt(x.current)}` : ' | کالای جدید'}`;
  });
  LIVE.buySum = () => { const pv = C.purchasePreview(draft.buy); const bal = draft.buy.acc ? C.accountCalc(draft.buy.acc).bal : 0;
    return row('مبلغ کالا', fmt(pv.goods)) + row('هزینه ارسال', fmt(pv.ship)) + row('جمع پرداختی', fmt(pv.total), 'hl') +
      (A() ? row('موجودی حساب بعد از خرید', fmt(bal - pv.total), bal - pv.total < 0 ? 'r' : '') : ''); };
  return `
  ${card('', `<div class="grid2">${field('تاریخ', dateIn('buy.date', f.date))}${field('فروشنده', txt('buy.vendor', f.vendor))}</div>
    <div class="grid2">${field('حساب پرداخت', selIn('buy.acc', accOpts(), f.acc))}${field('هزینه ارسال کل', numIn('buy.ship', f.ship))}</div>
    ${field('تقسیم هزینه ارسال', selIn('buy.alloc', [{ v: 'amount', t: 'بر اساس مبلغ' }, { v: 'qty', t: 'بر اساس مقدار' }], f.alloc, '', null))}`)}
  ${card('اقلام', lines + `<button class="ghost" data-act="addLine" data-k="buy">+ افزودن کالا</button>`)}
  ${card('خلاصه', `<div data-live="buySum"></div>`)}
  <div class="actions"><button class="primary" data-act="saveBuy">ثبت خرید</button><button class="ghost" data-act="reset" data-k="buy">پاک‌کردن</button></div>`;
}

// ------------------------------------------------------------------ production
function prodForm() { // draft.prod with hours parsed
  const f = draft.prod;
  return { ...f, actualH: hoursOf(f.actualH), designH: hoursOf(f.designH), researchH: hoursOf(f.researchH),
    plates: f.plates.map(p => ({ ...p })), accs: f.accs.map(a => ({ ...a })) };
}
function pgProd() {
  const f = draft.prod, isNew = !f.product;
  const plates = f.plates.map((pl, i) => `
    <div class="line">
      <div class="grid2">${field('شرح پلیت', txt(`prod.plates.${i}.desc`, pl.desc, `placeholder="پلیت ${(i + 1).toLocaleString('fa-IR')}"`))}${field('تعداد چاپ این پلیت', numIn(`prod.plates.${i}.prints`, pl.prints))}</div>
      <div class="grid3">${field('زمان: ساعت', numIn(`prod.plates.${i}.h`, pl.h))}${field('دقیقه', numIn(`prod.plates.${i}.m`, pl.m))}${field('وزن مدل‌ها (Model)', numIn(`prod.plates.${i}.model`, pl.model))}</div>
      ${pl.fils.map((fl, j) => `<div class="grid2 fil">${field(`فیلامنت ${(j + 1).toLocaleString('fa-IR')}`, selIn(`prod.plates.${i}.fils.${j}.item`, itemOpts(C.isFil), fl.item))}${field('گرم (Total)', numIn(`prod.plates.${i}.fils.${j}.grams`, fl.grams))}</div>`).join('')}
      <div class="row-btns">${pl.fils.length < 4 ? `<button class="link" data-act="addFil" data-i="${i}">+ فیلامنت دیگر روی همین پلیت</button>` : ''}
      ${f.plates.length > 1 ? `<button class="link danger" data-act="delPlate" data-i="${i}">حذف پلیت</button>` : ''}</div>
    </div>`).join('');
  const accs = f.accs.map((a, i) => `<div class="grid2 line">${field('کالا', selIn(`prod.accs.${i}.item`, itemOpts(x => !C.isFil(x)), a.item))}${field('تعداد کل مصرف‌شده', numIn(`prod.accs.${i}.qty`, a.qty))}<button class="link danger" data-act="delAcc" data-i="${i}">حذف</button></div>`).join('');
  LIVE.prodSum = () => {
    const pv = C.productionPreview(prodForm()), s = C.S().settings;
    const base = [row('تعداد کل چاپ پلیت‌ها', fq(pv.prints)), row('زمان برآورد Bambu', hm(pv.estH)), row('زمان چاپ محاسبه‌شده', hm(pv.hrs)),
      row('فیلامنت مصرفی', `${fq(pv.grams)} گرم`), row('پرت (Purge و Tower)', `${fq(pv.wasteG)} گرم`), row('زمان کار', hm(pv.labH))];
    if (!A()) return base.join('');
    return [...base, row('بهای مواد و اکسسوری', fmt(pv.matCost)), row('بهای دستگاه و برق', fmt(pv.mac)), row('بهای نیروی انسانی', fmt(pv.lab)), row('بهای طراحی و بررسی', fmt(pv.des)),
      row('بهای کل تولید', fmt(pv.total), 'hl'), row('بهای محصولات خراب', fmt(pv.failCost), 'r'), row('بهای هر محصول سالم', fmt(pv.unit), 'hl'),
      row(`قیمت با سود ${Math.round(s.markup1 * 100).toLocaleString('fa-IR')}٪`, fmt(pv.p1)), row(`قیمت با سود ${Math.round(s.markup2 * 100).toLocaleString('fa-IR')}٪`, fmt(pv.p2))].join('');
  };
  return `
  ${card('', `
    ${field('محصول', selIn('prod.product', prodOpts(), f.product, 'data-rerender', '+ محصول جدید'))}
    ${isNew ? `<div class="grid2">${field('نام محصول جدید', txt('prod.newName', f.newName))}${field('دسته', selIn('prod.cat', C.S().lists.productCats, f.cat))}</div>` : ''}
    <div class="grid3">${field('تاریخ', dateIn('prod.date', f.date))}${field('تعداد سالم', numIn('prod.good', f.good))}${field('تعداد خراب', numIn('prod.fail', f.fail))}</div>
    ${isNew ? '' : `<button class="ghost wide" data-act="loadDef">بارگذاری پلیت‌ها و اکسسوری‌ها از تعریف محصول</button>`}`)}
  ${card('پلیت‌ها (هر پلیت تا ۴ فیلامنت)', plates + `<button class="ghost" data-act="addPlate">+ افزودن پلیت</button>`)}
  ${card('اکسسوری، بسته‌بندی و اقلام مصرفی', (accs || '<p class="muted">اگر آهن‌ربا، پین، کیسه و ... مصرف شده اضافه کنید.</p>') + `<button class="ghost" data-act="addAcc">+ افزودن قلم</button>`)}
  ${card('زمان کار و جزئیات', `
    <div class="grid3">${field('پس‌پردازش هر محصول (دقیقه)', numIn('prod.post', f.post))}${field('مونتاژ و پرداخت (دقیقه)', numIn('prod.assm', f.assm))}${field('بسته‌بندی (دقیقه)', numIn('prod.pack', f.pack))}</div>
    <div class="grid2">${field('زمان طراحی', txt('prod.designH', f.designH, 'inputmode="numeric" placeholder="مثلاً 1:30"'))}${field('زمان بررسی و جستجو', txt('prod.researchH', f.researchH, 'inputmode="numeric" placeholder="مثلاً 0:45"'))}</div>
    <div class="grid2">${field('زمان واقعی کل چاپ (اختیاری)', txt('prod.actualH', f.actualH, 'inputmode="numeric" placeholder="مثلاً 17:10"'))}${field('وزن واقعی فیلامنت (گرم، اختیاری)', numIn('prod.actualG', f.actualG))}</div>
    ${isNew || !A() ? '' : `<label class="chk"><input type="checkbox" data-bind="prod.saveDef" ${f.saveDef ? 'checked' : ''}> این اعداد در تعریف محصول ذخیره شود</label>`}
    ${field('توضیحات / مشتری', txt('prod.note', f.note))}`)}
  ${card('نتیجه محاسبه', `<div data-live="prodSum"></div>`)}
  <div class="actions"><button class="primary" data-act="saveProd">ثبت تولید</button><button class="ghost" data-act="reset" data-k="prod">پاک‌کردن</button></div>`;
}

// ------------------------------------------------------------------ payment from customer
function pgPay() {
  const f = draft.pay;
  const invs = C.S().invoices.filter(i => i.customer === f.customer && !C.invoiceCalc(i).settled).map(i => ({ v: i.no, t: `${i.no} | مانده ${fmt(C.invoiceCalc(i).due)}` }));
  LIVE.paySum = () => { if (!draft.pay.customer) return ''; const d = C.customerCalc(draft.pay.customer).debt;
    return row('بدهی فعلی', fmt(d), 'r') + row('بدهی بعد از این دریافت', fmt(d - C.num(draft.pay.amount)), 'hl'); };
  return `${card('', `
    <p class="muted">پولی که مشتری بعد از خرید می‌آورد اینجا ثبت می‌شود. پرداخت هنگام خرید در خود فرم فروش وارد می‌شود.</p>
    ${field('مشتری', selIn('pay.customer', custOpts(), f.customer, 'data-rerender'))}
    <div class="grid2">${field('تاریخ', dateIn('pay.date', f.date))}${field('مبلغ دریافتی', numIn('pay.amount', f.amount))}</div>
    <div class="grid2">${field('حساب واریز', selIn('pay.acc', accOpts(), f.acc))}${field('فاکتور (اختیاری)', selIn('pay.inv', invs, f.inv, '', '— همه بدهی —'))}</div>
    ${field('توضیحات', txt('pay.desc', f.desc))}
    <div data-live="paySum"></div>`)}
  <div class="actions"><button class="primary" data-act="savePay">ثبت دریافت</button></div>`;
}

// ------------------------------------------------------------------ other cash entries
function pgCash() {
  const f = draft.cash, types = C.CASH_TYPES.filter(t => t.manual && t.type !== 'دریافت از مشتری' && (A() || !['آورده سرمایه', 'برداشت مالک', 'خرید دارایی'].includes(t.type))).map(t => t.type);
  const recent = C.S().cash.filter(c => A() || c.by === me()).slice(-8).reverse();
  return `${card('', `
    ${field('نوع', selIn('cash.type', types, f.type, 'data-rerender'))}
    <div class="grid2">${field('تاریخ', dateIn('cash.date', f.date))}${field('مبلغ', numIn('cash.amount', f.amount))}</div>
    <div class="grid2">${field(f.type === 'انتقال بین حساب‌ها' ? 'از حساب' : 'حساب', selIn('cash.acc', accOpts(), f.acc))}
    ${f.type === 'انتقال بین حساب‌ها' ? field('به حساب', selIn('cash.acc2', accOpts(), f.acc2)) : ''}
    ${f.type === 'پرداخت هزینه' ? field('دسته هزینه', selIn('cash.expCat', C.S().lists.expCats, f.expCat)) : ''}</div>
    ${f.type === 'پرداخت هزینه' ? field('زمان صرف‌شده (مثلاً 2:30، اختیاری)', txt('cash.hours', f.hours, 'inputmode="numeric"'), 'برای تبلیغات و مدیریت شبکه‌های اجتماعی؛ ارزش زمان در سود و زیان می‌آید') : ''}
    ${field('شرح', txt('cash.desc', f.desc))}`)}
  <div class="actions"><button class="primary" data-act="saveCash">ثبت</button></div>
  ${card(A() ? 'آخرین موارد' : 'آخرین ثبت‌های من', recent.map(c => row(`${jd(c.date)} | ${esc(c.type)}`, `${fmt(c.amount)} | ${esc(c.acc)}`)).join('') || '<p class="muted">هنوز چیزی ثبت نشده.</p>')}`;
}

// ------------------------------------------------------------------ returns & waste
function pgAdj() {
  const f = draft.adj, isRet = f.type === C.ADJ_TYPES[0] || f.type === C.ADJ_TYPES[1], isMat = f.type === C.ADJ_TYPES[3];
  const inv = C.S().invoices.find(i => i.no === f.inv);
  const prodList = isRet ? (inv ? [...new Set(inv.lines.map(l => l.product))].map(c => ({ v: c, t: C.productLabel(C.productBy(c)) })) : []) : prodOpts();
  LIVE.adjSum = () => {
    const pv = C.adjustmentPreview(draft.adj);
    if (isRet) return row('مشتری', esc(pv.customer) || '—') + row('فروخته‌شده در این فاکتور', fq(pv.soldQ)) + row('قابل مرجوع', fq(pv.returnable)) +
      row('قیمت هر قطعه', fmt(pv.unitPrice)) + row('ارزش برگشتی', fmt(pv.value), 'hl') + row('اعتبار مشتری', fmt(pv.credit)) + row('استرداد نقدی', fmt(pv.refund));
    return row('موجودی فعلی', `${fq(pv.stockNow)} ${esc(pv.unit)}`) + (A() ? row('ارزش ضایعات', fmt(pv.cost), 'r') : '');
  };
  return `${card('', `
    ${field('نوع', selIn('adj.type', C.ADJ_TYPES, f.type, 'data-rerender'))}
    ${field('تاریخ', dateIn('adj.date', f.date))}
    ${isRet ? field('شماره فاکتور', selIn('adj.inv', C.S().invoices.filter(i => i.kind !== 'هدیه').slice().reverse().map(i => ({ v: i.no, t: `${i.no} | ${i.customer}` })), f.inv, 'data-rerender')) : ''}
    ${isMat ? field('کالای مواد اولیه', selIn('adj.item', itemOpts(), f.item, 'data-rerender'), 'فیلامنت، آهن‌ربا، پین، بسته‌بندی و ...') : field('محصول', selIn('adj.product', prodList, f.product, 'data-rerender'), isRet ? 'فقط محصولات همین فاکتور' : '')}
    ${field(isMat ? 'مقدار (گرم یا عدد)' : 'تعداد', numIn('adj.qty', f.qty))}
    ${isRet ? `<div class="grid2">${field('استرداد وجه', selIn('adj.rmode', C.REFUND_MODES, f.rmode, 'data-rerender'))}${f.rmode === C.REFUND_MODES[0] ? field('از حساب', selIn('adj.acc', accOpts(), f.acc)) : ''}</div>` : ''}
    ${field('دلیل', selIn('adj.reason', C.S().lists.reasons, f.reason))}
    ${field('توضیحات', txt('adj.note', f.note))}
    <div data-live="adjSum"></div>`)}
  <div class="actions"><button class="primary" data-act="saveAdj">ثبت</button></div>`;
}

// ------------------------------------------------------------------ invoices, PDF
function invoiceHtml(inv) {
  const s = C.S().settings, c = C.invoiceCalc(inv), cust = C.S().customers.find(x => x.name === inv.customer) || {};
  const brand = /^voxara\.?3d$/i.test(String(s.bizName || '').trim());
  return `<div class="invoice" id="printArea">
    <img class="inv-logo" src="icons/logo.png" alt="Voxara.3d">${brand ? '' : `<h2>${esc(s.bizName)}</h2>`}${s.bizInfo ? `<p class="center muted">${esc(s.bizInfo)}</p>` : ''}
    <div class="inv-head"><b>${inv.kind === 'هدیه' ? 'حواله هدیه' : 'فاکتور فروش'}</b><span>شماره: ${esc(inv.no)}</span><span>تاریخ: ${jd(inv.date)}</span></div>
    <div class="inv-head"><span>مشتری: ${esc(inv.customer)}</span>${cust.phone ? `<span>تلفن: ${esc(cust.phone)}</span>` : ''}</div>
    <table><thead><tr><th>ردیف</th><th>شرح کالا</th><th>تعداد</th><th>قیمت واحد</th><th>مبلغ</th></tr></thead>
    <tbody>${inv.lines.map((l, i) => `<tr><td>${(i + 1).toLocaleString('fa-IR')}</td><td>${esc(l.name)}</td><td>${fq(l.qty)}</td><td>${fmt(l.price)}</td><td>${fmt(l.qty * l.price)}</td></tr>`).join('')}</tbody></table>
    <div class="inv-tot">${row('جمع اقلام', fmt(inv.gross))}${inv.disc ? row('تخفیف', fmt(inv.disc)) : ''}${inv.shipIn ? row('هزینه ارسال', fmt(inv.shipIn)) : ''}
    ${row('مبلغ قابل پرداخت', fmt(inv.total), 'hl')}${row('پرداخت‌شده', fmt(c.rcv))}${c.credit ? row('مرجوعی', fmt(c.credit)) : ''}${row('مانده', fmt(c.due), c.due > 0 ? 'r' : '')}</div>
    ${inv.note ? `<p>توضیحات: ${esc(inv.note)}</p>` : ''}<p class="center muted">با سپاس از خرید شما</p></div>`;
}
function invoiceText(inv) {
  const c = C.invoiceCalc(inv);
  return `${C.S().settings.bizName}\n${inv.kind === 'هدیه' ? 'حواله هدیه' : 'فاکتور'} ${inv.no} - ${C.jOfIso(inv.date)}\nمشتری: ${inv.customer}\n` +
    inv.lines.map(l => `${l.name} × ${l.qty} = ${fmt(l.qty * l.price)}`).join('\n') + `\nمبلغ کل: ${fmt(inv.total)} تومان\nپرداخت‌شده: ${fmt(c.rcv)}\nمانده: ${fmt(c.due)}`;
}
let pdfCache = { key: '', promise: null };
function pdfFor(inv) {  // built once per invoice state, so the share sheet opens right after the tap
  const key = JSON.stringify([inv, C.invoiceCalc(inv), C.S().settings.bizName, C.S().settings.bizInfo]);
  if (pdfCache.key !== key) pdfCache = { key, promise: Pdf.invoice(inv) };
  return pdfCache.promise;
}
const pdfName = inv => `${(C.S().settings.bizName || 'Voxara').replace(/[^\w.\-]+/g, '')}-${inv.no}.pdf`;
function pgInvoices() {
  if (sub) {
    const inv = C.S().invoices.find(i => i.no === sub); if (!inv) { sub = null; return pgInvoices(); }
    return invoiceHtml(inv) + `<div class="actions noprint">
      <button class="primary" data-act="sharePdf" data-no="${esc(inv.no)}">ارسال PDF فاکتور</button>
      ${isNative() ? '' : `<button class="ghost" data-act="savePdf" data-no="${esc(inv.no)}">دانلود PDF</button><button class="ghost" data-act="print">چاپ</button>`}
      <button class="ghost" data-act="shareInv" data-no="${esc(inv.no)}">ارسال متن</button></div>
      ${A() && inv.by ? `<p class="muted noprint">ثبت توسط ${esc(inv.by)} | ${jdt(inv.at)}</p>` : ''}`;
  }
  const list = C.S().invoices.slice().reverse();
  return card('', list.length ? list.map(i => { const c = C.invoiceCalc(i);
    return `<button class="listrow" data-act="openInv" data-no="${esc(i.no)}"><span><b>${esc(i.no)}</b> ${jd(i.date)}<br><small>${esc(i.customer)} ${i.kind === 'هدیه' ? '(هدیه)' : ''}</small></span><span>${fmt(i.total)}<br><small class="${c.due > 0.5 ? 'neg' : 'pos'}">${c.due > 0.5 ? 'مانده ' + fmt(c.due) : 'تسویه'}</small></span></button>`; }).join('') : '<p class="muted">فاکتوری ثبت نشده.</p>');
}

// ------------------------------------------------------------------ documents (undo)
let docUser = '';
function pgDocs() {
  const s = C.S(), docs = [], adm = A();
  const by = x => x.by || '';
  s.purchases.forEach(p => docs.push({ d: p.date, by: by(p), k: 'purchase', key: p.doc, t: `خرید ${p.doc}`, v: fmt(C.sum(p.lines, l => l.amount) + p.ship) }));
  s.productions.forEach(p => docs.push({ d: p.date, by: by(p), k: 'production', key: p.doc, t: `تولید ${p.doc} | ${(C.productBy(p.product) || {}).name || ''}`, v: `${fq(p.good)} سالم` }));
  s.invoices.forEach(i => docs.push({ d: i.date, by: by(i), k: 'invoice', key: i.no, t: `${i.kind} ${i.no} | ${i.customer}`, v: fmt(i.total) }));
  s.cash.filter(c => C.cashDef(c.type).manual).forEach(c => docs.push({ d: c.date, by: by(c), k: 'cash', key: c.id, t: `${c.type} | ${c.customer || c.desc || ''}`, v: fmt(c.amount) }));
  s.adjustments.forEach(a => docs.push({ d: a.date, by: by(a), k: 'adjustment', key: a.id, t: `${a.type}`, v: fq(a.qty) }));
  const shown = docs.filter(x => adm ? (!docUser || x.by === docUser) : x.by === me()).sort((a, b) => b.d.localeCompare(a.d));
  const users = [...new Set(docs.map(x => x.by).filter(Boolean))];
  return card('', `<p class="muted">${adm ? 'همه اسناد همه کاربران.' : 'اسنادی که خودتان ثبت کرده‌اید.'} اگر سندی اشتباه ثبت شد، حذفش کنید و دوباره ثبت کنید. حذف خرید یا فاکتور، دریافت و پرداخت‌های همان سند را هم حذف می‌کند.</p>` +
    (adm ? field('کاربر', `<select id="docUser">${opt(users, docUser, '— همه کاربران —')}</select>`) : '') +
    (shown.map(x => `<div class="listrow"><span>${jd(x.d)} <b>${esc(x.t)}</b>${adm && x.by ? `<br><small>${esc(x.by)}</small>` : ''}</span><span>${x.v} <button class="link danger" data-act="delDoc" data-k="${x.k}" data-key="${esc(x.key)}">حذف</button></span></div>`).join('') || '<p class="muted">سندی نیست.</p>'));
}

// ------------------------------------------------------------------ master data
function pgItems() {
  const s = C.S(), adm = A();
  if (sub && adm) {
    const it = sub === 'new' ? (draft.item ||= { code: '', type: '', name: '', color: '', unit: '', initPrice: '', overridePrice: '', initStock: '', minStock: '' }) : (draft.item ||= { ...C.itemBy(sub) });
    return card(sub === 'new' ? 'کالای جدید' : `ویرایش ${esc(it.code)}`, `
      <div class="grid2">${field('نوع', selIn('item.type', C.ITEM_TYPES, it.type))}${field('نام', txt('item.name', it.name))}</div>
      <div class="grid2">${field('رنگ', txt('item.color', it.color))}${field('واحد', selIn('item.unit', ['گرم', 'عدد', 'متر', 'بسته'], it.unit, '', 'خودکار'))}</div>
      <div class="grid2">${field('قیمت اولیه (هر کیلو یا عدد)', numIn('item.initPrice', it.initPrice))}${field('قیمت روز بازار (اختیاری)', numIn('item.overridePrice', it.overridePrice))}</div>
      <div class="grid2">${field('موجودی اولیه (گرم یا عدد)', numIn('item.initStock', it.initStock))}${field('حداقل موجودی', numIn('item.minStock', it.minStock))}</div>
      <div class="actions"><button class="primary" data-act="saveItem">ذخیره</button><button class="ghost" data-act="cancelSub">انصراف</button></div>`);
  }
  const rowOf = i => {
    const st = C.itemStatus(i.code);
    const inner = `<span><b>${esc(C.itemLabel(i))}</b><br><small>${esc(i.type)}${adm ? ` | ${fmt(C.itemEffPrice(i.code))} هر ${esc(C.itemPriceUnit(i))}` : ''}</small></span><span>${fq(C.itemStock(i.code))} ${esc(i.unit)}<br><small class="${st === 'کافی' ? 'pos' : 'neg'}">${st}</small></span>`;
    return adm ? `<button class="listrow" data-act="editItem" data-code="${esc(i.code)}">${inner}</button>` : `<div class="listrow">${inner}</div>`;
  };
  return (adm ? `<div class="actions"><button class="primary" data-act="editItem" data-code="new">+ کالای جدید</button></div>` : '') + card('', s.items.map(rowOf).join('') || '<p class="muted">کالایی نیست.</p>');
}
function pgProducts() {
  const s = C.S(), adm = A();
  if (sub && adm) {
    const p = draft.product ||= (sub === 'new' ? { code: '', name: '', cat: '', post: '', assm: '', pack: '', listPrice: '', plates: [{ desc: 'پلیت ۱', upp: 1, h: '', m: '', model: '', fils: [{ item: '', grams: '' }] }], accs: [] } : C.clone(C.productBy(sub)));
    const c = C.productCalc(p);
    return card(sub === 'new' ? 'محصول جدید' : `ویرایش ${esc(p.code)}`, `
      <div class="grid2">${field('نام محصول', txt('product.name', p.name))}${field('دسته', selIn('product.cat', s.lists.productCats, p.cat))}</div>
      <div class="grid3">${field('پس‌پردازش (دقیقه)', numIn('product.post', p.post))}${field('مونتاژ (دقیقه)', numIn('product.assm', p.assm))}${field('بسته‌بندی (دقیقه)', numIn('product.pack', p.pack))}</div>
      ${field('قیمت فروش مصوب (اختیاری)', numIn('product.listPrice', p.listPrice))}
      <h4>پلیت‌ها</h4>
      ${p.plates.map((pl, i) => `<div class="line">
        <div class="grid2">${field('شرح', txt(`product.plates.${i}.desc`, pl.desc))}${field('تعداد محصول از هر چاپ', numIn(`product.plates.${i}.upp`, pl.upp))}</div>
        <div class="grid3">${field('ساعت', numIn(`product.plates.${i}.h`, pl.h))}${field('دقیقه', numIn(`product.plates.${i}.m`, pl.m))}${field('وزن مدل‌ها', numIn(`product.plates.${i}.model`, pl.model))}</div>
        ${pl.fils.map((fl, j) => `<div class="grid2">${field(`فیلامنت ${(j + 1).toLocaleString('fa-IR')}`, selIn(`product.plates.${i}.fils.${j}.item`, itemOpts(C.isFil), fl.item))}${field('گرم (Total)', numIn(`product.plates.${i}.fils.${j}.grams`, fl.grams))}</div>`).join('')}
        <div class="row-btns">${pl.fils.length < 4 ? `<button class="link" data-act="pAddFil" data-i="${i}">+ فیلامنت</button>` : ''}<button class="link danger" data-act="pDelPlate" data-i="${i}">حذف پلیت</button></div></div>`).join('')}
      <button class="ghost" data-act="pAddPlate">+ پلیت</button>
      <h4>اکسسوری و بسته‌بندی (برای هر محصول)</h4>
      ${p.accs.map((a, i) => `<div class="grid2 line">${field('کالا', selIn(`product.accs.${i}.item`, itemOpts(x => !C.isFil(x)), a.item))}${field('تعداد در هر محصول', numIn(`product.accs.${i}.qty`, a.qty))}
        <label class="chk"><input type="checkbox" data-bind="product.accs.${i}.lost" ${a.lost ? 'checked' : ''}> با خرابی چاپ از بین می‌رود</label><button class="link danger" data-act="pDelAcc" data-i="${i}">حذف</button></div>`).join('')}
      <button class="ghost" data-act="pAddAcc">+ اکسسوری</button>
      <div class="summary">${row('زمان چاپ هر محصول', hm(c.hours))}${row('فیلامنت هر محصول', `${fq(c.grams)} گرم`)}${row('بهای تمام‌شده', fmt(c.cost), 'hl')}${row('قیمت پیشنهادی', fmt(c.sug), 'hl')}</div>
      <div class="actions"><button class="primary" data-act="saveProduct">ذخیره</button><button class="ghost" data-act="cancelSub">انصراف</button></div>`);
  }
  const rowOf = p => {
    const c = C.productCalc(p), m = C.productMoves(p.code);
    const inner = `<span><b>${esc(C.productLabel(p))}</b><br><small>${adm ? `بها ${fmt(c.cost)} | ` : ''}قیمت فروش ${fmt(c.sug)}</small></span><span>موجودی ${fq(m.stock)}<br><small>تولید ${fq(m.made)} | فروش ${fq(m.sold)}</small></span>`;
    return adm ? `<button class="listrow" data-act="editProduct" data-code="${esc(p.code)}">${inner}</button>` : `<div class="listrow">${inner}</div>`;
  };
  return (adm ? `<div class="actions"><button class="primary" data-act="editProduct" data-code="new">+ محصول جدید</button></div>` : '') + card('', s.products.map(rowOf).join('') || '<p class="muted">محصولی نیست.</p>');
}
function pgCustomers() {
  const s = C.S();
  if (sub) {
    const cu = s.customers.find(c => c.name === sub); if (!cu) { sub = null; return pgCustomers(); }
    const x = C.customerCalc(sub);
    const invs = s.invoices.filter(i => i.customer === sub).slice().reverse();
    const pays = s.cash.filter(c => c.customer === sub && C.cashDir(c.type) === 1).slice().reverse();
    return card(esc(sub), `${field('تلفن', `<input data-cust="phone" value="${esc(cu.phone)}" inputmode="tel">`)}${field('شهر', `<input data-cust="city" value="${esc(cu.city)}">`)}
      ${row('تعداد فاکتور', fq(x.invoices))}${row('خرید خالص', fmt(x.net))}${row('دریافتی', fmt(x.paid))}${row('مانده بدهی', fmt(x.debt), x.debt > 0 ? 'r' : 'hl')}
      <div class="actions"><button class="primary" data-act="custPay" data-name="${esc(sub)}">ثبت دریافت از این مشتری</button></div>`) +
      card('فاکتورها', invs.map(i => `<button class="listrow" data-act="openInv" data-no="${esc(i.no)}"><span>${esc(i.no)} ${jd(i.date)}</span><span>${fmt(i.total)} | مانده ${fmt(C.invoiceCalc(i).due)}</span></button>`).join('') || '<p class="muted">—</p>') +
      card('دریافتی‌ها', pays.map(c => row(`${jd(c.date)} ${esc(c.inv)}`, fmt(c.amount))).join('') || '<p class="muted">—</p>');
  }
  const list = s.customers.map(c => ({ c, x: C.customerCalc(c.name) })).sort((a, b) => b.x.debt - a.x.debt);
  return card('', list.map(({ c, x }) => `<button class="listrow" data-act="openCust" data-name="${esc(c.name)}"><span><b>${esc(c.name)}</b><br><small>${fq(x.invoices)} فاکتور | خرید ${fmt(x.net)}</small></span><span class="${x.debt > 0.5 ? 'neg' : 'pos'}">${x.debt > 0.5 ? 'بدهی ' + fmt(x.debt) : 'تسویه'}</span></button>`).join('') || '<p class="muted">مشتری با اولین فاکتور اضافه می‌شود.</p>');
}
function pgAccounts() {
  const s = C.S();
  if (sub) {
    const st = C.accountStatement(sub), a = C.accountCalc(sub);
    return card(esc(sub), row('موجودی اولیه', fmt(a.open)) + row('ورودی', fmt(a.inn)) + row('خروجی', fmt(a.out)) + row('مانده', fmt(a.bal), 'hl') +
      field('موجودی اولیه (ویرایش)', `<input data-accopen="${esc(sub)}" inputmode="decimal" value="${esc(a.open)}">`)) +
      card('گردش حساب', st.slice().reverse().map(r => `<div class="listrow"><span>${jd(r.date)} <b>${esc(r.type)}</b><br><small>${esc(r.desc)}</small></span><span>${r.inn ? `<b class="pos">+${fmt(r.inn)}</b>` : `<b class="neg">-${fmt(r.out)}</b>`}<br><small>مانده ${fmt(r.bal)}</small></span></div>`).join('') || '<p class="muted">گردشی نیست.</p>');
  }
  return card('', s.accounts.map(a => { const x = C.accountCalc(a.name); return `<button class="listrow" data-act="openAcc" data-name="${esc(a.name)}"><span><b>${esc(a.name)}</b></span><span>${fmt(x.bal)}</span></button>`; }).join('') +
    `<div class="grid2">${field('حساب جدید', '<input id="newAcc" placeholder="مثلاً کارت ملت">')}<button class="ghost" data-act="addAcc2">افزودن</button></div>`);
}
function pgAssets() {
  const s = C.S(), a = draft.asset ||= { name: '', date: C.todayJ(), cost: '', salv: '', life: 36, dtype: C.ASSET_TYPES[0] };
  return card('', s.assets.map(x => { const d = C.assetDep(x); return row(`${esc(x.name)}<br><small>${jd(x.date)} | ${esc(x.dtype)}</small>`, `${fmt(x.cost)}<br><small>استهلاک ماهانه ${fmt(d.md)}</small>`); }).join('')) +
    card('دارایی جدید', `${field('نام', txt('asset.name', a.name))}<div class="grid2">${field('تاریخ خرید', dateIn('asset.date', a.date))}${field('مبلغ', numIn('asset.cost', a.cost))}</div>
    <div class="grid3">${field('ارزش اسقاط', numIn('asset.salv', a.salv))}${field('عمر مفید (ماه)', numIn('asset.life', a.life))}${field('نوع', selIn('asset.dtype', C.ASSET_TYPES, a.dtype))}</div>
    <p class="muted">«چاپ - ساعتی» در نرخ ساعتی دستگاه و بهای محصولات می‌آید. پرداخت آن را در «هزینه، انتقال و سایر» با نوع «خرید دارایی» ثبت کنید.</p>
    <div class="actions"><button class="primary" data-act="saveAsset">افزودن دارایی</button></div>`);
}
function pgSettings() {
  const s = C.S().settings, L = C.S().lists;
  const fields = [['bizName', 'نام کسب‌وکار (روی فاکتور)', 0], ['bizInfo', 'تلفن و آدرس (روی فاکتور)', 0], ['rateLabor', 'نرخ دستمزد اپراتور (تومان در ساعت)', 1], ['rateDesign', 'نرخ طراحی (تومان در ساعت)', 1],
    ['rateResearch', 'نرخ بررسی و جستجو', 1], ['rateSocial', 'نرخ شبکه‌های اجتماعی و تبلیغات', 1], ['ratePower', 'هزینه برق هر ساعت چاپ', 1], ['setupMin', 'آماده‌سازی هر پلیت (دقیقه)', 1],
    ['machineHours', 'ساعات چاپ ماهانه', 1], ['machineMaint', 'هزینه نگهداری ماهانه', 1], ['timeFactor', 'ضریب اصلاح زمان Bambu', 1], ['matFactor', 'ضریب اصلاح مصرف فیلامنت', 1],
    ['markup1', 'ضریب سود ۱ (مثلاً 0.5 = ۵۰٪)', 1], ['markup2', 'ضریب سود ۲', 1]];
  const hist = C.S().productions.filter(p => p.actualH > 0); const tf = hist.length ? C.sum(hist, p => p.actualH) / C.sum(hist, p => p.estH) : 0;
  return card('نرخ‌ها و ضریب‌ها', fields.map(([k, t, n]) => field(t, `<input data-set="${k}" ${n ? 'inputmode="decimal"' : ''} value="${esc(s[k])}">`)).join('') +
    row('نرخ ساعتی دستگاه (محاسبه‌شده)', fmt(C.rateMachine())) + (tf ? row('ضریب زمان واقعی از سوابق', C.round(tf, 2).toLocaleString('fa-IR')) : '')) +
    card('لیست‌ها (هر مورد در یک خط)', field('دسته‌های هزینه', `<textarea data-list="expCats" rows="5">${esc(L.expCats.join('\n'))}</textarea>`) +
      field('دلایل مرجوعی و ضایعات', `<textarea data-list="reasons" rows="5">${esc(L.reasons.join('\n'))}</textarea>`) +
      field('دسته‌های محصول', `<textarea data-list="productCats" rows="5">${esc(L.productCats.join('\n'))}</textarea>`));
}

// ------------------------------------------------------------------ users (admin)
function userStats(name) {
  const s = C.S(); let n = 0, last = '';
  for (const list of ['purchases', 'productions', 'invoices', 'cash', 'adjustments']) for (const d of s[list]) if (d.by === name) { n++; if ((d.at || '') > last) last = d.at; }
  return { n, last };
}
function pgUsers() {
  const s = C.S(), conn = Sync.conn();
  if (sub) {
    const u = C.userBy(sub); if (!u) { sub = null; return pgUsers(); }
    const st = userStats(u.name), e = draft.uedit ||= { full: u.full || '', role: u.role, active: u.active, pw: '' };
    return card(`کاربر ${esc(u.name)}`, `
      ${row('تعداد ثبت‌ها', fq(st.n))}${row('آخرین فعالیت', jdt(st.last))}
      ${field('نام و نام خانوادگی', txt('uedit.full', e.full))}
      ${field('نقش', selIn('uedit.role', [{ v: 'admin', t: 'ادمین (دسترسی کامل)' }, { v: 'staff', t: 'ثبت‌کننده (بدون اعداد مالی)' }], e.role, '', null))}
      <label class="chk"><input type="checkbox" data-bind="uedit.active" ${e.active ? 'checked' : ''}> فعال (غیرفعال = دیگر نمی‌تواند وارد شود)</label>
      ${field('رمز جدید (اختیاری)', `<input data-bind="uedit.pw" type="password" value="${esc(e.pw)}" autocomplete="new-password">`)}
      <div class="actions"><button class="primary" data-act="saveUser">ذخیره</button><button class="ghost" data-act="cancelSub">انصراف</button></div>
      <button class="link danger" data-act="delUser" data-name="${esc(u.name)}">حذف کاربر</button>`) +
      card('ثبت‌های این کاربر', `<button class="ghost wide" data-act="userDocs" data-name="${esc(u.name)}">نمایش اسناد ${esc(u.name)}</button>`);
  }
  const f = draft.user;
  return card('کاربران', s.users.map(u => { const st = userStats(u.name);
    return `<button class="listrow" data-act="openUser" data-name="${esc(u.name)}"><span><b>${esc(u.name)}</b> ${u.full ? `<small>${esc(u.full)}</small>` : ''}<br><small>${u.role === 'admin' ? 'ادمین' : 'ثبت‌کننده'}${u.active ? '' : ' | غیرفعال'}</small></span><span>${fq(st.n)} ثبت<br><small>${jdt(st.last)}</small></span></button>`; }).join('')) +
    card('کاربر جدید', `
      <div class="grid2">${field('نام کاربری (انگلیسی یا فارسی)', txt('user.name', f.name, 'autocapitalize="off"'))}${field('نام و نام خانوادگی', txt('user.full', f.full))}</div>
      <div class="grid2">${field('نقش', selIn('user.role', [{ v: 'staff', t: 'ثبت‌کننده' }, { v: 'admin', t: 'ادمین' }], f.role, '', null))}${field('رمز (حداقل ۶ حرف)', `<input data-bind="user.pw" type="password" value="${esc(f.pw)}" autocomplete="new-password">`)}</div>
      <p class="muted">ثبت‌کننده: فروش، تولید، خرید، دریافت، مرجوعی، فاکتور و موجودی را می‌بیند و ثبت می‌کند. داشبورد، سود و زیان، بهای تمام‌شده، مانده حساب‌ها، تنظیمات و کاربران را نمی‌بیند.</p>
      <div class="actions"><button class="primary" data-act="addUser">افزودن کاربر</button></div>`) +
    card('کد اتصال گوشی‌های دیگر', `
      <p class="muted">این کد را فقط برای کاربران خودتان و به‌صورت خصوصی بفرستید. هر کسی این کد را داشته باشد به فایل داده دسترسی دارد (با رمز خودش وارد برنامه می‌شود). اگر کد لو رفت، در GitHub توکن را حذف و توکن جدید بسازید.</p>
      <textarea readonly rows="4" dir="ltr" id="connCode">${esc(Sync.makeCode(conn))}</textarea>
      <div class="actions"><button class="ghost" data-act="copyCode">کپی کد</button><button class="ghost" data-act="shareCode">ارسال کد</button></div>
      <p class="muted">نشانی برنامه برای نصب: <span dir="ltr">${esc(location.origin + location.pathname)}</span></p>`);
}

// ------------------------------------------------------------------ my account & sync
function pgAccount() {
  const u = Sync.user(), i = Sync.info(), conn = Sync.conn();
  const st = { ok: 'همگام', idle: 'همگام', sync: 'در حال ارسال و دریافت…', pending: 'تغییرات در صف ارسال', offline: 'آفلاین؛ با وصل شدن اینترنت خودکار ارسال می‌شود', error: 'خطا' }[i.status] || i.status;
  return card('حساب کاربری', row('نام کاربری', esc(u.name)) + row('نقش', u.role === 'admin' ? 'ادمین' : 'ثبت‌کننده') + (A() ? row('مخزن داده', `<span dir="ltr">${esc(conn.owner)}/${esc(conn.repo)}</span>`) : '') +
    `<div class="actions"><button class="ghost" data-act="logout">خروج از حساب</button></div>`) +
    card('همگام‌سازی', row('وضعیت', st, i.status === 'error' ? 'r' : '') + (i.error ? `<p class="neg">${esc(i.error)}</p>` : '') + row('تغییرات ارسال‌نشده', fq(i.pending)) + row('آخرین همگام‌سازی', jdt(i.lastSync)) +
      `<p class="muted">همه ثبت‌ها اول روی همین گوشی ذخیره می‌شوند و بدون اینترنت هم کار می‌کنند؛ با وصل شدن اینترنت خودکار به سرور می‌روند و تغییرات بقیه کاربران دریافت می‌شود.</p>
      <div class="actions"><button class="primary" data-act="syncNow">همگام‌سازی الان</button></div>` +
      (i.failed.length ? `<h4>ثبت‌های ردشده</h4><p class="muted">این ثبت‌ها روی سرور پذیرفته نشد (مثلاً موجودی توسط کاربر دیگری فروخته شده بود). دوباره با اطلاعات درست ثبت کنید.</p>` +
        i.failed.map(x => row(`${jdt(x.at)} | ${esc(x.by)} | ${esc(x.type)}`, `<small class="neg">${esc(x.msg)}</small>`)).join('') + `<button class="link" data-act="clearFailed">پاک کردن این فهرست</button>` : '')) +
    card('تغییر رمز من', `${field('رمز فعلی', '<input id="pwOld" type="password" autocomplete="current-password">')}${field('رمز جدید (حداقل ۶ حرف)', '<input id="pwNew" type="password" autocomplete="new-password">')}
      <div class="actions"><button class="ghost" data-act="changePw">تغییر رمز</button></div>`) +
    card('این گوشی', `<p class="muted">قطع اتصال، داده‌های ذخیره‌شده روی این گوشی را پاک می‌کند (داده‌های روی سرور می‌ماند). برای تحویل گوشی به شخص دیگر استفاده کنید.</p><button class="ghost danger" data-act="forget">قطع اتصال و پاک کردن این گوشی</button>`);
}

function pgBackup() {
  const t = C.csvTables();
  return card('پشتیبان', `<p class="muted">داده‌ها روی مخزن خصوصی GitHub نگه داشته می‌شوند و GitHub همه نسخه‌های قبلی را هم نگه می‌دارد. با این حال ماهی یک بار یک فایل پشتیبان بگیرید و جای دیگری (مثلاً ایمیل یا Google Drive) نگه دارید.</p>
    <div class="actions"><button class="primary" data-act="backup">گرفتن فایل پشتیبان</button><label class="ghost filebtn">بازگردانی از فایل<input type="file" accept=".json,application/json" id="restoreFile" hidden></label></div>
    <p class="muted">بازگردانی، همه داده‌ها را برای همه کاربران با فایل جایگزین می‌کند؛ کاربران و رمزها تغییر نمی‌کنند.</p>`) +
    card('خروجی برای Excel (CSV)', `<p class="muted">هر جدول یک فایل CSV می‌شود که در Excel باز می‌شود.</p>` + Object.keys(t).map(k => `<button class="ghost" data-act="csv" data-t="${esc(k)}">${esc(k)}</button>`).join(' ')) +
    card('شروع از صفر', `<p class="muted">همه اسناد پاک می‌شود و فقط کالاها، محصولات، حساب‌ها، مشتریان و تنظیمات می‌ماند.</p><button class="ghost danger" data-act="wipeDocs">حذف همه اسناد</button>`);
}
function pgMore() {
  const nav = A() ? NAV_ADMIN : NAV_STAFF;
  return card('', MORE.filter(([k, , adm]) => (!adm || A()) && !nav.some(n => n[0] === k)).map(([k, t]) => `<button class="listrow" data-go="${k}"><span>${t}</span><span>‹</span></button>`).join(''));
}

// ------------------------------------------------------------------ files: share (phone) or download (computer)
function parseDates(obj, keys) {
  const out = { ...obj };
  for (const k of keys) { const iso = C.isoOfJ(obj[k]); if (!iso) throw new Error('تاریخ را به شکل ۱۴۰۵/۰۷/۲۰ وارد کنید.'); out[k] = iso; }
  return out;
}
const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const isPhone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const blobToB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
async function shareFile(name, blob, { share = true } = {}) {
  if (isNative()) { // the share sheet also offers "save to Files / Drive", so both buttons use it in the app
    const { Filesystem, Share } = window.Capacitor.Plugins;
    const r = await Filesystem.writeFile({ path: name, data: await blobToB64(blob), directory: 'CACHE', recursive: true });
    try { await Share.share({ title: name, files: [r.uri], dialogTitle: name }); }
    catch (e) { if (!/cancel/i.test(e.message || '')) await Share.share({ title: name, url: r.uri, dialogTitle: name }); }
    return;
  }
  const file = new File([blob], name, { type: blob.type });
  if (share && isPhone() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
const csvOf = rows => '\ufeff' + rows.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n');

// ------------------------------------------------------------------ events
const runSoft = (type, args) => Sync.run(type, args).catch(e => toast(e.message, true));
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.auth) { auth[el.dataset.auth] = el.value; return; }
  if (el.dataset.bind) {
    let v = el.type === 'checkbox' ? el.checked : el.value;
    setPath(el.dataset.bind, v);
    if (el.dataset.kind === 'date') el.classList.toggle('bad', !C.isoOfJ(el.value));
    if (el.dataset.rerender !== undefined && el.tagName === 'SELECT') return; // handled on change
    refreshLive();
  } else if (el.dataset.set) runSoft('setSetting', { key: el.dataset.set, value: el.value });
  else if (el.dataset.list) runSoft('setList', { key: el.dataset.list, values: el.value.split('\n') });
  else if (el.dataset.cust) runSoft('setCustomer', { name: sub, key: el.dataset.cust, value: el.value });
  else if (el.dataset.accopen) runSoft('setAccountOpen', { name: el.dataset.accopen, open: C.num(el.value) });
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.bind) {
    setPath(el.dataset.bind, el.type === 'checkbox' ? el.checked : el.value);
    if (el.dataset.rerender !== undefined) {
      if (el.dataset.bind === 'adj.inv' || el.dataset.bind === 'adj.type') draft.adj.product = '';
      if (el.dataset.bind === 'pay.customer') draft.pay.inv = '';
      render();
    } else refreshLive();
  }
  if (el.id === 'docUser') { docUser = el.value; render(); }
  const readJson = (file, cb) => { const r = new FileReader(); r.onload = () => { try { const obj = JSON.parse(r.result); if (!obj.settings || !obj.items) throw new Error(); cb(obj); } catch (err) { toast('فایل پشتیبان معتبر نیست.', true); } }; r.readAsText(file); };
  if (el.id === 'authBackup' && el.files[0]) readJson(el.files[0], obj => { auth.backup = obj; renderAuth(); });
  if (el.id === 'restoreFile' && el.files[0]) readJson(el.files[0], async obj => {
    if (!confirm('همه داده‌ها برای همه کاربران با فایل پشتیبان جایگزین شود؟')) return;
    try { await act('restore', { state: obj }, 'بازگردانی انجام شد و به سرور ارسال می‌شود.'); } catch (err) { toast(err.message, true); }
  });
});
document.addEventListener('click', async e => {
  const b = e.target.closest('button,[data-go]'); if (!b) return;
  if (b.dataset.go) { go(b.dataset.go); return; }
  const a = b.dataset.act; if (!a) return;
  const s = C.S();
  try {
    switch (a) {
      // ---- login & setup
      case 'authMode': auth.mode = b.dataset.v; renderAuth(); break;
      case 'authBack': auth.step = ''; renderAuth(); break;
      case 'connCode': await connectWith(Sync.parseCode(auth.code)); break;
      case 'connSetup': {
        if (!auth.owner.trim() || !auth.repo.trim() || !auth.token.trim()) throw new Error('هر سه خانه را پر کنید.');
        await connectWith({ owner: auth.owner, repo: auth.repo, token: auth.token }); break;
      }
      case 'createDb': {
        if (!auth.name.trim()) throw new Error('نام کاربری را وارد کنید.');
        if (auth.pw.length < 6) throw new Error('رمز حداقل ۶ حرف باشد.');
        if (auth.pw !== auth.pw2) throw new Error('تکرار رمز یکسان نیست.');
        auth.busy = true; renderAuth();
        try { await Sync.createDatabase(auth.pending, { name: auth.name, full: auth.full, password: auth.pw }, auth.backup); auth.step = ''; await Sync.login(auth.name, auth.pw); auth.pw = auth.pw2 = ''; resetAll(); route = null; toast('پایگاه داده ساخته شد.'); }
        finally { auth.busy = false; render(); }
        break;
      }
      case 'login': {
        b.disabled = true;
        try { await Sync.login(auth.name, auth.pw); auth.pw = ''; resetAll(); route = null; render(); toast(`خوش آمدید ${Sync.user().full || Sync.user().name}`); }
        finally { b.disabled = false; }
        break;
      }
      case 'refetch': {
        auth.busy = true; renderAuth();
        try { const c = Sync.conn(); const r = await Sync.testRepo(c); if (!r.exists) throw new Error('فایل داده روی سرور پیدا نشد.'); await Sync.connect(c, r); auth.step = ''; }
        catch (err) { auth.step = err.message; throw err; } finally { auth.busy = false; render(); }
        break;
      }
      case 'forget': if (await Sync.disconnect()) { auth.step = ''; route = null; render(); } break;
      case 'logout': Sync.logout(); route = null; render(); break;
      case 'syncNow': await Sync.flush(); render(); toast(Sync.info().status === 'ok' ? 'همگام شد.' : (Sync.info().error || 'هنوز ارسال نشده.'), Sync.info().status !== 'ok'); break;
      case 'clearFailed': await Sync.clearFailed(); render(); break;
      case 'changePw': {
        const u = Sync.user(), o = $('#pwOld').value, n = $('#pwNew').value;
        if (!(await Sync.checkPassword(u, o))) throw new Error('رمز فعلی اشتباه است.');
        if (n.length < 6) throw new Error('رمز جدید حداقل ۶ حرف باشد.');
        await act('setUser', { name: u.name, patch: await Sync.hashPassword(n) }, 'رمز عوض شد.'); break;
      }
      // ---- users
      case 'addUser': {
        const f = draft.user; if (!f.name.trim()) throw new Error('نام کاربری را وارد کنید.'); if (f.pw.length < 6) throw new Error('رمز حداقل ۶ حرف باشد.');
        if (C.userBy(f.name.trim())) throw new Error('این نام کاربری هست.');
        await act('addUser', { name: f.name.trim(), full: f.full, role: f.role, ...(await Sync.hashPassword(f.pw)) }, `کاربر ${f.name} اضافه شد. کد اتصال پایین همین صفحه را برایش بفرستید.`);
        resetDraft('user'); render(); break;
      }
      case 'openUser': draft.uedit = null; go('users', b.dataset.name); break;
      case 'saveUser': {
        const e2 = draft.uedit; if (e2.pw && e2.pw.length < 6) throw new Error('رمز حداقل ۶ حرف باشد.');
        const patch = { full: e2.full, role: e2.role, active: !!e2.active, ...(e2.pw ? await Sync.hashPassword(e2.pw) : {}) };
        await act('setUser', { name: sub, patch }); draft.uedit = null; sub = null; toast('ذخیره شد.'); render(); break;
      }
      case 'delUser': if (confirm(`کاربر ${b.dataset.name} حذف شود؟ اسناد ثبت‌شده او می‌ماند.`)) { await act('delUser', { name: b.dataset.name }); sub = null; toast('حذف شد.'); render(); } break;
      case 'userDocs': docUser = b.dataset.name; go('docs'); break;
      case 'copyCode': { const t = $('#connCode').value; try { await navigator.clipboard.writeText(t); } catch (err) { $('#connCode').select(); document.execCommand('copy'); } toast('کد کپی شد.'); break; }
      case 'shareCode': { const t = `کد اتصال Voxara.3d:\n${$('#connCode').value}\n\nنشانی برنامه: ${location.origin + location.pathname}`;
        if (navigator.share) navigator.share({ text: t }).catch(() => {}); else { await navigator.clipboard.writeText(t); toast('کپی شد.'); } break; }
      // ---- forms
      case 'addLine': draft[b.dataset.k].lines.push(b.dataset.k === 'sale' ? { product: '', qty: '', price: '' } : { item: '', newName: '', newType: '', newColor: '', pkgs: '', perPkg: '', price: '' }); render(); break;
      case 'delLine': draft[b.dataset.k].lines.splice(+b.dataset.i, 1); render(); break;
      case 'reset': if (confirm('فرم پاک شود؟')) { resetDraft(b.dataset.k); render(); } break;
      case 'setKind': draft.sale.kind = b.dataset.v; render(); break;
      case 'saveSale': {
        const f = parseDates(draft.sale, ['date']); const pv = C.salePreview(f);
        if (!confirm(`${f.kind} ثبت شود؟\nمشتری: ${f.customer}\nمبلغ کل: ${fmt(pv.total)} تومان${f.kind === 'هدیه' ? '' : `\nپرداختی: ${fmt(pv.rcv)}\nمانده: ${fmt(pv.remain)}`}`)) break;
        const no = await Sync.run('sale', f); resetDraft('sale'); toast(`${f.kind} ${no} ثبت شد.`); go('invoices', no); break;
      }
      case 'saveBuy': {
        const f = parseDates(draft.buy, ['date']); const pv = C.purchasePreview(f);
        if (!confirm(`خرید ثبت شود؟\nجمع پرداختی از «${f.acc}»: ${fmt(pv.total)} تومان`)) break;
        const doc = await Sync.run('purchase', f); resetDraft('buy'); toast(`خرید ${doc} ثبت شد و موجودی به‌روز شد.`); render(); break;
      }
      case 'addPlate': draft.prod.plates.push(newPlate()); render(); break;
      case 'delPlate': draft.prod.plates.splice(+b.dataset.i, 1); render(); break;
      case 'addFil': draft.prod.plates[+b.dataset.i].fils.push({ item: '', grams: '' }); render(); break;
      case 'addAcc': draft.prod.accs.push({ item: '', qty: '' }); render(); break;
      case 'delAcc': draft.prod.accs.splice(+b.dataset.i, 1); render(); break;
      case 'loadDef': {
        const f = draft.prod; if (C.num(f.good) + C.num(f.fail) <= 0) throw new Error('اول تعداد سالم (و خراب) را وارد کنید.');
        const d = C.loadDefinition(f.product, f.good, f.fail); Object.assign(f, d);
        if (!f.plates.length) f.plates = [newPlate()]; render(); toast('از تعریف محصول بارگذاری شد؛ در صورت نیاز اصلاح کنید.'); break;
      }
      case 'saveProd': {
        const f = parseDates(prodForm(), ['date']); const pv = C.productionPreview(f);
        if (!A()) f.saveDef = false;
        if (!confirm(`تولید ثبت شود؟\nسالم: ${f.good || 0}  خراب: ${f.fail || 0}${A() ? `\nبهای کل: ${fmt(pv.total)}\nهر محصول سالم: ${fmt(pv.unit)}` : ''}`)) break;
        const r = await Sync.run('production', f); resetDraft('prod'); toast(`تولید ${r.doc} ثبت شد.`); render(); break;
      }
      case 'savePay': {
        const f = parseDates(draft.pay, ['date']);
        await Sync.run('cash', { ...f, type: 'دریافت از مشتری', desc: f.desc || 'پرداخت بدهی' });
        const name = f.customer; resetDraft('pay'); toast(`دریافت ثبت شد. بدهی فعلی ${name}: ${fmt(C.customerCalc(name).debt)}`); render(); break;
      }
      case 'custPay': draft.pay.customer = b.dataset.name; go('pay'); break;
      case 'saveCash': { const f = parseDates(draft.cash, ['date']); await act('cash', { ...f, hours: hoursOf(f.hours) }, 'ثبت شد.'); resetDraft('cash'); render(); break; }
      case 'saveAdj': { const f = parseDates(draft.adj, ['date']); await act('adj', f, 'ثبت شد.'); resetDraft('adj'); render(); break; }
      case 'openInv': go('invoices', b.dataset.no); break;
      case 'print': window.print(); break;
      case 'sharePdf': case 'savePdf': {
        const inv = s.invoices.find(i => i.no === b.dataset.no);
        const label = b.textContent; b.disabled = true; b.textContent = 'در حال ساخت PDF…';
        try { await shareFile(pdfName(inv), await pdfFor(inv), { share: a === 'sharePdf' }); }
        finally { b.disabled = false; b.textContent = label; }
        break;
      }
      case 'shareInv': { const inv = s.invoices.find(i => i.no === b.dataset.no); const t = invoiceText(inv);
        if (navigator.share) navigator.share({ text: t }).catch(() => {}); else { await navigator.clipboard.writeText(t); toast('متن فاکتور کپی شد.'); } break; }
      case 'delDoc': if (confirm('این سند حذف شود؟')) await act('delDoc', { kind: b.dataset.k, key: b.dataset.key }, 'حذف شد.'); break;
      case 'editItem': draft.item = null; go('items', b.dataset.code); break;
      case 'saveItem': await act('saveItem', { code: sub === 'new' ? '' : sub, item: draft.item }); draft.item = null; sub = null; toast('ذخیره شد.'); render(); break;
      case 'cancelSub': draft.item = null; draft.product = null; draft.uedit = null; sub = null; render(); break;
      case 'editProduct': draft.product = null; go('products', b.dataset.code); break;
      case 'pAddPlate': draft.product.plates.push({ desc: `پلیت ${draft.product.plates.length + 1}`, upp: 1, h: '', m: '', model: '', fils: [{ item: '', grams: '' }] }); render(); break;
      case 'pDelPlate': draft.product.plates.splice(+b.dataset.i, 1); render(); break;
      case 'pAddFil': draft.product.plates[+b.dataset.i].fils.push({ item: '', grams: '' }); render(); break;
      case 'pAddAcc': draft.product.accs.push({ item: '', qty: 1, lost: false }); render(); break;
      case 'pDelAcc': draft.product.accs.splice(+b.dataset.i, 1); render(); break;
      case 'saveProduct': await act('saveProduct', { code: sub === 'new' ? '' : sub, product: draft.product }); draft.product = null; sub = null; toast('محصول ذخیره شد.'); render(); break;
      case 'openCust': go('customers', b.dataset.name); break;
      case 'openAcc': go('accounts', b.dataset.name); break;
      case 'addAcc2': { const n = $('#newAcc').value.trim(); if (!n) break; await act('addAccount', { name: n }, 'حساب اضافه شد.'); break; }
      case 'saveAsset': { const x = parseDates(draft.asset, ['date']); await act('addAsset', x, 'دارایی اضافه شد.'); draft.asset = null; render(); break; }
      case 'backup': await shareFile(`Voxara-backup-${C.todayJ().replace(/\//g, '-')}.json`, new Blob([JSON.stringify(s)], { type: 'application/json' })); break;
      case 'csv': await shareFile(`${b.dataset.t}.csv`, new Blob([csvOf(C.csvTables()[b.dataset.t])], { type: 'text/csv;charset=utf-8' })); break;
      case 'wipeDocs': if (confirm('همه اسناد برای همه کاربران حذف شود؟ (نسخه قبلی در تاریخچه GitHub می‌ماند)') && confirm('مطمئن هستید؟')) await act('wipeDocs', {}, 'همه اسناد حذف شد.'); break;
    }
  } catch (err) { toast(err.message || String(err), true); console.error(err); }
});
$('#back').addEventListener('click', () => { if (sub) { sub = null; draft.item = null; draft.product = null; draft.uedit = null; render(); } else go('more'); });
$('#sync').addEventListener('click', () => go('account'));

// redraw when other users' changes arrive, but never while someone is typing
let shownState = null, redrawLater = false;
const typing = () => { const el = document.activeElement; return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && $('#main').contains(el); };
Sync.on(() => {
  updateBadge();
  if (C.S() && C.S() !== shownState && Sync.user()) { shownState = C.S(); if (typing()) redrawLater = true; else render(); }
  if (Sync.conn() && C.S() && !Sync.user() && !document.body.classList.contains('auth')) render();
});
setInterval(() => { if (redrawLater && !typing()) { redrawLater = false; render(); } }, 1500);
Sync.onRejected = list => toast(`${fq(list.length)} ثبت روی سرور پذیرفته نشد: ${list[0].msg} (جزئیات در «حساب کاربری من»)`, true);

(async () => {
  await Sync.init();
  shownState = C.S();
  if (C.S()) resetAll();
  render();
  if (Sync.user()) Sync.flush();
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !isNative()) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
