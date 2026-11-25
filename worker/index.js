/* =========================================================
   혜화담 로그인 · 관리자 서버 (Cloudflare Worker)
   - 카카오 · 네이버 로그인, 회원 목록(D1 데이터베이스)
   - 관리자: 메뉴 · 사진 · 설명 수정 → GitHub 저장소의 data/menu.json 에 저장
   - 예약 · 문의 접수(메뉴 상세 · 떡체험 화면의 폼) → D1 에 저장, 관리자 화면에서 확인
   - 떡체험 회차(날짜 · 시간 · 정원) 예약, 남은 자리 표시
   - 카카오 알림톡(솔라피): 새 예약 → 사장님, 확정/취소 → 손님
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
   알림톡 (넣지 않으면 알림 없이 동작)
     SOLAPI_API_KEY      솔라피 API Key
     SOLAPI_API_SECRET   솔라피 API Secret (비밀)
     SOLAPI_PFID         솔라피에 연결한 카카오톡 채널 ID (KA01PF…)
     SOLAPI_SENDER       솔라피에 등록한 발신번호 (알림톡 실패 시 문자로 대신 보냄, 생략 가능)
     OWNER_PHONE         새 예약 알림을 받을 사장님 휴대폰, 쉼표로 여러 명
     ALIM_TPL_NEW        템플릿 ID — 새 예약·문의 (사장님용)
     ALIM_TPL_CONFIRM    템플릿 ID — 예약 확정 (손님용)
     ALIM_TPL_CANCEL     템플릿 ID — 예약 취소 (손님용)
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
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.code, message: err.message }, err.status, request, env);
      console.error("[혜화담 서버]", err && err.stack || err);
      return json({ error: "server_error", message: "서버 오류가 났어요. 잠시 후 다시 시도해 주세요." }, 500, request, env);
    }
  }
};

/* ---------- 라우팅 ---------- */
async function route(req, env, ctx) {
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
    if (path === "/api/inquiries" && req.method === "POST") return json(await createInquiry(req, env, ctx), 200, req, env);
    /* 떡체험 회차 · 남은 자리 — 누구나 볼 수 있음 */
    if (path === "/api/slots" && req.method === "GET") return json(await publicSlots(url, env), 200, req, env);
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
      if (path === "/api/admin/kakao-notify" && req.method === "GET") return json(await kakaoNotifyStatus(user, env), 200, req, env);
      if (path === "/api/admin/kakao-notify" && req.method === "DELETE") return json(await kakaoNotifyUnlink(user, env), 200, req, env);
      if (path === "/api/admin/kakao-notify/test" && req.method === "POST") return json(await sendKakaoMemo(env, "[혜화담] 카톡 알림 시험\n이 메시지가 보이면 새 예약 알림이 이 채팅방으로 와요.", user.sub), 200, req, env);
      if (path === "/api/admin/slots" && req.method === "GET") return json(await adminSlots(url, env), 200, req, env);
      if (path === "/api/admin/slots" && req.method === "POST") return json(await createSlots(await readBody(req, 10000), env), 200, req, env);
      const slot = path.match(/^\/api\/admin\/slots\/(\d{1,12})$/);
      if (slot && req.method === "PATCH") return json(await updateSlot(Number(slot[1]), await readBody(req, 5000), env), 200, req, env);
      if (slot && req.method === "DELETE") return json(await deleteSlot(Number(slot[1]), env), 200, req, env);
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
    authorize: (env, redirectUri, state, opt = {}) => "https://kauth.kakao.com/oauth/authorize?" + new URLSearchParams({
      client_id: env.KAKAO_REST_KEY, redirect_uri: redirectUri, response_type: "code", state,
      ...(opt.relogin ? { prompt: "login" } : {}),            /* 로그아웃 후: 카카오 로그인 화면을 다시 띄워 다른 계정 선택 가능 */
      ...(opt.notify ? { scope: "talk_message" } : {})        /* 사장님 '나에게 보내기' 권한 */
    }),
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
      return { id: "kakao:" + uj.id, provider: "kakao", nickname, tokens: tj };
    }
  },
  naver: {
    ready: env => !!(env.NAVER_CLIENT_ID && env.NAVER_CLIENT_SECRET),
    authorize: (env, redirectUri, state, opt = {}) => "https://nid.naver.com/oauth2.0/authorize?" + new URLSearchParams({
      response_type: "code", client_id: env.NAVER_CLIENT_ID, redirect_uri: redirectUri, state,
      ...(opt.relogin ? { auth_type: "reauthenticate" } : {})
    }),
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
  const notify = provider === "kakao" && url.searchParams.get("notify") === "1";
  const relogin = url.searchParams.get("relogin") === "1";
  const next = notify ? "admin" : NEXT_PAGES.includes(url.searchParams.get("next")) ? url.searchParams.get("next") : "mypage";
  const nonce = randomHex(16);
  const state = await signToken({ k: "state", p: provider, n: nonce, x: next, nf: notify ? 1 : 0, exp: now() + 600 }, env.SESSION_SECRET);
  const redirectUri = `${url.origin}/auth/${provider}/callback`;
  return redirect(P.authorize(env, redirectUri, state, { relogin, notify }), {
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

  /* 사장님 카톡 알림 연결 */
  let extra = "";
  if (state.nf && who.tokens) {
    const scopes = String(who.tokens.scope || "").split(/\s+/);
    if (!isAdmin(env, who.id)) extra = "&kakao=not_admin";
    else if (!scopes.includes("talk_message")) extra = "&kakao=denied";
    else { await saveKakaoNotify(env, who, who.tokens); extra = "&kakao=linked"; }
  }
  const token = await signToken({ k: "session", sub: who.id, nk: who.nickname, prv: who.provider, adm: isAdmin(env, who.id), iat: now(), exp: now() + SESSION_DAYS * 86400 }, env.SESSION_SECRET);
  return redirect(backToLogin(env, { next: state.x }, "token=" + token + extra), clear);
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
  /* 기능이 늘면서 생긴 칸 — 예전 표에 없으면 추가 */
  const cols = ((await env.DB.prepare("PRAGMA table_info(inquiries)").all()).results || []).map(c => c.name);
  if (!cols.includes("slot_id")) await env.DB.prepare("ALTER TABLE inquiries ADD COLUMN slot_id INTEGER").run();
  if (!cols.includes("notify")) await env.DB.prepare("ALTER TABLE inquiries ADD COLUMN notify TEXT").run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS slots (id INTEGER PRIMARY KEY AUTOINCREMENT, slot_date TEXT NOT NULL, slot_time TEXT NOT NULL, " +
    "capacity INTEGER NOT NULL, title TEXT, closed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, UNIQUE(slot_date, slot_time))"
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
const kstNow = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString();
const kstToday = () => kstNow().slice(0, 10);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
const isTime = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const fmtPhone = d => d.replace(/^(02)(\d{3,4})(\d{4})$/, "$1-$2-$3").replace(/^(0\d{2})(\d{3,4})(\d{4})$/, "$1-$2-$3");
/* 뒤에서 처리 (응답을 늦추지 않음). 테스트처럼 ctx 가 없으면 기다림 */
async function later(ctx, p) { if (ctx && ctx.waitUntil) ctx.waitUntil(p); else await p; }

/* ---------- 떡체험 회차 (날짜 · 시간 · 정원) ---------- */
const USED = "COALESCE((SELECT SUM(COALESCE(i.people, 1)) FROM inquiries i WHERE i.slot_id = s.id AND i.status != 'canceled'), 0)";
const slotOut = r => ({ id: r.id, date: r.slot_date, time: r.slot_time, capacity: r.capacity, booked: r.booked, remaining: Math.max(0, r.capacity - r.booked), closed: !!r.closed, title: r.title || "떡체험" });
function range(url, defFrom, defTo, maxDays) {
  let from = url.searchParams.get("from") || defFrom, to = url.searchParams.get("to") || defTo;
  if (!isDate(from) || !isDate(to)) throw new HttpError(400, "invalid", "날짜 형식이 잘못됐어요.");
  if (to < from) [from, to] = [to, from];
  if (to > addDays(from, maxDays)) to = addDays(from, maxDays);
  return [from, to];
}
async function publicSlots(url, env) {
  await ensureInquiryTable(env);
  const today = kstToday(), nowHM = kstNow().slice(11, 16);
  let [from, to] = range(url, today, addDays(today, 62), 93);
  if (from < today) from = today;
  const r = await env.DB.prepare(`SELECT s.*, ${USED} AS booked FROM slots s WHERE s.slot_date BETWEEN ? AND ? ORDER BY s.slot_date, s.slot_time`).bind(from, to).all();
  return { today, slots: (r.results || []).filter(s => !(s.slot_date === today && s.slot_time <= nowHM)).map(slotOut) };
}
async function adminSlots(url, env) {
  await ensureInquiryTable(env);
  const today = kstToday();
  const [from, to] = range(url, addDays(today, -7), addDays(today, 93), 186);
  const r = await env.DB.prepare(`SELECT s.*, ${USED} AS booked FROM slots s WHERE s.slot_date BETWEEN ? AND ? ORDER BY s.slot_date, s.slot_time`).bind(from, to).all();
  return { today, slots: (r.results || []).map(slotOut) };
}
async function createSlots(b, env) {
  const bad = msg => { throw new HttpError(400, "invalid", msg); };
  const from = str(b && b.from, 10), to = str(b && b.to, 10) || from;
  if (!isDate(from) || !isDate(to)) bad("시작일과 종료일을 골라 주세요.");
  if (to < from) bad("종료일이 시작일보다 빨라요.");
  if (from < kstToday()) bad("지난 날짜에는 회차를 만들 수 없어요.");
  if (to > addDays(from, 186)) bad("한 번에 6개월까지만 만들 수 있어요.");
  const weekdays = Array.isArray(b.weekdays) ? b.weekdays.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6) : [];
  if (!weekdays.length) bad("요일을 하나 이상 골라 주세요.");
  const times = [...new Set((Array.isArray(b.times) ? b.times : []).map(t => str(t, 5)))].filter(Boolean);
  if (!times.length || times.some(t => !isTime(t))) bad("시간을 11:00 처럼 입력해 주세요.");
  const capacity = Number(b.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) bad("정원은 1~500 사이 숫자로 입력해 주세요.");
  const title = str(b.title, 30) || "떡체험";
  const rows = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (weekdays.includes(new Date(d + "T00:00:00Z").getUTCDay())) for (const t of times) rows.push([d, t]);
  if (!rows.length) bad("고른 기간에 해당 요일이 없어요.");
  if (rows.length > 400) bad(`회차가 ${rows.length}개로 너무 많아요. 한 번에 400개까지 만들 수 있어요.`);
  await ensureInquiryTable(env);
  let created = 0;
  const ts = new Date().toISOString();
  for (const [d, t] of rows) {
    const r = await env.DB.prepare("INSERT OR IGNORE INTO slots (slot_date, slot_time, capacity, title, closed, created_at) VALUES (?, ?, ?, ?, 0, ?)").bind(d, t, capacity, title, ts).run();
    if (r && r.meta && r.meta.changes) created++;
  }
  return { ok: true, created, skipped: rows.length - created };
}
async function slotRow(env, id) {
  return env.DB.prepare(`SELECT s.*, ${USED} AS booked FROM slots s WHERE s.id = ?`).bind(id).first();
}
async function updateSlot(id, b, env) {
  await ensureInquiryTable(env);
  const s = await slotRow(env, id);
  if (!s) throw new HttpError(404, "not_found", "이미 삭제된 회차예요.");
  let capacity = s.capacity, closed = s.closed, title = s.title;
  if (b.capacity !== undefined) {
    capacity = Number(b.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) throw new HttpError(400, "invalid", "정원은 1~500 사이 숫자로 입력해 주세요.");
    if (capacity < s.booked) throw new HttpError(409, "conflict", `이미 ${s.booked}명이 예약해서 정원을 ${s.booked}명보다 줄일 수 없어요.`);
  }
  if (b.closed !== undefined) closed = b.closed ? 1 : 0;
  if (b.title !== undefined) title = str(b.title, 30) || "떡체험";
  await env.DB.prepare("UPDATE slots SET capacity = ?, closed = ?, title = ? WHERE id = ?").bind(capacity, closed, title, id).run();
  return { ok: true, slot: slotOut(await slotRow(env, id)) };
}
async function deleteSlot(id, env) {
  await ensureInquiryTable(env);
  const s = await slotRow(env, id);
  if (!s) return { ok: true };
  if (s.booked > 0) throw new HttpError(409, "conflict", "예약이 있는 회차는 삭제할 수 없어요. 대신 '마감'을 눌러 주세요.");
  await env.DB.prepare("DELETE FROM slots WHERE id = ?").bind(id).run();
  return { ok: true };
}

/* ---------- 카카오 알림톡 (솔라피) ---------- */
const alimReady = env => !!(env.SOLAPI_API_KEY && env.SOLAPI_API_SECRET && env.SOLAPI_PFID);
async function solapiAuth(env) {
  const date = new Date().toISOString(), salt = randomHex(16);
  const key = await crypto.subtle.importKey("raw", enc.encode(env.SOLAPI_API_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(date + salt)))].map(b => b.toString(16).padStart(2, "0")).join("");
  return `HMAC-SHA256 apiKey=${env.SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${sig}`;
}
async function sendAlimtalk(env, toList, templateId, variables) {
  if (!alimReady(env)) return { sent: false, reason: "알림톡 설정 전" };
  if (!templateId) return { sent: false, reason: "템플릿 설정 전" };
  const to = toList.map(t => String(t).replace(/\D/g, "")).filter(t => /^0\d{8,10}$/.test(t));
  if (!to.length) return { sent: false, reason: "받는 번호 없음" };
  const sender = String(env.SOLAPI_SENDER || "").replace(/\D/g, "");
  const messages = to.map(n => {
    const m = { to: n, kakaoOptions: { pfId: env.SOLAPI_PFID, templateId, variables, disableSms: !sender } };
    if (sender) m.from = sender;
    return m;
  });
  try {
    const r = await fetch("https://api.solapi.com/messages/v4/send-many/detail", {
      method: "POST", headers: { Authorization: await solapiAuth(env), "Content-Type": "application/json" }, body: JSON.stringify({ messages })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { console.error("[알림톡]", r.status, JSON.stringify(j)); return { sent: false, reason: j.errorMessage || j.message || "발송 실패 " + r.status }; }
    const failed = j.failedMessageList || [];
    if (failed.length) { console.error("[알림톡 실패]", JSON.stringify(failed)); return { sent: false, reason: failed[0].statusMessage || "발송 실패" }; }
    return { sent: true };
  } catch (err) {
    console.error("[알림톡]", err && err.stack || err);
    return { sent: false, reason: "알림톡 서버 연결 실패" };
  }
}
/* 템플릿에 들어가는 값 — 알림톡은 빈 값을 못 넣어서 '-' 로 채움 */
function inqVars(r, keys) {
  const all = {
    "#{고객명}": r.name, "#{연락처}": r.phone, "#{종류}": r.kind === "reserve" ? "예약·주문" : "문의",
    "#{메뉴}": r.item_name || "-", "#{일시}": [r.want_date, r.want_time].filter(Boolean).join(" ") || "-",
    "#{인원}": r.people ? String(r.people) : "-", "#{요청}": (r.message || "-").replace(/\s+/g, " ").slice(0, 300)
  };
  return Object.fromEntries(keys.map(k => [k, all[k]]));
}
const ownerPhones = env => String(env.OWNER_PHONE || "").split(",").map(s => s.trim()).filter(Boolean);
async function recordNotify(env, id, label, result) {
  await env.DB.prepare("UPDATE inquiries SET notify = ? WHERE id = ?").bind(JSON.stringify({ label, ...result, at: new Date().toISOString() }), id).run();
}
async function notifyOwnerNew(env, id) {
  const r = await env.DB.prepare("SELECT * FROM inquiries WHERE id = ?").bind(id).first();
  if (!r) return;
  const tries = [];
  if (alimReady(env)) tries.push(["알림톡", await sendAlimtalk(env, ownerPhones(env), env.ALIM_TPL_NEW, inqVars(r, ["#{종류}", "#{메뉴}", "#{고객명}", "#{연락처}", "#{일시}", "#{인원}", "#{요청}"]))]);
  tries.push(["카톡", await sendKakaoMemo(env, ownerMemoText(r))]);
  const ok = tries.filter(([, x]) => x.sent).map(([v]) => v);
  const res = ok.length ? { sent: true, via: ok.join("·") }
    : { sent: false, reason: tries.map(([v, x]) => x.reason || v + " 실패").join(", ") };
  await recordNotify(env, id, "사장님 알림", res);
}
function ownerMemoText(r) {
  const when = [r.want_date ? r.want_date.slice(5).replace("-", "/") : "", r.want_time || ""].filter(Boolean).join(" ");
  const lines = [
    `[혜화담] 새 ${r.kind === "reserve" ? "예약" : "문의"}${r.slot_id ? " (떡체험 회차)" : ""}`,
    `메뉴: ${r.item_name || "-"}`,
    when || r.people ? `일시: ${when || "-"}${r.people ? " · " + r.people + (r.slot_id ? "명" : "") : ""}` : "",
    `고객: ${r.name} ${r.phone}`,
    r.message ? `요청: ${String(r.message).replace(/\s+/g, " ")}` : ""
  ].filter(Boolean);
  const text = lines.join("\n");
  return text.length > 200 ? text.slice(0, 198) + "…" : text; /* 카카오 텍스트 메시지는 200자까지 */
}

/* ---------- 사장님 카톡 '나에게 보내기' ---------- */
let knReady = false;
async function ensureKakaoNotify(env) {
  if (knReady) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS kakao_notify (member_id TEXT PRIMARY KEY, nickname TEXT, data TEXT NOT NULL, refresh_exp INTEGER, broken TEXT, updated_at TEXT NOT NULL)").run();
  knReady = true;
}
/* 카카오 토큰은 서버 비밀값(SESSION_SECRET)으로 암호화해서 저장 */
async function aesKey(env) {
  const h = await crypto.subtle.digest("SHA-256", enc.encode("kakao-notify:" + env.SESSION_SECRET));
  return crypto.subtle.importKey("raw", h, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(env, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(env), enc.encode(JSON.stringify(obj))));
  return b64url(iv) + "." + b64url(ct);
}
async function unseal(env, s) {
  const [a, b] = String(s).split(".");
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(a) }, await aesKey(env), fromB64url(b))));
}
async function saveKakaoNotify(env, who, tk) {
  await ensureKakaoNotify(env);
  const n = now();
  const d = { at: tk.access_token, atExp: n + (tk.expires_in || 21599) - 60, rt: tk.refresh_token, rtExp: n + (tk.refresh_token_expires_in || 5183999) - 60 };
  await env.DB.prepare(
    "INSERT INTO kakao_notify (member_id, nickname, data, refresh_exp, broken, updated_at) VALUES (?, ?, ?, ?, NULL, ?) " +
    "ON CONFLICT(member_id) DO UPDATE SET nickname = excluded.nickname, data = excluded.data, refresh_exp = excluded.refresh_exp, broken = NULL, updated_at = excluded.updated_at"
  ).bind(who.id, who.nickname, await seal(env, d), d.rtExp, new Date().toISOString()).run();
}
async function kakaoAccess(env, row, force) {
  const d = await unseal(env, row.data);
  if (!force && d.atExp > now()) return d.at;
  if (!d.rt || d.rtExp <= now()) throw new Error("연결 기간이 끝났어요");
  const body = new URLSearchParams({ grant_type: "refresh_token", client_id: env.KAKAO_REST_KEY, refresh_token: d.rt });
  if (env.KAKAO_CLIENT_SECRET) body.set("client_secret", env.KAKAO_CLIENT_SECRET);
  const r = await fetch("https://kauth.kakao.com/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) { console.error("[카톡 알림 토큰 갱신]", r.status, JSON.stringify(j)); throw new Error("다시 연결이 필요해요"); }
  d.at = j.access_token; d.atExp = now() + (j.expires_in || 21599) - 60;
  if (j.refresh_token) { d.rt = j.refresh_token; d.rtExp = now() + (j.refresh_token_expires_in || 5183999) - 60; } /* 만료 한 달 전부터는 새 갱신 토큰이 옴 → 자동 연장 */
  await env.DB.prepare("UPDATE kakao_notify SET data = ?, refresh_exp = ?, broken = NULL, updated_at = ? WHERE member_id = ?").bind(await seal(env, d), d.rtExp, new Date().toISOString(), row.member_id).run();
  return d.at;
}
async function memoOnce(env, token, text) {
  const template = { object_type: "text", text, link: { web_url: siteUrl(env) + "admin.html", mobile_web_url: siteUrl(env) + "admin.html" }, button_title: "관리자 페이지" };
  const r = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams({ template_object: JSON.stringify(template) })
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j.result_code === 0, status: r.status, j };
}
async function sendKakaoMemo(env, text, onlyId) {
  if (!env.KAKAO_REST_KEY) return { sent: false, reason: "카톡 알림 연결 전" };
  await ensureKakaoNotify(env);
  const rows = ((await env.DB.prepare("SELECT * FROM kakao_notify WHERE broken IS NULL").all()).results || [])
    .filter(r => isAdmin(env, r.member_id) && (!onlyId || r.member_id === onlyId));
  if (!rows.length) return { sent: false, reason: onlyId ? "이 계정은 카톡 알림이 연결되어 있지 않아요" : "카톡 알림 연결 전" };
  let sent = 0; const fails = [];
  for (const row of rows) {
    try {
      let res = await memoOnce(env, await kakaoAccess(env, row), text);
      if (res.status === 401) res = await memoOnce(env, await kakaoAccess(env, row, true), text);
      if (res.ok) { sent++; continue; }
      console.error("[카톡 알림]", res.status, JSON.stringify(res.j));
      const why = res.j && res.j.code === -402 ? "카톡 메시지 권한이 없어요" : res.status === 401 ? "다시 연결이 필요해요" : "보내기 실패";
      if (res.status === 401 || (res.j && (res.j.code === -401 || res.j.code === -402))) await markKakaoBroken(env, row.member_id, why);
      fails.push(why);
    } catch (err) {
      await markKakaoBroken(env, row.member_id, err.message);
      fails.push(err.message);
    }
  }
  return sent ? { sent: true } : { sent: false, reason: "카톡 " + (fails[0] || "보내기 실패") };
}
async function markKakaoBroken(env, id, why) {
  await env.DB.prepare("UPDATE kakao_notify SET broken = ?, updated_at = ? WHERE member_id = ?").bind(String(why).slice(0, 100), new Date().toISOString(), id).run();
}
async function kakaoNotifyStatus(user, env) {
  await ensureKakaoNotify(env);
  const rows = ((await env.DB.prepare("SELECT member_id, nickname, refresh_exp, broken, updated_at FROM kakao_notify").all()).results || []).filter(r => isAdmin(env, r.member_id));
  const out = r => ({ memberId: r.member_id, nickname: r.nickname, until: r.refresh_exp ? new Date(r.refresh_exp * 1000).toISOString() : null, broken: r.broken || null, updatedAt: r.updated_at });
  const mine = rows.find(r => r.member_id === user.sub);
  return { canLink: user.sub.startsWith("kakao:") && !!env.KAKAO_REST_KEY, mine: mine ? out(mine) : null, all: rows.map(out) };
}
async function kakaoNotifyUnlink(user, env) {
  await ensureKakaoNotify(env);
  await env.DB.prepare("DELETE FROM kakao_notify WHERE member_id = ?").bind(user.sub).run();
  return { ok: true };
}
async function notifyCustomer(env, r, status) {
  const tpl = status === "done" ? env.ALIM_TPL_CONFIRM : env.ALIM_TPL_CANCEL;
  const keys = status === "done" ? ["#{고객명}", "#{메뉴}", "#{일시}", "#{인원}"] : ["#{고객명}", "#{메뉴}", "#{일시}"];
  const res = await sendAlimtalk(env, [r.phone], tpl, inqVars(r, keys));
  await recordNotify(env, r.id, status === "done" ? "고객 확정 알림" : "고객 취소 알림", res);
  return res;
}
function alimStatus(env) {
  return { ready: alimReady(env), owner: ownerPhones(env).length > 0, sender: !!env.SOLAPI_SENDER,
    templates: { new: !!env.ALIM_TPL_NEW, confirm: !!env.ALIM_TPL_CONFIRM, cancel: !!env.ALIM_TPL_CANCEL } };
}

/* ---------- 예약 · 문의 접수 ---------- */
async function createInquiry(req, env, ctx) {
  const b = await readBody(req, 20000);
  const bad = msg => { throw new HttpError(400, "invalid", msg); };
  if (!b || typeof b !== "object") bad("요청 형식이 잘못됐어요.");
  if (b.website) return { ok: true, id: 0 }; /* 스팸 로봇용 숨은 칸 — 사람은 비워 둠 */
  const slotId = b.slotId !== undefined && b.slotId !== null && b.slotId !== "" ? Number(b.slotId) : null;
  if (slotId !== null && (!Number.isInteger(slotId) || slotId < 1)) bad("회차 정보가 잘못됐어요.");
  const kind = slotId ? "reserve" : b.kind === "reserve" ? "reserve" : "inquiry";
  const name = str(b.name, 30);
  if (!name) bad("이름을 입력해 주세요.");
  const phone = str(b.phone, 20);
  const digits = phone.replace(/\D/g, "");
  if (!/^0\d{8,10}$/.test(digits) || /[^\d\s-]/.test(phone)) bad("연락처를 정확히 입력해 주세요. 예: 010-1234-5678");
  let date = str(b.date, 10), time = str(b.time, 5);
  if (!slotId) {
    if (date) {
      if (!isDate(date)) bad("날짜를 다시 골라 주세요.");
      if (date < kstToday()) bad("지난 날짜는 고를 수 없어요.");
    } else if (kind === "reserve") bad("희망 날짜를 골라 주세요.");
    if (time && !isTime(time)) bad("시간을 다시 골라 주세요.");
  }
  let people = null;
  if (b.people !== undefined && b.people !== null && b.people !== "") {
    people = Number(b.people);
    if (!Number.isInteger(people) || people < 1 || people > 1000) bad("인원·수량은 1~1000 사이 숫자로 입력해 주세요.");
  }
  if (slotId && !people) bad("인원을 입력해 주세요.");
  const message = str(b.message, 1000);
  if (kind === "inquiry" && !message) bad("문의 내용을 입력해 주세요.");
  if (b.agree !== true) bad("개인정보 수집·이용에 동의해 주세요.");
  const itemId = str(b.itemId, 24);
  if (itemId && !/^[a-z0-9-]{1,24}$/.test(itemId)) bad("메뉴 정보가 잘못됐어요.");
  let itemName = str(b.itemName, 80);

  await ensureInquiryTable(env);
  const ih = await ipHash(req, env);
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM inquiries WHERE ip_hash = ? AND created_at > ?").bind(ih, since).first();
  if (recent && recent.n >= 5) throw new HttpError(429, "too_many", "짧은 시간에 너무 많이 보냈어요. 잠시 후 다시 시도해 주세요.");

  if (slotId) {
    const s = await slotRow(env, slotId);
    const nowHM = kstNow().slice(11, 16), today = kstToday();
    if (!s || s.closed) throw new HttpError(409, "slot_closed", "이 회차는 예약을 받지 않아요. 다른 회차를 골라 주세요.");
    if (s.slot_date < today || (s.slot_date === today && s.slot_time <= nowHM)) throw new HttpError(409, "slot_closed", "이미 지난 회차예요. 다른 회차를 골라 주세요.");
    date = s.slot_date; time = s.slot_time;
    itemName = itemName || s.title || "떡체험";
  }

  const user = await optionalUser(req, env);
  const vals = [new Date().toISOString(), kind, itemId || null, itemName || null, name, fmtPhone(digits), date || null, time || null, people, message || null, user ? user.sub : null, ih, slotId];
  const cols = "created_at, kind, item_id, item_name, name, phone, want_date, want_time, people, message, member_id, status, ip_hash, slot_id";
  let r;
  if (slotId) {
    /* 정원 확인과 저장을 한 번에 — 동시에 눌러도 정원을 넘지 않음 */
    r = await env.DB.prepare(
      `INSERT INTO inquiries (${cols}) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ? ` +
      `WHERE (SELECT capacity FROM slots WHERE id = ? AND closed = 0) - COALESCE((SELECT SUM(COALESCE(people, 1)) FROM inquiries WHERE slot_id = ? AND status != 'canceled'), 0) >= ?`
    ).bind(...vals, slotId, slotId, people).run();
    if (!r || !r.meta || !r.meta.changes) {
      const s = await slotRow(env, slotId);
      const left = s ? Math.max(0, s.capacity - s.booked) : 0;
      throw new HttpError(409, "full", left ? `남은 자리가 ${left}자리예요. 인원을 줄이거나 다른 회차를 골라 주세요.` : "방금 마감됐어요. 다른 회차를 골라 주세요.");
    }
  } else {
    r = await env.DB.prepare(`INSERT INTO inquiries (${cols}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`).bind(...vals).run();
  }
  const id = r && r.meta ? r.meta.last_row_id : 0;
  if (id) await later(ctx, notifyOwnerNew(env, id).catch(e => console.error("[알림톡]", e)));
  return { ok: true, id, date, time };
}

const inqOut = (r, full) => {
  const o = { id: r.id, createdAt: r.created_at, kind: r.kind, itemId: r.item_id, itemName: r.item_name, date: r.want_date, time: r.want_time, people: r.people, message: r.message, status: r.status, slotId: r.slot_id || null };
  if (full) {
    let notify = null; try { notify = r.notify ? JSON.parse(r.notify) : null; } catch { /* 무시 */ }
    Object.assign(o, { name: r.name, phone: r.phone, memberId: r.member_id, memo: r.memo, updatedAt: r.updated_at, notify });
  }
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
  return { counts: c, inquiries: (r.results || []).map(x => inqOut(x, true)), alimtalk: alimStatus(env) };
}
async function updateInquiry(id, body, env) {
  await ensureInquiryTable(env);
  const row = await env.DB.prepare("SELECT * FROM inquiries WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "not_found", "이미 삭제된 예약·문의예요.");
  const status = body && body.status !== undefined ? String(body.status) : row.status;
  if (!INQ_STATUS.includes(status)) throw new HttpError(400, "invalid", "상태 값이 잘못됐어요.");
  const memo = body && body.memo !== undefined ? str(body.memo, 500) : row.memo;
  /* 취소했던 회차 예약을 되살릴 때는 남은 자리를 다시 확인 */
  if (row.slot_id && row.status === "canceled" && status !== "canceled") {
    const s = await slotRow(env, row.slot_id);
    if (s && s.capacity - s.booked < (row.people || 1)) throw new HttpError(409, "full", `그 회차에 남은 자리가 ${Math.max(0, s.capacity - s.booked)}자리라 되살릴 수 없어요.`);
  }
  await env.DB.prepare("UPDATE inquiries SET status = ?, memo = ?, updated_at = ? WHERE id = ?").bind(status, memo || null, new Date().toISOString(), id).run();
  let notify = null;
  if (status !== row.status && (status === "done" || status === "canceled") && row.kind === "reserve" && !(body && body.notify === false)) {
    notify = await notifyCustomer(env, row, status);
  }
  return { ok: true, notify };
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
