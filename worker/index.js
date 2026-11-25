/* =========================================================
   혜화담 로그인 · 관리자 서버 (Cloudflare Worker)
   - 카카오 · 네이버 로그인, 회원 목록(D1 데이터베이스)
   - 관리자: 메뉴 · 사진 · 설명 수정 → GitHub 저장소의 data/menu.json 에 저장
   - 예약 · 문의 접수(메뉴 상세 · 떡체험 화면의 폼) → D1 에 저장, 관리자 화면에서 확인
   이 파일 하나를 Cloudflare 대시보드의 Worker 편집기에 그대로 붙여 넣으면 됩니다.
   설정 방법은 저장소의 「로그인_관리자_설정안내.md」를 보세요.

   필요한 설정값 (Worker → Settings → Variables and Secrets)
     SITE_URL            홈페이지 주소 (예: https://dlawngns94.github.io/hyehwadam/)
     SESSION_SECRET      아무도 모르는 긴 문자열 32자 이상 (비밀)
     ADMIN_IDS           관리자 회원번호, 쉼표로 구분 (예: kakao:123456,naver:abcd)
     KAKAO_REST_KEY      카카오 REST API 키
     KAKAO_CLIENT_SECRET 카카오 Client Secret (켜 둔 경우만, 비밀)
     NAVER_CLIENT_ID     네이버 Client ID
     NAVER_CLIENT_SECRET 네이버 Client Secret (비밀)
     GITHUB_TOKEN        GitHub 토큰 (hyehwadam 저장소 Contents 읽기·쓰기만, 비밀)
     GITHUB_REPO         dlawngns94/hyehwadam
     GITHUB_BRANCH       main (생략 가능)
     EXTRA_ORIGINS       추가로 허용할 사이트 주소, 쉼표로 구분 (생략 가능)
   바인딩: D1 데이터베이스를 이름 DB 로 연결
   ========================================================= */

const enc = new TextEncoder();
const dec = new TextDecoder();
const SESSION_DAYS = 30;
const NEXT_PAGES = ["mypage", "admin"];

class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.code, message: err.message }, err.status, request, env);
      console.error("[혜화담 서버]", err && err.stack || err);
      return json({ error: "server_error", message: "서버 오류가 났어요. 잠시 후 다시 시도해 주세요." }, 500, request, env);
    }
  }
};

/* ---------- 라우팅 ---------- */
async function route(req, env) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (req.method === "OPTIONS") return preflight(req, env);
  if (path === "/") return new Response("혜화담 서버가 동작 중입니다.", { headers: { "Content-Type": "text/plain; charset=utf-8" } });

  const auth = path.match(/^\/auth\/(kakao|naver)\/(start|callback)$/);
  if (auth && req.method === "GET") {
    checkConfig(env);
    return auth[2] === "start" ? authStart(auth[1], url, env) : authCallback(auth[1], url, req, env);
  }

  if (path.startsWith("/api/")) {
    checkConfig(env);
    /* 예약·문의 접수 — 로그인 없이도 가능 (로그인했다면 회원번호를 함께 저장) */
    if (path === "/api/inquiries" && req.method === "POST") return json(await createInquiry(req, env), 200, req, env);
    const user = await requireUser(req, env);
    if (path === "/api/me" && req.method === "GET") return json(await getMe(user, env), 200, req, env);
    if (path === "/api/me/inquiries" && req.method === "GET") return json(await myInquiries(user, env), 200, req, env);
    if (path === "/api/me" && req.method === "DELETE") {
      await ensureTable(env);
      await env.DB.prepare("DELETE FROM members WHERE id = ?").bind(user.sub).run();
      await ensureInquiryTable(env);
      await env.DB.prepare("UPDATE inquiries SET member_id = NULL WHERE member_id = ?").bind(user.sub).run();
      return json({ ok: true }, 200, req, env);
    }
    if (path.startsWith("/api/admin/")) {
      if (!isAdmin(env, user.sub)) throw new HttpError(403, "forbidden", "관리자만 사용할 수 있어요.");
      if (path === "/api/admin/members" && req.method === "GET") return json(await listMembers(env), 200, req, env);
      if (path === "/api/admin/menu" && req.method === "GET") return json(await getMenu(env), 200, req, env);
      if (path === "/api/admin/menu" && req.method === "PUT") return json(await saveMenu(await readBody(req, 1_000_000), user, env), 200, req, env);
      if (path === "/api/admin/image" && req.method === "POST") return json(await saveImage(await readBody(req, 4_000_000), user, env), 200, req, env);
      if (path === "/api/admin/inquiries" && req.method === "GET") return json(await listInquiries(env), 200, req, env);
      const inq = path.match(/^\/api\/admin\/inquiries\/(\d{1,12})$/);
      if (inq && req.method === "PATCH") return json(await updateInquiry(Number(inq[1]), await readBody(req, 5000), env), 200, req, env);
      if (inq && req.method === "DELETE") return json(await deleteInquiry(Number(inq[1]), env), 200, req, env);
    }
  }
  throw new HttpError(404, "not_found", "없는 주소예요.");
}

function checkConfig(env) {
  if (!env.SITE_URL) throw new HttpError(500, "config", "SITE_URL 설정이 없어요.");
  if (!env.SESSION_SECRET || String(env.SESSION_SECRET).length < 32) throw new HttpError(500, "config", "SESSION_SECRET 을 32자 이상으로 설정해 주세요.");
  if (!env.DB) throw new HttpError(500, "config", "D1 데이터베이스(DB) 연결이 없어요.");
}
const siteUrl = env => String(env.SITE_URL).replace(/\/*$/, "/");

/* ---------- 응답 · CORS ---------- */
function allowedOrigin(req, env) {
  const o = req.headers.get("Origin");
  if (!o || !env.SITE_URL) return null;
  const list = [new URL(siteUrl(env)).origin, ...String(env.EXTRA_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean)];
  return list.includes(o) ? o : null;
}
function json(data, status, req, env) {
  const h = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  const o = allowedOrigin(req, env);
  if (o) { h["Access-Control-Allow-Origin"] = o; h["Vary"] = "Origin"; }
  return new Response(JSON.stringify(data), { status, headers: h });
}
function preflight(req, env) {
  const o = allowedOrigin(req, env);
  if (!o) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Origin": o, "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400"
  } });
}
const redirect = (to, extraHeaders = {}) => new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store", ...extraHeaders } });

async function readBody(req, max) {
  const len = Number(req.headers.get("Content-Length") || 0);
  if (len > max) throw new HttpError(413, "too_large", "보내는 내용이 너무 커요.");
  const text = await req.text();
  if (text.length > max) throw new HttpError(413, "too_large", "보내는 내용이 너무 커요.");
  try { return JSON.parse(text); } catch { throw new HttpError(400, "bad_json", "요청 형식이 잘못됐어요."); }
}

/* ---------- 서명 토큰 (로그인 유지 · 로그인 중간 확인용) ---------- */
function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const b64url = bytes => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function fromB64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function fromB64url(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return fromB64(s);
}
const keyCache = new Map();
function hmacKey(secret) {
  if (!keyCache.has(secret)) keyCache.set(secret, crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]));
  return keyCache.get(secret);
}
async function signToken(payload, secret) {
  const body = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" }))) + "." + b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body)));
  return body + "." + b64url(sig);
}
async function verifyToken(token, secret, kind) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(parts[2]), enc.encode(parts[0] + "." + parts[1]));
    if (!ok) return null;
    const payload = JSON.parse(dec.decode(fromB64url(parts[1])));
    if (payload.k !== kind || typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch { return null; }
}
const randomHex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, "0")).join("");
const now = () => Math.floor(Date.now() / 1000);

/* ---------- 카카오 · 네이버 로그인 ---------- */
const PROVIDERS = {
  kakao: {
    ready: env => !!env.KAKAO_REST_KEY,
    authorize: (env, redirectUri, state) => "https://kauth.kakao.com/oauth/authorize?" + new URLSearchParams({ client_id: env.KAKAO_REST_KEY, redirect_uri: redirectUri, response_type: "code", state }),
    async profile(env, code, redirectUri) {
      const body = new URLSearchParams({ grant_type: "authorization_code", client_id: env.KAKAO_REST_KEY, redirect_uri: redirectUri, code });
      if (env.KAKAO_CLIENT_SECRET) body.set("client_secret", env.KAKAO_CLIENT_SECRET);
      const t = await fetch("https://kauth.kakao.com/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" }, body });
      const tj = await t.json().catch(() => ({}));
      if (!t.ok || !tj.access_token) { console.error("[카카오 토큰]", t.status, JSON.stringify(tj)); throw new HttpError(400, "token"); }
      const u = await fetch("https://kapi.kakao.com/v2/user/me", { headers: { Authorization: `Bearer ${tj.access_token}` } });
      const uj = await u.json().catch(() => ({}));
      if (!u.ok || uj.id == null) { console.error("[카카오 정보]", u.status, JSON.stringify(uj)); throw new HttpError(400, "profile"); }
      const nickname = (uj.kakao_account && uj.kakao_account.profile && uj.kakao_account.profile.nickname) || (uj.properties && uj.properties.nickname) || "카카오 회원";
      return { id: "kakao:" + uj.id, provider: "kakao", nickname };
    }
  },
  naver: {
    ready: env => !!(env.NAVER_CLIENT_ID && env.NAVER_CLIENT_SECRET),
    authorize: (env, redirectUri, state) => "https://nid.naver.com/oauth2.0/authorize?" + new URLSearchParams({ response_type: "code", client_id: env.NAVER_CLIENT_ID, redirect_uri: redirectUri, state }),
    async profile(env, code, redirectUri, state) {
      const body = new URLSearchParams({ grant_type: "authorization_code", client_id: env.NAVER_CLIENT_ID, client_secret: env.NAVER_CLIENT_SECRET, code, state });
      const t = await fetch("https://nid.naver.com/oauth2.0/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" }, body });
      const tj = await t.json().catch(() => ({}));
      if (!t.ok || !tj.access_token) { console.error("[네이버 토큰]", t.status, JSON.stringify(tj)); throw new HttpError(400, "token"); }
      const u = await fetch("https://openapi.naver.com/v1/nid/me", { headers: { Authorization: `Bearer ${tj.access_token}` } });
      const uj = await u.json().catch(() => ({}));
      if (!u.ok || uj.resultcode !== "00" || !uj.response || !uj.response.id) { console.error("[네이버 정보]", u.status, JSON.stringify(uj)); throw new HttpError(400, "profile"); }
      const nickname = uj.response.nickname || uj.response.name || "네이버 회원";
      return { id: "naver:" + uj.response.id, provider: "naver", nickname };
    }
  }
};

function backToLogin(env, params, hash) {
  const q = new URLSearchParams(params).toString();
  return siteUrl(env) + "login.html" + (q ? "?" + q : "") + (hash ? "#" + hash : "");
}

async function authStart(provider, url, env) {
  const P = PROVIDERS[provider];
  if (!P.ready(env)) return redirect(backToLogin(env, {}, "error=not_configured"));
  const next = NEXT_PAGES.includes(url.searchParams.get("next")) ? url.searchParams.get("next") : "mypage";
  const nonce = randomHex(16);
  const state = await signToken({ k: "state", p: provider, n: nonce, x: next, exp: now() + 600 }, env.SESSION_SECRET);
  const redirectUri = `${url.origin}/auth/${provider}/callback`;
  return redirect(P.authorize(env, redirectUri, state), {
    "Set-Cookie": `hd_state=${nonce}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  });
}

async function authCallback(provider, url, req, env) {
  const clear = { "Set-Cookie": "hd_state=; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0" };
  const fail = code => redirect(backToLogin(env, {}, "error=" + code), clear);
  if (url.searchParams.get("error")) return fail("denied");
  const code = url.searchParams.get("code"), stateRaw = url.searchParams.get("state");
  const state = await verifyToken(stateRaw, env.SESSION_SECRET, "state");
  const cookie = (req.headers.get("Cookie") || "").match(/(?:^|;\s*)hd_state=([a-f0-9]+)/);
  if (!code || !state || state.p !== provider || !cookie || cookie[1] !== state.n) return fail("state");
  if (!PROVIDERS[provider].ready(env)) return fail("not_configured");

  let who;
  try {
    who = await PROVIDERS[provider].profile(env, code, `${url.origin}/auth/${provider}/callback`, stateRaw);
  } catch (err) {
    return fail(err instanceof HttpError ? err.code : "profile");
  }
  who.nickname = String(who.nickname).slice(0, 40);
  await ensureTable(env);
  const ts = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO members (id, provider, nickname, created_at, last_login) VALUES (?, ?, ?, ?, ?) " +
    "ON CONFLICT(id) DO UPDATE SET nickname = excluded.nickname, last_login = excluded.last_login"
  ).bind(who.id, who.provider, who.nickname, ts, ts).run();

  const token = await signToken({ k: "session", sub: who.id, nk: who.nickname, prv: who.provider, adm: isAdmin(env, who.id), iat: now(), exp: now() + SESSION_DAYS * 86400 }, env.SESSION_SECRET);
  return redirect(backToLogin(env, { next: state.x }, "token=" + token), clear);
}

/* ---------- 회원 ---------- */
let tableReady = false;
async function ensureTable(env) {
  if (tableReady) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, provider TEXT NOT NULL, nickname TEXT, created_at TEXT NOT NULL, last_login TEXT NOT NULL)").run();
  tableReady = true;
}
async function requireUser(req, env) {
  const m = (req.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/);
  const user = m && await verifyToken(m[1], env.SESSION_SECRET, "session");
  if (!user) throw new HttpError(401, "login_required", "다시 로그인해 주세요.");
  return user;
}
const isAdmin = (env, id) => String(env.ADMIN_IDS || "").split(",").map(s => s.trim()).filter(Boolean).includes(id);

async function getMe(user, env) {
  await ensureTable(env);
  const row = await env.DB.prepare("SELECT id, provider, nickname, created_at, last_login FROM members WHERE id = ?").bind(user.sub).first();
  if (!row) throw new HttpError(401, "login_required", "회원 정보가 없어요. 다시 로그인해 주세요.");
  const me = { id: row.id, provider: row.provider, nickname: row.nickname, createdAt: row.created_at, lastLogin: row.last_login, isAdmin: isAdmin(env, row.id) };
  if (me.isAdmin) {
    await ensureInquiryTable(env);
    const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM inquiries WHERE status = 'new'").first();
    me.newInquiries = c ? c.n : 0;
  }
  return me;
}
async function listMembers(env) {
  await ensureTable(env);
  const r = await env.DB.prepare("SELECT id, provider, nickname, created_at, last_login FROM members ORDER BY created_at DESC LIMIT 1000").all();
  const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM members").first();
  return {
    total: total ? total.n : 0,
    members: (r.results || []).map(m => ({ id: m.id, provider: m.provider, nickname: m.nickname, createdAt: m.created_at, lastLogin: m.last_login, isAdmin: isAdmin(env, m.id) }))
  };
}

/* ---------- GitHub 저장 (메뉴 · 사진) ---------- */
const branch = env => env.GITHUB_BRANCH || "main";
async function gh(env, path, init) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) throw new HttpError(500, "config", "GITHUB_TOKEN · GITHUB_REPO 설정이 없어요.");
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}` + (init ? "" : `?ref=${encodeURIComponent(branch(env))}`);
  return fetch(url, Object.assign({}, init, { headers: {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "hyehwadam-admin",
    ...(init ? { "Content-Type": "application/json" } : {})
  } }));
}
async function getFile(env, path) {
  const r = await gh(env, path);
  if (!r.ok) { console.error("[GitHub 읽기]", path, r.status, await r.text()); throw new HttpError(502, "github", "저장소에서 파일을 읽지 못했어요. GitHub 설정을 확인해 주세요."); }
  const j = await r.json();
  return { text: dec.decode(fromB64(String(j.content || "").replace(/\s/g, ""))), sha: j.sha };
}
async function putFile(env, path, bytes, message, sha) {
  const body = { message, content: b64(bytes), branch: branch(env) };
  if (sha) body.sha = sha;
  const r = await gh(env, path, { method: "PUT", body: JSON.stringify(body) });
  if (r.status === 409 || (r.status === 422 && sha)) throw new HttpError(409, "conflict", "그사이 다른 곳에서 메뉴가 바뀌었어요. 새로고침한 뒤 다시 저장해 주세요.");
  if (!r.ok) { console.error("[GitHub 저장]", path, r.status, await r.text()); throw new HttpError(502, "github", "저장소에 저장하지 못했어요. GitHub 토큰 권한을 확인해 주세요."); }
  const j = await r.json();
  return j.content && j.content.sha;
}

async function categories(env) {
  const site = JSON.parse((await getFile(env, "data/site.json")).text);
  return (site.categories || []).filter(c => c.id !== "all").map(c => ({ id: c.id, name: c.name }));
}
async function getMenu(env) {
  const [file, cats] = await Promise.all([getFile(env, "data/menu.json"), categories(env)]);
  let items;
  try { items = JSON.parse(file.text); } catch { throw new HttpError(500, "menu_json", "data/menu.json 형식이 깨져 있어요."); }
  return { items, sha: file.sha, categories: cats };
}

/* 메뉴 한 개 검사 — 허용된 항목만 남기고 형식을 맞춤 */
const str = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
function cleanItem(raw, catIds, n) {
  const bad = msg => { throw new HttpError(400, "invalid", `${n}번째 메뉴: ${msg}`); };
  if (!raw || typeof raw !== "object") bad("형식이 잘못됐어요.");
  const it = {};
  it.id = str(raw.id, 24);
  if (!/^[a-z0-9-]{1,24}$/.test(it.id)) bad("메뉴 코드(id)가 잘못됐어요.");
  it.cat = str(raw.cat, 20);
  if (!catIds.includes(it.cat)) bad("분류를 골라 주세요.");
  it.name = str(raw.name, 80);
  if (!it.name) bad("메뉴 이름을 입력해 주세요.");
  const p = raw.price;
  if (p === null || p === undefined || p === "") it.price = null;
  else if (p === "ask") it.price = "ask";
  else if (Number.isInteger(p) && p >= 0 && p <= 10000000) it.price = p;
  else bad("가격은 0원 이상 숫자로 입력해 주세요.");
  const flag = str(raw.flag, 10); if (flag) it.flag = flag;
  if (Array.isArray(raw.temp)) { const t = ["hot", "iced"].filter(x => raw.temp.includes(x)); if (t.length) it.temp = t; }
  if (raw.soldout === true) it.soldout = true;
  const icon = str(raw.icon, 20); if (icon) { if (!/^[a-z]+$/.test(icon)) bad("그림 이름이 잘못됐어요."); it.icon = icon; }
  const tile = str(raw.tile, 9); if (tile) { if (!/^#[0-9a-fA-F]{3,8}$/.test(tile)) bad("배경색 형식이 잘못됐어요."); it.tile = tile; }
  const image = str(raw.image, 200);
  if (image) { if (!/^assets\/images\/[A-Za-z0-9._\/-]+\.(jpe?g|png|webp)$/.test(image) || image.includes("..")) bad("사진 경로가 잘못됐어요."); it.image = image; }
  const link = str(raw.link, 40); if (link) { if (!/^[a-z0-9-]+\.html$/.test(link)) bad("연결 페이지가 잘못됐어요."); it.link = link; }
  const desc = str(raw.desc, 1000); if (desc) it.desc = desc;
  if (Array.isArray(raw.point)) { const pt = raw.point.map(x => str(x, 40)).filter(Boolean).slice(0, 10); if (pt.length) it.point = pt; }
  return it;
}
async function saveMenu(body, user, env) {
  if (!body || !Array.isArray(body.items) || typeof body.sha !== "string") throw new HttpError(400, "invalid", "요청 형식이 잘못됐어요.");
  if (body.items.length > 500) throw new HttpError(400, "invalid", "메뉴는 500개까지 저장할 수 있어요.");
  const catIds = (await categories(env)).map(c => c.id);
  const items = body.items.map((x, i) => cleanItem(x, catIds, i + 1));
  const seen = new Set();
  for (const it of items) { if (seen.has(it.id)) throw new HttpError(400, "invalid", `메뉴 코드 ${it.id} 가 두 번 들어갔어요.`); seen.add(it.id); }
  /* 사람이 읽기 쉽도록 한 줄에 메뉴 하나씩 저장 */
  const text = "[\n" + items.map(it => "  " + JSON.stringify(it)).join(",\n") + "\n]\n";
  const sha = await putFile(env, "data/menu.json", enc.encode(text), `관리자 메뉴 수정 (${user.nk || user.sub})`, body.sha);
  return { ok: true, sha, count: items.length };
}
async function saveImage(body, user, env) {
  const id = str(body && body.id, 24);
  if (!/^[a-z0-9-]{1,24}$/.test(id)) throw new HttpError(400, "invalid", "메뉴 코드가 잘못됐어요.");
  const data = String(body && body.data || "");
  if (!data || data.length > 3_500_000 || !/^[A-Za-z0-9+/]+=*$/.test(data)) throw new HttpError(400, "invalid", "사진 데이터가 잘못됐어요.");
  let bytes;
  try { bytes = fromB64(data); } catch { throw new HttpError(400, "invalid", "사진 데이터가 잘못됐어요."); }
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) throw new HttpError(400, "invalid", "JPG 사진만 올릴 수 있어요.");
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const path = `assets/images/uploads/${id}-${stamp}-${randomHex(2)}.jpg`;
  await putFile(env, path, bytes, `관리자 사진 추가 ${id} (${user.nk || user.sub})`);
  return { ok: true, path };
}

/* ---------- 예약 · 문의 ---------- */
const INQ_STATUS = ["new", "done", "canceled"];
const KEEP_DAYS = 365; /* 처리(완료·취소)된 예약·문의는 1년 뒤 자동 삭제 — 개인정보처리방침과 같게 */
let inqReady = false;
async function ensureInquiryTable(env) {
  if (inqReady) return;
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS inquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, kind TEXT NOT NULL, " +
    "item_id TEXT, item_name TEXT, name TEXT NOT NULL, phone TEXT NOT NULL, want_date TEXT, want_time TEXT, people INTEGER, message TEXT, " +
    "member_id TEXT, status TEXT NOT NULL DEFAULT 'new', memo TEXT, ip_hash TEXT, updated_at TEXT)"
  ).run();
  inqReady = true;
}
async function optionalUser(req, env) {
  const m = (req.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/);
  return m ? await verifyToken(m[1], env.SESSION_SECRET, "session") : null;
}
async function ipHash(req, env) {
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(env.SESSION_SECRET), enc.encode("ip:" + ip)));
  return [...sig.slice(0, 8)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

async function createInquiry(req, env) {
  const b = await readBody(req, 20000);
  const bad = msg => { throw new HttpError(400, "invalid", msg); };
  if (!b || typeof b !== "object") bad("요청 형식이 잘못됐어요.");
  if (b.website) return { ok: true, id: 0 }; /* 스팸 로봇용 숨은 칸 — 사람은 비워 둠 */
  const kind = b.kind === "reserve" ? "reserve" : "inquiry";
  const name = str(b.name, 30);
  if (!name) bad("이름을 입력해 주세요.");
  const phone = str(b.phone, 20);
  const digits = phone.replace(/\D/g, "");
  if (!/^0\d{8,10}$/.test(digits) || /[^\d\s-]/.test(phone)) bad("연락처를 정확히 입력해 주세요. 예: 010-1234-5678");
  const date = str(b.date, 10);
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date + "T00:00:00Z"))) bad("날짜를 다시 골라 주세요.");
    if (date < kstToday()) bad("지난 날짜는 고를 수 없어요.");
  } else if (kind === "reserve") bad("희망 날짜를 골라 주세요.");
  const time = str(b.time, 5);
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) bad("시간을 다시 골라 주세요.");
  let people = null;
  if (b.people !== undefined && b.people !== null && b.people !== "") {
    people = Number(b.people);
    if (!Number.isInteger(people) || people < 1 || people > 1000) bad("인원·수량은 1~1000 사이 숫자로 입력해 주세요.");
  }
  const message = str(b.message, 1000);
  if (kind === "inquiry" && !message) bad("문의 내용을 입력해 주세요.");
  if (b.agree !== true) bad("개인정보 수집·이용에 동의해 주세요.");
  const itemId = str(b.itemId, 24);
  if (itemId && !/^[a-z0-9-]{1,24}$/.test(itemId)) bad("메뉴 정보가 잘못됐어요.");
  const itemName = str(b.itemName, 80);

  await ensureInquiryTable(env);
  const ih = await ipHash(req, env);
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM inquiries WHERE ip_hash = ? AND created_at > ?").bind(ih, since).first();
  if (recent && recent.n >= 5) throw new HttpError(429, "too_many", "짧은 시간에 너무 많이 보냈어요. 잠시 후 다시 시도해 주세요.");

  const user = await optionalUser(req, env);
  const r = await env.DB.prepare(
    "INSERT INTO inquiries (created_at, kind, item_id, item_name, name, phone, want_date, want_time, people, message, member_id, status, ip_hash) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)"
  ).bind(new Date().toISOString(), kind, itemId || null, itemName || null, name, digits.replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, "$1-$2-$3"), date || null, time || null, people, message || null, user ? user.sub : null, ih).run();
  return { ok: true, id: r && r.meta ? r.meta.last_row_id : 0 };
}

const inqOut = (r, full) => {
  const o = { id: r.id, createdAt: r.created_at, kind: r.kind, itemId: r.item_id, itemName: r.item_name, date: r.want_date, time: r.want_time, people: r.people, message: r.message, status: r.status };
  if (full) Object.assign(o, { name: r.name, phone: r.phone, memberId: r.member_id, memo: r.memo, updatedAt: r.updated_at });
  return o;
};
async function listInquiries(env) {
  await ensureInquiryTable(env);
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400 * 1000).toISOString();
  await env.DB.prepare("DELETE FROM inquiries WHERE status != 'new' AND created_at < ?").bind(cutoff).run();
  const r = await env.DB.prepare("SELECT * FROM inquiries ORDER BY id DESC LIMIT 500").all();
  const counts = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM inquiries GROUP BY status").all();
  const c = { new: 0, done: 0, canceled: 0 };
  for (const x of counts.results || []) if (x.status in c) c[x.status] = x.n;
  return { counts: c, inquiries: (r.results || []).map(x => inqOut(x, true)) };
}
async function updateInquiry(id, body, env) {
  await ensureInquiryTable(env);
  const row = await env.DB.prepare("SELECT id, status, memo FROM inquiries WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "not_found", "이미 삭제된 예약·문의예요.");
  const status = body && body.status !== undefined ? String(body.status) : row.status;
  if (!INQ_STATUS.includes(status)) throw new HttpError(400, "invalid", "상태 값이 잘못됐어요.");
  const memo = body && body.memo !== undefined ? str(body.memo, 500) : row.memo;
  await env.DB.prepare("UPDATE inquiries SET status = ?, memo = ?, updated_at = ? WHERE id = ?").bind(status, memo || null, new Date().toISOString(), id).run();
  return { ok: true };
}
async function deleteInquiry(id, env) {
  await ensureInquiryTable(env);
  await env.DB.prepare("DELETE FROM inquiries WHERE id = ?").bind(id).run();
  return { ok: true };
}
async function myInquiries(user, env) {
  await ensureInquiryTable(env);
  const r = await env.DB.prepare("SELECT * FROM inquiries WHERE member_id = ? ORDER BY id DESC LIMIT 50").bind(user.sub).all();
  return { inquiries: (r.results || []).map(x => inqOut(x, false)) };
}
