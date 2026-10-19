'use strict';
/* Invoice as PDF: the invoice is drawn on A4 canvases (the browser shapes the Persian text with Vazirmatn),
   each page is turned into a JPEG and the pages are wrapped in a small hand-written PDF file. No libraries needed. */

const Pdf = (() => {
  const W = 1240, H = 1754, M = 80, R = W - M;          // A4 at 150 dpi
  const NAVY = '#1b1e25', BLUE = '#1f5eff', INK = '#1e293b', MUTED = '#64748b', LINE = '#e2e8f0';
  const fa = s => String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const money = n => Math.round(Core.num(n)).toLocaleString('fa-IR');
  const qty = n => { const v = Core.num(n); return (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : Core.round(v, 1)).toLocaleString('fa-IR'); };
  const font = (size, bold) => `${bold ? 700 : 400} ${size}px Vazirmatn, Tahoma, sans-serif`;

  async function fontsReady() {
    try { await Promise.all([document.fonts.load(font(30, false)), document.fonts.load(font(30, true))]); } catch (e) {}
  }
  function page() {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.direction = 'rtl'; x.textBaseline = 'middle';
    return { c, x };
  }
  function fit(x, text, max) {
    text = String(text ?? '');
    if (x.measureText(text).width <= max) return text;
    while (text.length > 1 && x.measureText(text + '…').width > max) text = text.slice(0, -1);
    return text + '…';
  }

  function drawInvoice(inv, logo) {
    const S = Core.S(), s = S.settings, c = Core.invoiceCalc(inv), cust = S.customers.find(x => x.name === inv.customer) || {};
    const gift = inv.kind === 'هدیه', isBrand = /^voxara\.?3d$/i.test(String(s.bizName || '').trim());
    const pages = []; let pg, x, y;
    const text = (t, px, py, o = {}) => {
      x.font = font(o.size || 26, o.bold); x.fillStyle = o.color || INK; x.textAlign = o.align || 'right';
      x.fillText(o.max ? fit(x, t, o.max) : String(t), px, py);
    };
    const hline = (py, color = LINE, w = 2) => { x.fillStyle = color; x.fillRect(M, py, W - 2 * M, w); };

    const cols = [{ t: 'ردیف', w: 90 }, { t: 'شرح کالا', w: 0 }, { t: 'تعداد', w: 130 }, { t: 'قیمت واحد (تومان)', w: 230 }, { t: 'مبلغ (تومان)', w: 240 }];
    cols[1].w = (W - 2 * M) - cols.reduce((a, k) => a + k.w, 0);
    let edge = R; for (const k of cols) { k.r = edge; k.l = edge - k.w; edge = k.l; }
    const ROW = 58;

    function newPage(first, table = true) {
      pg = page(); x = pg.x; pages.push(pg); y = M;
      x.fillStyle = BLUE; x.fillRect(0, 0, W, 14);
      if (logo) { // logo on every page, large on the first one
        const lh = first ? 210 : 110, lw = lh * logo.naturalWidth / logo.naturalHeight;
        x.drawImage(logo, (W - lw) / 2, y - 30, lw, lh); y += lh - 10;
      }
      if (!logo || !isBrand) { text(s.bizName || '', W / 2, y + 26, { size: first ? 54 : 40, bold: true, color: NAVY, align: 'center' }); y += first ? 78 : 62; }
      if (first && s.bizInfo) { text(s.bizInfo, W / 2, y, { size: 24, color: MUTED, align: 'center', max: W - 2 * M }); y += 44; }
      hline(y); y += 40;
      text(gift ? 'حواله هدیه' : 'فاکتور فروش', R, y, { size: 34, bold: true, color: BLUE });
      text(`شماره: ${inv.no}`, W / 2, y, { size: 26, align: 'center' });
      text(`تاریخ: ${fa(Core.jOfIso(inv.date))}`, M, y, { size: 26, align: 'left' });
      y += 54;
      if (first) {
        text(`${gift ? 'گیرنده' : 'مشتری'}: ${inv.customer}`, R, y, { size: 26, max: 640 });
        const extra = [cust.phone ? `تلفن: ${fa(cust.phone)}` : '', cust.city ? `شهر: ${cust.city}` : ''].filter(Boolean).join('   ');
        if (extra) text(extra, M, y, { size: 24, color: MUTED, align: 'left', max: 420 });
        y += 54;
      }
      if (!table) return;
      // table header
      x.fillStyle = NAVY; x.fillRect(M, y, W - 2 * M, ROW);
      for (const k of cols) text(k.t, (k.l + k.r) / 2, y + ROW / 2, { size: 23, bold: true, color: '#fff', align: 'center', max: k.w - 12 });
      y += ROW;
    }
    newPage(true);
    const BOTTOM = H - M - 60;
    inv.lines.forEach((l, i) => {
      if (y + ROW > BOTTOM) { text('ادامه در صفحه بعد', W / 2, BOTTOM + 30, { size: 22, color: MUTED, align: 'center' }); newPage(false); }
      if (i % 2) { x.fillStyle = '#f8fafc'; x.fillRect(M, y, W - 2 * M, ROW); }
      const cy = y + ROW / 2;
      text(qty(i + 1), (cols[0].l + cols[0].r) / 2, cy, { align: 'center' });
      text(l.name, cols[1].r - 14, cy, { max: cols[1].w - 28 });
      text(qty(l.qty), (cols[2].l + cols[2].r) / 2, cy, { align: 'center' });
      text(money(l.price), (cols[3].l + cols[3].r) / 2, cy, { align: 'center', max: cols[3].w - 12 });
      text(money(l.qty * l.price), (cols[4].l + cols[4].r) / 2, cy, { align: 'center', max: cols[4].w - 12 });
      y += ROW; hline(y - 2);
    });

    const tot = [['جمع اقلام', money(inv.gross)]];
    if (inv.disc) tot.push(['تخفیف', money(inv.disc)]);
    if (inv.shipIn) tot.push(['هزینه ارسال', money(inv.shipIn)]);
    tot.push(['مبلغ قابل پرداخت', money(inv.total), 1]);
    if (!gift) {
      tot.push(['پرداخت‌شده', money(c.rcv)]);
      if (c.credit) tot.push(['مرجوعی', money(c.credit)]);
      tot.push(['مانده', money(c.due), c.due > 0.5 ? 2 : 0]);
    }
    const TROW = 54, need = 40 + tot.length * TROW + (inv.note ? 70 : 0) + 110;
    if (y + need > H - M) newPage(false, false);
    y += 36;
    const bw = 560, bl = M, br = M + bw;
    tot.forEach(([k, v, hl]) => {
      if (hl === 1) { x.fillStyle = '#e8efff'; x.fillRect(bl, y, bw, TROW); }
      text(k, br - 16, y + TROW / 2, { size: 25, color: hl === 1 ? NAVY : MUTED, bold: hl === 1 });
      text(v + ' تومان', bl + 16, y + TROW / 2, { size: 26, bold: !!hl, color: hl === 2 ? '#b91c1c' : hl === 1 ? NAVY : INK, align: 'left' });
      y += TROW; x.fillStyle = LINE; x.fillRect(bl, y - 1, bw, 2);
    });
    if (!gift) {
      const st = c.due > 0.5 ? 'وضعیت: نسیه' : 'وضعیت: تسویه شده';
      text(st, R, y - TROW * tot.length / 2, { size: 30, bold: true, color: c.due > 0.5 ? '#b91c1c' : '#15803d' });
    }
    y += 30;
    if (inv.note) { text(`توضیحات: ${inv.note}`, R, y + 20, { size: 24, max: W - 2 * M }); y += 70; }
    text('با سپاس از خرید شما', W / 2, H - M - 10, { size: 26, color: MUTED, align: 'center' });
    pages.forEach((p, i) => {
      x = p.x;
      if (pages.length > 1) text(`صفحه ${fa(i + 1)} از ${fa(pages.length)}`, M, H - 40, { size: 20, color: MUTED, align: 'left' });
      x.fillStyle = BLUE; x.fillRect(0, H - 14, W, 14);
    });
    return pages.map(p => p.c);
  }

  // ------------------------------------------------------------------ minimal PDF writer: one full-page JPEG per page
  function jpegBytes(canvas) {
    const b64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
    const bin = atob(b64), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return { bytes: out, w: canvas.width, h: canvas.height };
  }
  function build(images) {
    const enc = new TextEncoder(), chunks = [], offs = [];
    let len = 0;
    const add = d => { const b = typeof d === 'string' ? enc.encode(d) : d; chunks.push(b); len += b.length; };
    const obj = (id, body) => { offs[id] = len; add(`${id} 0 obj\n`); body(); add('\nendobj\n'); };
    const PW = 595.28, PH = 841.89, n = images.length;
    add('%PDF-1.4\n'); add(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    obj(1, () => add('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => add(`<< /Type /Pages /Kids [${images.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] /Count ${n} >>`));
    images.forEach((im, i) => {
      const p = 3 + 3 * i, cs = `q ${PW} 0 0 ${PH} 0 0 cm /Im${i} Do Q`;
      obj(p, () => add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im${i} ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`));
      obj(p + 1, () => add(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`));
      obj(p + 2, () => {
        add(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`);
        add(im.bytes); add('\nendstream');
      });
    });
    const size = 3 + 3 * n, xref = len;
    add(`xref\n0 ${size}\n0000000000 65535 f \n`);
    for (let id = 1; id < size; id++) add(String(offs[id]).padStart(10, '0') + ' 00000 n \n');
    add(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(chunks, { type: 'application/pdf' });
  }

  let logoImg = null;
  async function loadLogo() {
    if (logoImg) return logoImg;
    try { const im = new Image(); im.src = 'icons/logo.png'; await im.decode(); logoImg = im; } catch (e) { logoImg = null; }
    return logoImg;
  }
  async function invoice(inv) {
    await fontsReady();
    return build(drawInvoice(inv, await loadLogo()).map(jpegBytes));
  }
  return { invoice };
})();
