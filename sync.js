'use strict';
/* Voxara.3d – shared data on a private GitHub repository (file db.json), users and offline queue.
   Every change is an "op" (see Core.apply). It is applied to the local copy at once, queued, and then
   replayed on the newest server copy and saved with the file's sha, so two phones never overwrite each other. */

const Sync = (() => {
  const C = Core;
  const FILE = 'db.json', CONN = 'vx-conn', SESSION = 'vx-session';
  let conn = readLs(CONN), session = readLs(SESSION);
  let queue = [], failed = [], sha = null, lastSync = null;
  let status = 'idle', error = '', flushing = false, timer = null, pollTimer = null;
  const listeners = new Set();

  function readLs(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function writeLs(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  const notify = () => listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  function setStatus(s, err = '') { status = s; error = err; notify(); }

  // ------------------------------------------------------------------ base64 (UTF-8 safe)
  function bytesToB64(bytes) {
    let bin = ''; const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }
  function b64ToBytes(b64) { const bin = atob(String(b64).replace(/\s/g, '')); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  const textToB64 = t => bytesToB64(new TextEncoder().encode(t));
  const b64ToText = b => new TextDecoder().decode(b64ToBytes(b));

  // ------------------------------------------------------------------ connection code (owner/repo/token in one string for other phones)
  function makeCode(c) { return 'VX1.' + textToB64(JSON.stringify({ o: c.owner, r: c.repo, t: c.token })); }
  function parseCode(code) {
    const s = String(code || '').trim();
    if (!s.startsWith('VX1.')) throw new Error('کد اتصال درست نیست.');
    const j = JSON.parse(b64ToText(s.slice(4)));
    return { owner: j.o, repo: j.r, token: j.t };
  }

  // ------------------------------------------------------------------ GitHub REST API
  const apiBase = () => (conn && conn.api) || 'https://api.github.com';
  async function gh(path, opts = {}) {
    let res;
    try {
      res = await fetch(apiBase() + path, {
        method: opts.method || 'GET', cache: 'no-store',
        headers: { Authorization: 'Bearer ' + conn.token, Accept: opts.accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
    } catch (e) { const err = new Error('اینترنت در دسترس نیست.'); err.offline = true; throw err; }
    if (res.status === 401) throw new Error('کد اتصال نامعتبر یا منقضی شده است. از ادمین کد جدید بگیرید.');
    if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') throw new Error('محدودیت تعداد درخواست GitHub؛ چند دقیقه بعد دوباره امتحان کنید.');
    return res;
  }
  const contentsPath = () => `/repos/${encodeURIComponent(conn.owner)}/${encodeURIComponent(conn.repo)}/contents/${FILE}`;
  async function testRepo(c) {
    const keep = conn; conn = c;
    try {
      const res = await gh(`/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`);
      if (res.status === 404) throw new Error('مخزن پیدا نشد یا توکن به آن دسترسی ندارد.');
      if (!res.ok) throw new Error('خطای GitHub: ' + res.status);
      const j = await res.json();
      if (j.permissions && j.permissions.push === false) throw new Error('توکن اجازه نوشتن (Contents: Read and write) ندارد.');
      if (j.private === false) throw new Error('مخزن داده باید Private باشد؛ این مخزن عمومی است.');
      const r = await fetchRemote();
      return { exists: !!r.state, state: r.state, sha: r.sha };
    } finally { conn = keep; }
  }
  async function fetchRemote() {
    const res = await gh(contentsPath() + '?t=' + Date.now());
    if (res.status === 404) return { state: null, sha: null };
    if (!res.ok) throw new Error('خواندن داده از GitHub ممکن نشد: ' + res.status);
    const j = await res.json();
    let text;
    if (j.encoding === 'base64' && j.content) text = b64ToText(j.content);
    else { // files over 1 MB: ask for the raw file
      const raw = await gh(contentsPath() + '?t=' + Date.now(), { accept: 'application/vnd.github.raw' });
      if (!raw.ok) throw new Error('خواندن داده از GitHub ممکن نشد: ' + raw.status);
      text = await raw.text();
    }
    return { state: JSON.parse(text), sha: j.sha };
  }
  async function putRemote(obj, prevSha, message) {
    const res = await gh(contentsPath(), { method: 'PUT', body: { message, content: textToB64(JSON.stringify(obj)), ...(prevSha ? { sha: prevSha } : {}) } });
    if (res.status === 409 || res.status === 422) { const e = new Error('conflict'); e.conflict = true; throw e; }
    if (!res.ok) throw new Error('ذخیره روی GitHub ممکن نشد: ' + res.status);
    const j = await res.json();
    return j.content.sha;
  }

  // ------------------------------------------------------------------ passwords (PBKDF2-SHA256)
  const ITER = 120000;
  async function pbkdf2(password, salt, iter) {
    const pw = new TextEncoder().encode(password);
    if (window.crypto && crypto.subtle) {
      const key = await crypto.subtle.importKey('raw', pw, 'PBKDF2', false, ['deriveBits']);
      return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
    }
    return Sha.pbkdf2(pw, salt, iter, 32);
  }
  async function hashPassword(password) {
    const salt = new Uint8Array(16); crypto.getRandomValues(salt);
    return { salt: bytesToB64(salt), hash: bytesToB64(await pbkdf2(password, salt, ITER)), iter: ITER };
  }
  async function checkPassword(u, password) {
    const h = bytesToB64(await pbkdf2(password, b64ToBytes(u.salt), u.iter || ITER));
    return h === u.hash;
  }

  // ------------------------------------------------------------------ startup, connect, login
  async function init() {
    await C.load();
    queue = (await C.kvGet('queue')) || [];
    failed = (await C.kvGet('failed')) || [];
    const meta = (await C.kvGet('meta')) || {};
    sha = meta.sha || null; lastSync = meta.lastSync || null;
    if (session && (!C.S() || !activeUser())) session = null;
    window.addEventListener('online', () => flush());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flush(); });
    clearInterval(pollTimer); pollTimer = setInterval(() => { if (document.visibilityState === 'visible') flush(); }, 45000);
  }
  const activeUser = () => session && C.S() ? (C.S().users || []).find(u => u.name === session.name && u.active) : null;
  async function saveMeta() { await C.kvSet('meta', { sha, lastSync }); }
  async function connect(c, remote) {
    conn = { owner: c.owner.trim(), repo: c.repo.trim(), token: c.token.trim(), ...(c.api ? { api: c.api } : {}) };
    writeLs(CONN, conn);
    if (remote && remote.state) {
      C.replaceState(remote.state); sha = remote.sha; lastSync = new Date().toISOString();
      queue = []; await C.kvSet('queue', queue); await C.save(); await saveMeta();
    }
  }
  // first time: create db.json with the first admin (and optionally the data from a backup file)
  async function createDatabase(c, admin, fromBackup) {
    const st = C.defaultState();
    if (fromBackup) { if (!fromBackup.settings || !fromBackup.items) throw new Error('فایل پشتیبان معتبر نیست.'); Object.assign(st, C.clone(fromBackup)); }
    st.users = [{ name: admin.name.trim(), full: admin.full || '', role: 'admin', ...(await hashPassword(admin.password)), active: true, created: new Date().toISOString() }];
    const keep = conn; conn = { owner: c.owner.trim(), repo: c.repo.trim(), token: c.token.trim(), ...(c.api ? { api: c.api } : {}) };
    try {
      C.withState(st, () => {}); // migrate
      const newSha = await putRemote(st, null, 'Create Voxara.3d database');
      await connect(conn, { state: st, sha: newSha });
    } catch (e) { conn = keep; if (e.conflict) throw new Error('پایگاه داده از قبل وجود دارد؛ «اتصال» را بزنید.'); throw e; }
  }
  async function login(name, password) {
    const u = (C.S().users || []).find(x => x.name === String(name).trim());
    if (!u || !(await checkPassword(u, password))) throw new Error('نام کاربری یا رمز اشتباه است.');
    if (!u.active) throw new Error('این کاربر غیرفعال شده است.');
    session = { name: u.name }; writeLs(SESSION, session); notify();
    flush();
  }
  function logout() { session = null; writeLs(SESSION, null); notify(); }
  async function disconnect() {
    if (queue.length && !confirm(`${queue.length.toLocaleString('fa-IR')} تغییر هنوز به سرور نرسیده و پاک می‌شود. ادامه می‌دهید؟`)) return false;
    logout(); conn = null; writeLs(CONN, null); queue = []; sha = null;
    await C.kvSet('queue', []); await C.kvSet('state', null); await saveMeta(); C.replaceState(null); notify();
    return true;
  }

  // ------------------------------------------------------------------ changes
  const COALESCE = { setSetting: a => a.key, setList: a => a.key, setCustomer: a => a.name + '|' + a.key, setAccountOpen: a => a.name };
  async function run(type, args) {
    const u = activeUser(); if (!u) throw new Error('دوباره وارد شوید.');
    const op = { id: C.uid(), type, args: C.clone(args ?? {}), by: u.name, at: new Date().toISOString() };
    const result = C.apply(op);              // throws on invalid input; nothing is queued then
    if (COALESCE[type]) { const k = COALESCE[type](op.args); queue = queue.filter(o => !(o.type === type && COALESCE[type](o.args) === k)); }
    queue.push(op);
    await C.save(); await C.kvSet('queue', queue);
    notify();
    clearTimeout(timer); timer = setTimeout(flush, COALESCE[type] ? 2500 : 300);
    return result;
  }
  const describe = ops => ops.length === 1 ? `${ops[0].by}: ${ops[0].type}` : `${ops[0].by}: ${ops.length} changes`;
  async function flush() {
    if (flushing || !conn || !activeUser()) return;
    flushing = true; setStatus('sync');
    const rejected = [];
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const r = await fetchRemote();
        if (!r.state) throw new Error('فایل داده روی GitHub پیدا نشد.');
        const ops = queue.slice(), sent = new Set(ops.map(o => o.id));
        if (!ops.length && r.sha === sha) break;
        const work = r.state, bad = [];
        C.withState(work, () => { for (const op of ops) { try { C.apply(op); } catch (e) { bad.push({ op, msg: e.message }); } } });
        let newSha = r.sha;
        if (ops.length > bad.length) {
          try { newSha = await putRemote(work, r.sha, describe(ops)); } catch (e) { if (e.conflict) continue; throw e; }
        }
        // rebuild local copy = server copy + anything added while we were sending
        queue = queue.filter(o => !sent.has(o.id));
        const local = C.clone(work);
        C.withState(local, () => { for (const op of queue) { try { C.apply(op); } catch (e) { bad.push({ op, msg: e.message }); } } });
        queue = queue.filter(o => !bad.some(b => b.op.id === o.id));
        C.replaceState(local); sha = newSha; lastSync = new Date().toISOString();
        rejected.push(...bad);
        await C.save(); await C.kvSet('queue', queue); await saveMeta();
        break;
      }
      if (rejected.length) {
        failed = [...rejected.map(b => ({ at: b.op.at, by: b.op.by, type: b.op.type, msg: b.msg })), ...failed].slice(0, 50);
        await C.kvSet('failed', failed);
      }
      if (!activeUser()) session = null, writeLs(SESSION, null);
      setStatus(queue.length ? 'pending' : 'ok');
      if (rejected.length) Sync.onRejected && Sync.onRejected(rejected);
    } catch (e) {
      setStatus(e.offline ? 'offline' : 'error', e.message);
    } finally { flushing = false; }
    if (queue.length && status === 'ok') { clearTimeout(timer); timer = setTimeout(flush, 500); }
  }

  return {
    init, connect, testRepo, createDatabase, login, logout, disconnect, run, flush, hashPassword, checkPassword, makeCode, parseCode,
    on: f => listeners.add(f),
    conn: () => conn, user: activeUser, isAdmin: () => { const u = activeUser(); return !!u && u.role === 'admin'; },
    info: () => ({ status, error, pending: queue.length, lastSync, failed }),
    clearFailed: async () => { failed = []; await C.kvSet('failed', failed); notify(); },
    onRejected: null
  };
})();

/* Pure-JS SHA-256 / PBKDF2, used only where crypto.subtle is missing (old or non-secure web views). */
const Sha = (() => {
  const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d,
    0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function sha256(data) {
    const l = data.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n);
    m.set(data); m[l] = 0x80; const dv = new DataView(m.buffer); dv.setUint32(n - 4, l * 8); dv.setUint32(n - 8, Math.floor(l / 0x20000000));
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), w = new Uint32Array(64);
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = w[i - 15], b = w[i - 2];
        w[i] = (((a >>> 7 | a << 25) ^ (a >>> 18 | a << 14) ^ (a >>> 3)) + w[i - 7] + ((b >>> 17 | b << 15) ^ (b >>> 19 | b << 13) ^ (b >>> 10)) + w[i - 16]) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + ((e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = (((a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    const out = new Uint8Array(32), ov = new DataView(out.buffer); H.forEach((v, i) => ov.setUint32(i * 4, v)); return out;
  }
  function hmac(key, msg) {
    if (key.length > 64) key = sha256(key);
    const k = new Uint8Array(64); k.set(key);
    const ip = new Uint8Array(64 + msg.length), op = new Uint8Array(96);
    for (let i = 0; i < 64; i++) { ip[i] = k[i] ^ 0x36; op[i] = k[i] ^ 0x5c; }
    ip.set(msg, 64); op.set(sha256(ip), 64); return sha256(op);
  }
  function pbkdf2(pw, salt, iter, len) {
    const s = new Uint8Array(salt.length + 4); s.set(salt); s[salt.length + 3] = 1;
    let u = hmac(pw, s); const t = u.slice();
    for (let i = 1; i < iter; i++) { u = hmac(pw, u); for (let j = 0; j < 32; j++) t[j] ^= u[j]; }
    return t.slice(0, len);
  }
  return { sha256, pbkdf2 };
})();
