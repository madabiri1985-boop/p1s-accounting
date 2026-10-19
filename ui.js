'use strict';
/* P1S accounting – user interface (single page, RTL, offline). */

const C = Core;
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(C.num(n)).toLocaleString('fa-IR');
const fq = n => { const v = C.num(n); return (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : C.round(v, 1)).toLocaleString('fa-IR'); };
const hm = h => { const t = Math.round(C.num(h) * 60); return `${Math.floor(t / 60).toLocaleString('fa-IR')}:${String(t % 60).padStart(2, '0').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d])}`; };
const jd = iso => esc(C.jOfIso(iso)).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const opt = (list, val, ph = '— انتخاب کنید —') => `<option value="">${ph}</option>` + list.map(o => {
  const v = typeof o === 'string' ? o : o.v, t = typeof o === 'string' ? o : o.t;
  return `<option value="${esc(v)}"${String(v) === String(val ?? '') ? ' selected' : ''}>${esc(t)}</option>`;
}).join('');
const itemOpts = filter => C.S().items.filter(filter || (() => true)).map(i => ({ v: i.code, t: C.itemLabel(i) }));
const prodOpts = () => C.S().products.map(p => ({ v: p.code, t: C.productLabel(p) }));
const accOpts = () => C.S().accounts.map(a => a.name);
const custOpts = () => C.S().customers.map(c => c.name);

function toast(msg, bad = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.className = 'toast', 3200);
}
async function commit(msg) { await C.save(); if (msg) toast(msg); render(); }
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
function resetDraft(k) { draft[k] = { sale: newSale, buy: newBuy, prod: newProd, pay: newPay, cash: newCash, adj: newAdj }[k](); }

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

// ------------------------------------------------------------------ routing
let route = 'dash', sub = null;
const NAV = [['dash', 'داشبورد', '▦'], ['sale', 'فروش', '₸'], ['prod', 'تولید', '⬢'], ['buy', 'خرید', '⇩'], ['more', 'بیشتر', '☰']];
const MORE = [
  ['pay', 'دریافت بدهی مشتری'], ['cash', 'هزینه، انتقال و سایر'], ['adj', 'مرجوعی و ضایعات'], ['invoices', 'فاکتورها و چاپ'],
  ['docs', 'همه اسناد (حذف سند اشتباه)'], ['items', 'کالاها و انبار مواد'], ['products', 'محصولات و پلیت‌ها'], ['customers', 'مشتریان و بدهی‌ها'],
  ['accounts', 'حساب‌ها و گردش'], ['assets', 'دارایی‌ها و تجهیزات'], ['settings', 'تنظیمات و نرخ‌ها'], ['backup', 'پشتیبان‌گیری و خروجی Excel']
];
function go(r, s = null) { route = r; sub = s; render(); window.scrollTo(0, 0); }

function render() {
  const titleOf = { dash: 'داشبورد', sale: 'فروش و هدیه', prod: 'ثبت تولید', buy: 'ثبت خرید', more: 'منو' };
  MORE.forEach(([k, t]) => titleOf[k] = t);
  $('#title').textContent = titleOf[route] || '';
  $('#back').hidden = !MORE.some(m => m[0] === route) && !sub;
  $('#nav').innerHTML = NAV.map(([k, t, i]) => `<button data-go="${k}" class="${route === k || (k === 'more' && MORE.some(m => m[0] === route)) ? 'on' : ''}"><i>${i}</i>${t}</button>`).join('');
  const pages = { dash: pgDash, sale: pgSale, prod: pgProd, buy: pgBuy, more: pgMore, pay: pgPay, cash: pgCash, adj: pgAdj, invoices: pgInvoices, docs: pgDocs,
    items: pgItems, products: pgProducts, customers: pgCustomers, accounts: pgAccounts, assets: pgAssets, settings: pgSettings, backup: pgBackup };
  $('#main').innerHTML = pages[route]();
  refreshLive();
}

// live summaries (re-rendered without touching inputs)
function refreshLive() {
  document.querySelectorAll('[data-live]').forEach(el => { const f = LIVE[el.dataset.live]; if (f) el.innerHTML = f(); });
}
const LIVE = {};

// ------------------------------------------------------------------ dashboard
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
  ${card(`سال ${String(d.year).replace(/\d/g, x => '۰۱۲۳۴۵۶۷۸۹'[x])}: فروش خالص و سود ناخالص ماهانه`, `<div class="bars">${bars}</div><div class="legend"><span class="l1">فروش خالص</span><span class="l2">سود ناخالص</span></div>`)}
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
  const f = draft.sale, gift = f.kind === 'هدیه';
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
    return x ? `موجودی: <b class="${C.num(src.qty) > x.stock ? 'neg' : ''}">${fq(x.stock)}</b> | قیمت: <b>${fmt(x.price)}</b> | مبلغ: <b>${fmt(x.amount)}</b> | سود: <b>${fmt(x.amount - x.cost)}</b>` : '';
  });
  LIVE.saleSum = () => {
    const pv = C.salePreview(draft.sale);
    return [row('جمع اقلام', fmt(pv.gross)), gift ? '' : row('تخفیف', fmt(pv.disc)), pv.shipIn ? row('ارسال اضافه به فاکتور', fmt(pv.shipIn)) : '',
      row('مبلغ کل فاکتور', fmt(pv.total), 'hl'), gift ? '' : row('پرداختی همین الان', fmt(pv.rcv)), gift ? '' : row('مانده (نسیه)', fmt(pv.remain), pv.remain > 0 ? 'r' : ''),
      draft.sale.customer ? row('بدهی کل مشتری بعد از ثبت', fmt(pv.debtAfter), 'r') : '', row('بهای تمام‌شده', fmt(pv.cogs)), row('سود این فاکتور', fmt(pv.profit), pv.profit < 0 ? 'r' : 'hl')].join('');
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
    return row('مبلغ کالا', fmt(pv.goods)) + row('هزینه ارسال', fmt(pv.ship)) + row('جمع پرداختی', fmt(pv.total), 'hl') + row('موجودی حساب بعد از خرید', fmt(bal - pv.total), bal - pv.total < 0 ? 'r' : ''); };
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
    const pv = C.productionPreview(prodForm());
    return [row('تعداد کل چاپ پلیت‌ها', fq(pv.prints)), row('زمان برآورد Bambu', hm(pv.estH)), row('زمان چاپ محاسبه‌شده', hm(pv.hrs)),
      row('فیلامنت مصرفی', `${fq(pv.grams)} گرم`), row('پرت (Purge و Tower)', `${fq(pv.wasteG)} گرم`), row('بهای مواد و اکسسوری', fmt(pv.matCost)),
      row('بهای دستگاه و برق', fmt(pv.mac)), row('زمان کار', hm(pv.labH)), row('بهای نیروی انسانی', fmt(pv.lab)), row('بهای طراحی و بررسی', fmt(pv.des)),
      row('بهای کل تولید', fmt(pv.total), 'hl'), row('بهای محصولات خراب', fmt(pv.failCost), 'r'), row('بهای هر محصول سالم', fmt(pv.unit), 'hl'),
      row(`قیمت با سود ${Math.round(C.S().settings.markup1 * 100).toLocaleString('fa-IR')}٪`, fmt(pv.p1)), row(`قیمت با سود ${Math.round(C.S().settings.markup2 * 100).toLocaleString('fa-IR')}٪`, fmt(pv.p2))].join('');
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
    ${isNew ? '' : `<label class="chk"><input type="checkbox" data-bind="prod.saveDef" ${f.saveDef ? 'checked' : ''}> این اعداد در تعریف محصول ذخیره شود</label>`}
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
  const f = draft.cash, types = C.CASH_TYPES.filter(t => t.manual && t.type !== 'دریافت از مشتری').map(t => t.type);
  return `${card('', `
    ${field('نوع', selIn('cash.type', types, f.type, 'data-rerender'))}
    <div class="grid2">${field('تاریخ', dateIn('cash.date', f.date))}${field('مبلغ', numIn('cash.amount', f.amount))}</div>
    <div class="grid2">${field(f.type === 'انتقال بین حساب‌ها' ? 'از حساب' : 'حساب', selIn('cash.acc', accOpts(), f.acc))}
    ${f.type === 'انتقال بین حساب‌ها' ? field('به حساب', selIn('cash.acc2', accOpts(), f.acc2)) : ''}
    ${f.type === 'پرداخت هزینه' ? field('دسته هزینه', selIn('cash.expCat', C.S().lists.expCats, f.expCat)) : ''}</div>
    ${f.type === 'پرداخت هزینه' ? field('زمان صرف‌شده (مثلاً 2:30، اختیاری)', txt('cash.hours', f.hours, 'inputmode="numeric"'), 'برای تبلیغات و مدیریت شبکه‌های اجتماعی؛ ارزش زمان در سود و زیان می‌آید') : ''}
    ${field('شرح', txt('cash.desc', f.desc))}`)}
  <div class="actions"><button class="primary" data-act="saveCash">ثبت</button></div>
  ${card('آخرین موارد', C.S().cash.slice(-8).reverse().map(c => row(`${jd(c.date)} | ${esc(c.type)}`, `${fmt(c.amount)} | ${esc(c.acc)}`)).join('') || '<p class="muted">هنوز چیزی ثبت نشده.</p>')}`;
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
    return row('موجودی فعلی', `${fq(pv.stockNow)} ${esc(pv.unit)}`) + row('ارزش ضایعات', fmt(pv.cost), 'r');
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

// ------------------------------------------------------------------ invoices & printing
function invoiceHtml(inv) {
  const s = C.S().settings, c = C.invoiceCalc(inv), cust = C.S().customers.find(x => x.name === inv.customer) || {};
  return `<div class="invoice" id="printArea">
    <h2>${esc(s.bizName)}</h2>${s.bizInfo ? `<p class="center muted">${esc(s.bizInfo)}</p>` : ''}
    <div class="inv-head"><b>${inv.kind === 'هدیه' ? 'حواله هدیه' : 'فاکتور فروش'}</b><span>شماره: ${esc(inv.no)}</span><span>تاریخ: ${jd(inv.date)}</span></div>
    <div class="inv-head"><span>مشتری: ${esc(inv.customer)}</span>${cust.phone ? `<span>تلفن: ${esc(cust.phone)}</span>` : ''}</div>
    <table><thead><tr><th>ردیف</th><th>شرح کالا</th><th>تعداد</th><th>قیمت واحد</th><th>مبلغ</th></tr></thead>
    <tbody>${inv.lines.map((l, i) => `<tr><td>${(i + 1).toLocaleString('fa-IR')}</td><td>${esc(l.name)}</td><td>${fq(l.qty)}</td><td>${fmt(l.price)}</td><td>${fmt(l.qty * l.price)}</td></tr>`).join('')}</tbody></table>
    <div class="inv-tot">${row('جمع اقلام', fmt(inv.gross))}${inv.disc ? row('تخفیف', fmt(inv.disc)) : ''}${inv.shipIn ? row('هزینه ارسال', fmt(inv.shipIn)) : ''}
    ${row('مبلغ قابل پرداخت', fmt(inv.total), 'hl')}${row('پرداخت‌شده', fmt(c.rcv))}${c.credit ? row('مرجوعی', fmt(c.credit)) : ''}${row('مانده', fmt(c.due), c.due > 0 ? 'r' : '')}</div>
    ${inv.note ? `<p>توضیحات: ${esc(inv.note)}</p>` : ''}<p class="center muted">با سپاس از خرید شما</p></div>`;
}
const PRINT_CSS = 'body{font-family:Tahoma,sans-serif;margin:16px}table{width:100%;border-collapse:collapse}th{background:#17324d;color:#fff;padding:6px}td{border-bottom:1px solid #ddd;padding:6px;text-align:center}.kv{display:flex;justify-content:space-between;padding:4px 0}.center{text-align:center}.inv-head{display:flex;justify-content:space-between;margin:8px 0}';
function invoiceText(inv) {
  const c = C.invoiceCalc(inv);
  return `${C.S().settings.bizName}\n${inv.kind === 'هدیه' ? 'حواله هدیه' : 'فاکتور'} ${inv.no} - ${C.jOfIso(inv.date)}\nمشتری: ${inv.customer}\n` +
    inv.lines.map(l => `${l.name} × ${l.qty} = ${fmt(l.qty * l.price)}`).join('\n') + `\nمبلغ کل: ${fmt(inv.total)} تومان\nپرداخت‌شده: ${fmt(c.rcv)}\nمانده: ${fmt(c.due)}`;
}
function pgInvoices() {
  if (sub) {
    const inv = C.S().invoices.find(i => i.no === sub); if (!inv) { sub = null; return pgInvoices(); }
    return invoiceHtml(inv) + `<div class="actions noprint"><button class="primary" data-act="print">چاپ / PDF</button><button class="ghost" data-act="shareInv" data-no="${esc(inv.no)}">ارسال متن فاکتور</button></div>`;
  }
  const list = C.S().invoices.slice().reverse();
  return card('', list.length ? list.map(i => { const c = C.invoiceCalc(i);
    return `<button class="listrow" data-act="openInv" data-no="${esc(i.no)}"><span><b>${esc(i.no)}</b> ${jd(i.date)}<br><small>${esc(i.customer)} ${i.kind === 'هدیه' ? '(هدیه)' : ''}</small></span><span>${fmt(i.total)}<br><small class="${c.due > 0.5 ? 'neg' : 'pos'}">${c.due > 0.5 ? 'مانده ' + fmt(c.due) : 'تسویه'}</small></span></button>`; }).join('') : '<p class="muted">فاکتوری ثبت نشده.</p>');
}

// ------------------------------------------------------------------ documents (undo)
function pgDocs() {
  const s = C.S(), docs = [];
  s.purchases.forEach(p => docs.push({ d: p.date, k: 'purchase', key: p.doc, t: `خرید ${p.doc}`, v: fmt(C.sum(p.lines, l => l.amount) + p.ship) }));
  s.productions.forEach(p => docs.push({ d: p.date, k: 'production', key: p.doc, t: `تولید ${p.doc} | ${(C.productBy(p.product) || {}).name || ''}`, v: `${fq(p.good)} سالم` }));
  s.invoices.forEach(i => docs.push({ d: i.date, k: 'invoice', key: i.no, t: `${i.kind} ${i.no} | ${i.customer}`, v: fmt(i.total) }));
  s.cash.filter(c => C.cashDef(c.type).manual).forEach(c => docs.push({ d: c.date, k: 'cash', key: c.id, t: `${c.type} | ${c.customer || c.desc || ''}`, v: fmt(c.amount) }));
  s.adjustments.forEach(a => docs.push({ d: a.date, k: 'adjustment', key: a.id, t: `${a.type}`, v: fq(a.qty) }));
  docs.sort((a, b) => b.d.localeCompare(a.d));
  return card('', `<p class="muted">اگر سندی اشتباه ثبت شد، حذفش کنید و دوباره ثبت کنید. حذف خرید یا فاکتور، دریافت و پرداخت‌های همان سند را هم حذف می‌کند.</p>` +
    (docs.map(x => `<div class="listrow"><span>${jd(x.d)} <b>${esc(x.t)}</b></span><span>${x.v} <button class="link danger" data-act="delDoc" data-k="${x.k}" data-key="${esc(x.key)}">حذف</button></span></div>`).join('') || '<p class="muted">سندی نیست.</p>'));
}

// ------------------------------------------------------------------ master data
function pgItems() {
  const s = C.S();
  if (sub) {
    const it = sub === 'new' ? (draft.item ||= { code: '', type: '', name: '', color: '', unit: '', initPrice: '', overridePrice: '', initStock: '', minStock: '' }) : (draft.item ||= { ...C.itemBy(sub) });
    return card(sub === 'new' ? 'کالای جدید' : `ویرایش ${esc(it.code)}`, `
      <div class="grid2">${field('نوع', selIn('item.type', C.ITEM_TYPES, it.type))}${field('نام', txt('item.name', it.name))}</div>
      <div class="grid2">${field('رنگ', txt('item.color', it.color))}${field('واحد', selIn('item.unit', ['گرم', 'عدد', 'متر', 'بسته'], it.unit, '', 'خودکار'))}</div>
      <div class="grid2">${field('قیمت اولیه (هر کیلو یا عدد)', numIn('item.initPrice', it.initPrice))}${field('قیمت روز بازار (اختیاری)', numIn('item.overridePrice', it.overridePrice))}</div>
      <div class="grid2">${field('موجودی اولیه (گرم یا عدد)', numIn('item.initStock', it.initStock))}${field('حداقل موجودی', numIn('item.minStock', it.minStock))}</div>
      <div class="actions"><button class="primary" data-act="saveItem">ذخیره</button><button class="ghost" data-act="cancelSub">انصراف</button></div>`);
  }
  return `<div class="actions"><button class="primary" data-act="editItem" data-code="new">+ کالای جدید</button></div>` + card('', s.items.map(i => {
    const st = C.itemStatus(i.code);
    return `<button class="listrow" data-act="editItem" data-code="${esc(i.code)}"><span><b>${esc(C.itemLabel(i))}</b><br><small>${esc(i.type)} | ${fmt(C.itemEffPrice(i.code))} هر ${esc(C.itemPriceUnit(i))}</small></span><span>${fq(C.itemStock(i.code))} ${esc(i.unit)}<br><small class="${st === 'کافی' ? 'pos' : 'neg'}">${st}</small></span></button>`;
  }).join(''));
}
function pgProducts() {
  const s = C.S();
  if (sub) {
    const p = draft.product ||= (sub === 'new' ? { code: '', name: '', cat: '', post: '', assm: '', pack: '', listPrice: '', plates: [{ desc: 'پلیت ۱', upp: 1, h: '', m: '', model: '', fils: [{ item: '', grams: '' }] }], accs: [] } : JSON.parse(JSON.stringify(C.productBy(sub))));
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
  return `<div class="actions"><button class="primary" data-act="editProduct" data-code="new">+ محصول جدید</button></div>` + card('', s.products.map(p => {
    const c = C.productCalc(p), m = C.productMoves(p.code);
    return `<button class="listrow" data-act="editProduct" data-code="${esc(p.code)}"><span><b>${esc(C.productLabel(p))}</b><br><small>بها ${fmt(c.cost)} | پیشنهادی ${fmt(c.sug)}</small></span><span>موجودی ${fq(m.stock)}<br><small>تولید ${fq(m.made)} | فروش ${fq(m.sold)}</small></span></button>`;
  }).join('') || '<p class="muted">محصولی نیست.</p>');
}
function pgCustomers() {
  const s = C.S();
  if (sub) {
    const cu = s.customers.find(c => c.name === sub); const x = C.customerCalc(sub);
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
function pgBackup() {
  const t = C.csvTables();
  return card('پشتیبان', `<p class="muted">همه داده‌ها فقط روی همین گوشی ذخیره می‌شوند. هر هفته یک فایل پشتیبان بگیرید و جای دیگری نگه دارید.</p>
    <div class="actions"><button class="primary" data-act="backup">گرفتن فایل پشتیبان</button><label class="ghost filebtn">بازگردانی از فایل<input type="file" accept=".json,application/json" id="restoreFile" hidden></label></div>`) +
    card('خروجی برای Excel (CSV)', `<p class="muted">هر جدول یک فایل CSV می‌شود که در Excel باز می‌شود.</p>` + Object.keys(t).map(k => `<button class="ghost" data-act="csv" data-t="${esc(k)}">${esc(k)}</button>`).join(' ')) +
    card('شروع از صفر', `<p class="muted">همه اسناد پاک می‌شود و فقط کالاها، محصولات، حساب‌ها، مشتریان و تنظیمات می‌ماند.</p><button class="ghost danger" data-act="wipeDocs">حذف همه اسناد</button>`);
}
function pgMore() { return card('', MORE.map(([k, t]) => `<button class="listrow" data-go="${k}"><span>${t}</span><span>‹</span></button>`).join('')); }

// ------------------------------------------------------------------ events
function parseDates(obj, keys) {
  const out = { ...obj };
  for (const k of keys) { const iso = C.isoOfJ(obj[k]); if (!iso) throw new Error('تاریخ را به شکل ۱۴۰۵/۰۷/۲۰ وارد کنید.'); out[k] = iso; }
  return out;
}
const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
async function nativeShareFile(name, text) {
  const { Filesystem, Share } = window.Capacitor.Plugins;
  const r = await Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
  await Share.share({ title: name, url: r.uri, dialogTitle: name });
}
function download(name, text, mime) {
  if (isNative()) { nativeShareFile(name, text).catch(e => toast('ذخیره فایل ممکن نشد: ' + e.message, true)); return; }
  const blob = new Blob([text], { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: mime })] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    navigator.share({ files: [new File([blob], name, { type: mime })], title: name }).catch(() => {});
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const csvOf = rows => '﻿' + rows.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n');

document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.bind) {
    let v = el.type === 'checkbox' ? el.checked : el.value;
    setPath(el.dataset.bind, v);
    if (el.dataset.kind === 'date') el.classList.toggle('bad', !C.isoOfJ(el.value));
    if (el.dataset.rerender !== undefined && el.tagName === 'SELECT') return; // handled on change
    refreshLive();
  } else if (el.dataset.set) {
    const k = el.dataset.set, s = C.S().settings;
    s[k] = typeof C.defaultState().settings[k] === 'number' ? C.num(el.value) : el.value; C.save();
  } else if (el.dataset.list) {
    C.S().lists[el.dataset.list] = el.value.split('\n').map(x => x.trim()).filter(Boolean); C.save();
  } else if (el.dataset.cust) {
    const cu = C.S().customers.find(c => c.name === sub); if (cu) { cu[el.dataset.cust] = el.value; C.save(); }
  } else if (el.dataset.accopen) {
    const a = C.S().accounts.find(x => x.name === el.dataset.accopen); if (a) { a.open = C.num(el.value); C.save(); }
  }
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
  if (el.id === 'restoreFile' && el.files[0]) {
    const r = new FileReader();
    r.onload = async () => {
      try { const obj = JSON.parse(r.result); if (!obj.settings || !obj.items) throw new Error();
        if (!confirm('همه داده‌های فعلی با فایل پشتیبان جایگزین شود؟')) return;
        C.replaceState(obj); await commit('بازگردانی انجام شد.'); } catch (err) { toast('فایل پشتیبان معتبر نیست.', true); }
    };
    r.readAsText(el.files[0]);
  }
});
document.addEventListener('click', async e => {
  const b = e.target.closest('button,[data-go]'); if (!b) return;
  if (b.dataset.go) { go(b.dataset.go); return; }
  const a = b.dataset.act; if (!a) return;
  const s = C.S();
  try {
    switch (a) {
      case 'addLine': draft[b.dataset.k].lines.push(b.dataset.k === 'sale' ? { product: '', qty: '', price: '' } : { item: '', newName: '', newType: '', newColor: '', pkgs: '', perPkg: '', price: '' }); render(); break;
      case 'delLine': draft[b.dataset.k].lines.splice(+b.dataset.i, 1); render(); break;
      case 'reset': if (confirm('فرم پاک شود؟')) { resetDraft(b.dataset.k); render(); } break;
      case 'setKind': draft.sale.kind = b.dataset.v; render(); break;
      case 'saveSale': {
        const f = parseDates(draft.sale, ['date']); const pv = C.salePreview(f);
        if (!confirm(`${f.kind} ثبت شود؟\nمشتری: ${f.customer}\nمبلغ کل: ${fmt(pv.total)} تومان${f.kind === 'هدیه' ? '' : `\nپرداختی: ${fmt(pv.rcv)}\nمانده: ${fmt(pv.remain)}`}`)) break;
        const no = C.registerSale(f); resetDraft('sale'); await C.save(); toast(`${f.kind} ${no} ثبت شد.`); go('invoices', no); break;
      }
      case 'saveBuy': {
        const f = parseDates(draft.buy, ['date']); const pv = C.purchasePreview(f);
        if (!confirm(`خرید ثبت شود؟\nجمع پرداختی از «${f.acc}»: ${fmt(pv.total)} تومان`)) break;
        const doc = C.registerPurchase(f); resetDraft('buy'); await commit(`خرید ${doc} ثبت شد و موجودی به‌روز شد.`); break;
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
        if (!confirm(`تولید ثبت شود؟\nسالم: ${f.good || 0}  خراب: ${f.fail || 0}\nبهای کل: ${fmt(pv.total)}\nهر محصول سالم: ${fmt(pv.unit)}`)) break;
        const r = C.registerProduction(f); resetDraft('prod'); await commit(`تولید ${r.doc} ثبت شد.`); break;
      }
      case 'savePay': {
        const f = parseDates(draft.pay, ['date']);
        C.registerCash({ ...f, type: 'دریافت از مشتری', desc: f.desc || 'پرداخت بدهی' });
        const name = f.customer; resetDraft('pay'); await commit(`دریافت ثبت شد. بدهی فعلی ${name}: ${fmt(C.customerCalc(name).debt)}`); break;
      }
      case 'custPay': draft.pay.customer = b.dataset.name; go('pay'); break;
      case 'saveCash': { const f = parseDates(draft.cash, ['date']); C.registerCash({ ...f, hours: hoursOf(f.hours) }); resetDraft('cash'); await commit('ثبت شد.'); break; }
      case 'saveAdj': { const f = parseDates(draft.adj, ['date']); C.registerAdjustment(f); resetDraft('adj'); await commit('ثبت شد.'); break; }
      case 'openInv': go('invoices', b.dataset.no); break;
      case 'print': {
        if (!isNative()) { window.print(); break; }
        const inv = s.invoices.find(i => i.no === sub);
        download(`فاکتور-${sub}.html`, `<!doctype html><html dir="rtl" lang="fa"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${PRINT_CSS}</style>${invoiceHtml(inv)}</html>`, 'text/html');
        break;
      }
      case 'shareInv': { const inv = s.invoices.find(i => i.no === b.dataset.no); const t = invoiceText(inv);
        if (navigator.share) navigator.share({ text: t }).catch(() => {}); else { await navigator.clipboard.writeText(t); toast('متن فاکتور کپی شد.'); } break; }
      case 'delDoc': if (confirm('این سند حذف شود؟')) { C.deleteDoc(b.dataset.k, b.dataset.key); await commit('حذف شد.'); } break;
      case 'editItem': draft.item = null; go('items', b.dataset.code); break;
      case 'saveItem': {
        const it = draft.item; if (!it.name || !it.type) throw new Error('نوع و نام کالا را وارد کنید.');
        const clean = { ...it, initPrice: C.num(it.initPrice), overridePrice: C.num(it.overridePrice), initStock: C.num(it.initStock), minStock: C.num(it.minStock), unit: it.unit || (it.type === 'فیلامنت' ? 'گرم' : 'عدد') };
        if (sub === 'new') { clean.code = C.nextCode(s.items.filter(i => i.code.startsWith({ 'فیلامنت': 'F', 'اکسسوری': 'A', 'بسته‌بندی': 'B', 'لوازم مصرفی': 'C', 'قطعات یدکی': 'S' }[it.type] + '-')), { 'فیلامنت': 'F', 'اکسسوری': 'A', 'بسته‌بندی': 'B', 'لوازم مصرفی': 'C', 'قطعات یدکی': 'S' }[it.type]); s.items.push(clean); }
        else Object.assign(C.itemBy(sub), clean);
        draft.item = null; sub = null; await commit('ذخیره شد.'); break;
      }
      case 'cancelSub': draft.item = null; draft.product = null; sub = null; render(); break;
      case 'editProduct': draft.product = null; go('products', b.dataset.code); break;
      case 'pAddPlate': draft.product.plates.push({ desc: `پلیت ${draft.product.plates.length + 1}`, upp: 1, h: '', m: '', model: '', fils: [{ item: '', grams: '' }] }); render(); break;
      case 'pDelPlate': draft.product.plates.splice(+b.dataset.i, 1); render(); break;
      case 'pAddFil': draft.product.plates[+b.dataset.i].fils.push({ item: '', grams: '' }); render(); break;
      case 'pAddAcc': draft.product.accs.push({ item: '', qty: 1, lost: false }); render(); break;
      case 'pDelAcc': draft.product.accs.splice(+b.dataset.i, 1); render(); break;
      case 'saveProduct': {
        const p = draft.product; if (!p.name) throw new Error('نام محصول را وارد کنید.');
        const clean = { ...p, post: C.num(p.post), assm: C.num(p.assm), pack: C.num(p.pack), listPrice: C.num(p.listPrice),
          plates: p.plates.map(pl => ({ ...pl, upp: C.num(pl.upp) || 1, h: C.num(pl.h), m: C.num(pl.m), model: C.num(pl.model), fils: pl.fils.filter(f => f.item).map(f => ({ item: f.item, grams: C.num(f.grams) })) })),
          accs: p.accs.filter(x => x.item).map(x => ({ item: x.item, qty: C.num(x.qty), lost: !!x.lost })) };
        if (sub === 'new') { clean.code = C.nextCode(s.products, 'P'); s.products.push(clean); } else Object.assign(C.productBy(sub), clean);
        draft.product = null; sub = null; await commit('محصول ذخیره شد.'); break;
      }
      case 'openCust': go('customers', b.dataset.name); break;
      case 'openAcc': go('accounts', b.dataset.name); break;
      case 'addAcc2': { const n = $('#newAcc').value.trim(); if (!n) break; if (s.accounts.find(x => x.name === n)) throw new Error('این حساب هست.'); s.accounts.push({ name: n, open: 0 }); await commit('حساب اضافه شد.'); break; }
      case 'saveAsset': {
        const x = parseDates(draft.asset, ['date']); if (!x.name || C.num(x.cost) <= 0) throw new Error('نام و مبلغ دارایی را وارد کنید.');
        s.assets.push({ code: C.nextCode(s.assets, 'AST'), name: x.name, date: x.date, cost: C.num(x.cost), salv: C.num(x.salv), life: C.num(x.life), dtype: x.dtype });
        draft.asset = null; await commit('دارایی اضافه شد.'); break;
      }
      case 'backup': download(`P1S-backup-${C.todayJ().replace(/\//g, '-')}.json`, JSON.stringify(s), 'application/json'); break;
      case 'csv': download(`${b.dataset.t}.csv`, csvOf(C.csvTables()[b.dataset.t]), 'text/csv;charset=utf-8'); break;
      case 'wipeDocs': if (confirm('همه اسناد حذف شود؟ این کار برگشت‌پذیر نیست.') && confirm('مطمئن هستید؟')) {
        Object.assign(s, { purchases: [], productions: [], invoices: [], cash: [], adjustments: [] }); await commit('همه اسناد حذف شد.'); } break;
    }
  } catch (err) { toast(err.message || String(err), true); console.error(err); }
});
$('#back').addEventListener('click', () => { if (sub) { sub = null; draft.item = null; draft.product = null; render(); } else go('more'); });

(async () => {
  await C.load();
  ['sale', 'buy', 'prod', 'pay', 'cash', 'adj'].forEach(resetDraft);
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
