/* =========================================================
   혜화담 — 회원(카카오·네이버 로그인) · 내 정보 · 관리자 화면
   서버 주소는 data/site.json 의 "auth": { "api": "..." } 에 넣습니다.
   main.js 보다 먼저 불러오며, main.js 가 헤더·푸터와 함께 그려 줍니다.
   ========================================================= */
(function () {
  "use strict";

  const TOKEN_KEY = "hd_token";
  let memToken = null;
  const token = {
    get() { try { return localStorage.getItem(TOKEN_KEY) || memToken; } catch { return memToken; } },
    set(v) { memToken = v; try { localStorage.setItem(TOKEN_KEY, v); } catch { /* 저장 불가: 이 탭에서만 유지 */ } },
    clear() { memToken = null; try { localStorage.removeItem(TOKEN_KEY); } catch { /* 무시 */ } }
  };
  const PROVIDER = { kakao: "카카오", naver: "네이버" };
  /* 로그아웃하면 다음 로그인 때 카카오·네이버 로그인 화면을 다시 띄워 다른 계정을 고를 수 있게 함 */
  const relogin = {
    get() { try { return localStorage.getItem("hd_relogin") === "1"; } catch { return false; } },
    set(on) { try { on ? localStorage.setItem("hd_relogin", "1") : localStorage.removeItem("hd_relogin"); } catch { /* 무시 */ } }
  };
  const NEXT = { mypage: "mypage.html", admin: "admin.html" };
  const fmtDate = s => { const d = new Date(s); return isNaN(d) ? "-" : d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }); };
  const fmtTime = s => { const d = new Date(s); return isNaN(d) ? "-" : d.toLocaleString("ko-KR", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); };

  const LOGO = {
    kakao: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3.5C6.75 3.5 2.5 6.86 2.5 11c0 2.66 1.76 5 4.4 6.33l-.9 3.3c-.08.3.26.54.52.37l3.94-2.6c.5.06 1.01.1 1.54.1 5.25 0 9.5-3.36 9.5-7.5S17.25 3.5 12 3.5z"/></svg>`,
    naver: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.6 12.6 8.2 2H2v20h6.4V11.4L15.8 22H22V2h-6.4z"/></svg>`
  };

  /* 서버 요청 — 로그인 토큰을 함께 보냄 */
  async function api(ctx, path, opts = {}) {
    const init = { method: opts.method || "GET", headers: { Authorization: "Bearer " + token.get() } };
    if (opts.body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
    let res;
    try { res = await fetch(ctx.API + path, init); }
    catch { throw Object.assign(new Error("서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요."), { status: 0 }); }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) token.clear();
    if (!res.ok) throw Object.assign(new Error(data.message || "요청을 처리하지 못했어요."), { status: res.status, code: data.error });
    return data;
  }
  const notReady = ctx => `<div class="notice">로그인 기능을 준비하고 있어요.<br>조금만 기다려 주세요.</div>`;

  /* ---------- 로그인 ---------- */
  const login = {
    render(ctx) {
      const next = NEXT[new URLSearchParams(location.search).get("next")] ? new URLSearchParams(location.search).get("next") : "mypage";
      const btn = p => ctx.API
        ? `<a class="sns ${p}" data-p="${p}" href="${ctx.esc(ctx.API)}/auth/${p}/start?next=${next}${relogin.get() ? "&relogin=1" : ""}">${LOGO[p]}<span>${PROVIDER[p]} 로그인</span></a>`
        : `<button type="button" class="sns ${p}" data-soon>${LOGO[p]}<span>${PROVIDER[p]} 로그인</span></button>`;
      /* 켜 둔 로그인 방식만 보여 줌 — data/site.json 의 "auth": { "providers": ["kakao", "naver"] } */
      const provs = ((ctx.SITE.auth && ctx.SITE.auth.providers) || ["kakao", "naver"]).filter(p => PROVIDER[p]);
      const names = provs.map(p => PROVIDER[p]).join(" 또는 ");
      return ctx.subTop("로그인", [{ name: "로그인" }]) + `<div class="wrap"><div class="auth-box">
        <h2>혜화담 회원 로그인</h2>
        <p class="auth-sub">${ctx.lines([`${names} 계정으로`, "간편하게 로그인하세요."])}</p>
        <div id="auth-msg"></div>
        <div class="sns-list">${provs.map(btn).join("")}</div>
        ${ctx.API ? `<p class="switch-acc"><button type="button" class="link-btn" id="switch-acc"${relogin.get() ? " hidden" : ""}>다른 계정으로 로그인하기</button><span id="switch-on"${relogin.get() ? "" : " hidden"}>${names} 로그인 화면에서 계정을 다시 고를 수 있어요.</span></p>` : ""}
        <p class="fine">${ctx.lines(["혜화담은 회원 확인을 위해 닉네임과 회원번호만 저장합니다.", "로그인하면 개인정보처리방침에 동의하는 것으로 봅니다."])}<a href="privacy.html">개인정보처리방침 보기</a></p>
      </div></div>`;
    },
    bind(ctx) {
      const box = ctx.$("#auth-msg");
      /* 서버 연결 전: 버튼은 보이되, 누르면 준비 중 안내 */
      ctx.$$("[data-soon]").forEach(el => el.addEventListener("click", () => { box.innerHTML = notReady(ctx); }));
      const hash = new URLSearchParams(location.hash.slice(1));
      const next = new URLSearchParams(location.search).get("next");
      if (hash.get("token")) {
        const t = hash.get("token");
        history.replaceState(null, "", location.pathname);
        if (/^[\w-]+\.[\w-]+\.[\w-]+$/.test(t)) {
          token.set(t); relogin.set(false);
          const k = hash.get("kakao");
          location.replace(k ? "admin.html?kakao=" + encodeURIComponent(k) : NEXT[next] || "mypage.html");
          return;
        }
      }
      const sw = ctx.$("#switch-acc");
      if (sw) sw.addEventListener("click", () => {
        relogin.set(true); sw.hidden = true; ctx.$("#switch-on").hidden = false;
        ctx.$$(".sns[data-p]").forEach(a => { if (!a.href.includes("relogin=1")) a.href += "&relogin=1"; });
      });
      const errs = {
        denied: "로그인을 취소했어요.",
        state: "로그인 시간이 지났어요. 다시 시도해 주세요.",
        not_configured: "이 로그인 방식은 아직 준비 중이에요.",
        token: "로그인 정보를 받지 못했어요. 다시 시도해 주세요.",
        profile: "회원 정보를 받지 못했어요. 다시 시도해 주세요."
      };
      if (hash.get("error")) {
        history.replaceState(null, "", location.pathname + location.search);
        box.innerHTML = `<div class="notice warn">${ctx.esc(errs[hash.get("error")] || "로그인하지 못했어요. 다시 시도해 주세요.")}</div>`;
      } else if (ctx.API && token.get()) {
        box.innerHTML = `<div class="notice">이미 로그인되어 있어요. <a href="mypage.html"><b>내 정보 보기 →</b></a></div>`;
      }
    }
  };

  /* ---------- 내 정보 ---------- */
  const mypage = {
    render(ctx) { return ctx.subTop("내 정보", [{ name: "내 정보" }]) + `<div class="wrap"><div class="auth-box" id="me"><p class="loading">불러오는 중…</p></div></div>`; },
    async bind(ctx) {
      const box = ctx.$("#me");
      if (!ctx.API) { box.innerHTML = notReady(ctx); return; }
      if (!token.get()) { location.replace("login.html"); return; }
      let me;
      try { me = await api(ctx, "/api/me"); }
      catch (err) {
        if (err.status === 401) { location.replace("login.html"); return; }
        box.innerHTML = `<div class="notice warn">${ctx.esc(err.message)}</div>`; return;
      }
      box.innerHTML = `
        <div class="me-head"><span class="pv ${ctx.esc(me.provider)}">${LOGO[me.provider] || ""}${ctx.esc(PROVIDER[me.provider] || me.provider)}</span>
          <h2>${ctx.esc(me.nickname)} 님</h2><p class="auth-sub">혜화담 회원이 되어 주셔서 고맙습니다.</p></div>
        <dl class="info">
          <div><dt>로그인 방식</dt><dd>${ctx.esc(PROVIDER[me.provider] || me.provider)} 계정</dd></div>
          <div><dt>가입일</dt><dd>${fmtDate(me.createdAt)}</dd></div>
          <div><dt>최근 로그인</dt><dd>${fmtTime(me.lastLogin)}</dd></div>
          <div><dt>회원번호</dt><dd><code class="mid">${ctx.esc(me.id)}</code> <button type="button" class="mini" id="copy-id">복사</button>
            ${me.isAdmin ? `<span class="chip good">관리자</span>` : ""}</dd></div>
        </dl>
        <div class="me-actions">
          ${me.isAdmin ? `<a class="btn primary" href="admin.html">관리자 페이지${me.newInquiries ? `<span class="badge-n">새 문의 ${me.newInquiries}</span>` : ""}</a>` : ""}
          <button type="button" class="btn" id="logout">로그아웃</button>
          <button type="button" class="link-btn" id="withdraw">회원 탈퇴</button>
        </div>
        <div class="my-inq" id="my-inq" hidden></div>
        <div id="withdraw-box" hidden class="notice warn">
          <p>${ctx.lines(["탈퇴하면 혜화담에 저장된 회원 정보가 바로 삭제돼요.", "정말 탈퇴할까요?"])}</p>
          <div class="btns"><button type="button" class="btn danger" id="withdraw-yes">탈퇴하기</button><button type="button" class="btn" id="withdraw-no">취소</button></div>
        </div>`;
      ctx.$("#copy-id").addEventListener("click", async e => {
        try { await navigator.clipboard.writeText(me.id); e.target.textContent = "복사됨"; }
        catch { const r = document.createRange(); r.selectNodeContents(ctx.$(".mid")); getSelection().removeAllRanges(); getSelection().addRange(r); e.target.textContent = "선택됨"; }
      });
      ctx.$("#logout").addEventListener("click", () => { token.clear(); relogin.set(true); location.href = "index.html"; });
      api(ctx, "/api/me/inquiries").then(r => {
        if (!r.inquiries.length) return;
        const el = ctx.$("#my-inq"); el.hidden = false;
        el.innerHTML = `<h3>내 예약 · 문의</h3><ul>${r.inquiries.map(x => `<li><span class="st ${ctx.esc(x.status)}">${(x.kind === "reserve" ? { new: "확인 중", done: "예약 확정", canceled: "예약 취소" } : { new: "접수됨", done: "답변 완료", canceled: "취소" })[x.status] || ""}</span><b>${ctx.esc(x.itemName || "")}</b>${x.date ? `<span>${ctx.esc(x.date)}${x.time ? " " + ctx.esc(x.time) : ""}</span>` : ""}<small>${fmtDate(x.createdAt)} 접수</small></li>`).join("")}</ul>`;
      }).catch(() => { /* 내역은 없어도 됨 */ });
      const wb = ctx.$("#withdraw-box");
      ctx.$("#withdraw").addEventListener("click", () => { wb.hidden = false; });
      ctx.$("#withdraw-no").addEventListener("click", () => { wb.hidden = true; });
      ctx.$("#withdraw-yes").addEventListener("click", async e => {
        e.target.disabled = true;
        try { await api(ctx, "/api/me", { method: "DELETE" }); token.clear(); relogin.set(true); box.innerHTML = `<div class="notice">탈퇴가 완료됐어요. 그동안 고맙습니다.</div><p style="text-align:center"><a class="btn" href="index.html">홈으로</a></p>`; }
        catch (err) { e.target.disabled = false; wb.insertAdjacentHTML("beforeend", `<p class="err">${ctx.esc(err.message)}</p>`); }
      });
    }
  };

  /* ---------- 관리자 ---------- */
  const PREFIX = { tteok: "t", bingsu: "b", coffee: "c", ade: "a", tea: "e", order: "o" };
  const DEF_ICON = { tteok: "tteok", bingsu: "bingsu", coffee: "coffee", ade: "glass", tea: "tea", order: "gift" };

  function toSquareJpeg(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const s = Math.min(img.naturalWidth, img.naturalHeight), out = Math.min(800, s);
        const c = document.createElement("canvas"); c.width = c.height = out;
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, out, out);
        g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, out, out);
        URL.revokeObjectURL(url); resolve(c.toDataURL("image/jpeg", 0.86));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("사진을 읽지 못했어요. JPG나 PNG 사진으로 다시 골라 주세요.")); };
      img.src = url;
    });
  }

  const KIND = { reserve: "예약 · 주문", inquiry: "문의" };
  const STATUS = { new: "새 문의", done: "확인 완료", canceled: "취소" };
  const STATUS_R = { new: "새 예약", done: "예약 확정", canceled: "예약 취소" };
  const stLabel = x => (x.kind === "reserve" ? STATUS_R : STATUS)[x.status] || x.status;
  const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
  const dayLabel = d => { const x = new Date(d + "T00:00:00Z"); return `${x.getUTCMonth() + 1}월 ${x.getUTCDate()}일 (${WEEK[x.getUTCDay()]})`; };
  /* ---------- 관리자: 사장님 텔레그램 알림 (알림음 O) ---------- */
  async function tgBox(ctx, el) {
    const esc = ctx.esc;
    let s = null, link = null, msg = null, poll = null;
    const stop = () => { if (poll) { clearInterval(poll); poll = null; } };
    async function load() {
      try { s = await api(ctx, "/api/admin/telegram"); }
      catch (err) { el.innerHTML = `<div class="kn"><p class="err">${esc(err.message)}</p></div>`; return; }
      render();
    }
    function render() {
      let body;
      if (!s.ready) body = `<p><b>텔레그램으로 새 예약 알림 받기 (알림음 O)</b> <span class="free">무료</span><br><span class="hint">${s.error ? esc(s.error) + " — " : ""}텔레그램 봇을 만들고 Cloudflare 에 TELEGRAM_BOT_TOKEN 을 넣으면 켜져요. (텔레그램 설정 안내 참고)</span></p>`;
      else if (link) body = `<p><b>텔레그램 연결하기</b><br><span class="hint">① <b>[텔레그램 열기]</b>를 누르고, 텔레그램에서 <b>시작(START)</b>을 눌러 주세요.<br>② 몇 초 안에 자동으로 연결돼요. 안 되면 <b>[연결 확인]</b>을 눌러 주세요. (15분 안에)</span></p>
          <a class="btn primary sm" href="${esc(link.url)}" target="_blank" rel="noopener">텔레그램 열기</a><button type="button" class="btn sm" data-tg="check">연결 확인</button><button type="button" class="link-btn" data-tg="cancel">취소</button>`;
      else if (!s.chats.length) body = `<p><b>텔레그램으로 새 예약 알림 받기 (알림음 O)</b> <span class="free">무료</span><br><span class="hint">새 예약·문의가 들어오면 휴대폰에 알림음과 함께 바로 알려 드려요. (봇: @${esc(s.bot)})</span></p><button type="button" class="btn primary sm" data-tg="link">텔레그램 연결</button>`;
      else body = `<p><b>텔레그램 알림 연결됨</b> · ${s.chats.map(c => esc(c.name)).join(", ")}<br><span class="hint">새 예약이 오면 @${esc(s.bot)} 이(가) 알림음과 함께 보내요.</span></p>
          <button type="button" class="btn sm" data-tg="test">시험 보내기</button><button type="button" class="btn sm" data-tg="link">휴대폰 추가</button>
          ${s.chats.map(c => `<button type="button" class="link-btn" data-tg="unlink" data-id="${esc(c.chatId)}">${esc(c.name)} 해제</button>`).join("")}`;
      el.innerHTML = `<div class="kn tg${s.ready && s.chats.length && !link ? " on" : ""}">${body}${msg ? `<p class="kn-msg ${msg[0]}">${esc(msg[1])}</p>` : ""}</div>`;
    }
    async function check(silent) {
      try {
        const r = await api(ctx, "/api/admin/telegram/check", { method: "POST" });
        if (r.linked) { stop(); link = null; msg = ["ok", "텔레그램이 연결됐어요. 텔레그램에 확인 메시지가 갔어요."]; await load(); return; }
        if (!silent) { msg = ["no", "아직 시작(START)을 받지 못했어요. 텔레그램에서 시작을 눌렀는지 확인해 주세요."]; render(); }
      } catch (err) { if (!silent) { msg = ["no", err.message]; render(); } }
    }
    el.addEventListener("click", async e => {
      const b = e.target.closest("[data-tg]"); if (!b) return;
      const a = b.dataset.tg;
      if (a === "unlink" && !b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "한 번 더 누르면 해제"; return; }
      b.disabled = true; msg = null;
      try {
        if (a === "link") {
          link = await api(ctx, "/api/admin/telegram/link", { method: "POST" });
          stop(); let n = 0;
          poll = setInterval(() => { if (++n > 45 || !link) { stop(); return; } check(true); }, 4000);
          render(); return;
        }
        if (a === "check") { await check(false); return; }
        if (a === "cancel") { stop(); link = null; render(); return; }
        if (a === "test") { const r = await api(ctx, "/api/admin/telegram/test", { method: "POST" }); msg = r.sent ? ["ok", "보냈어요. 휴대폰에 텔레그램 알림이 울렸는지 확인해 보세요."] : ["no", "보내지 못했어요: " + (r.reason || "")]; render(); return; }
        if (a === "unlink") { await api(ctx, "/api/admin/telegram/" + encodeURIComponent(b.dataset.id), { method: "DELETE" }); msg = ["ok", "연결을 해제했어요."]; await load(); return; }
      } catch (err) { msg = ["no", err.message]; render(); }
    });
    load();
  }

  /* ---------- 관리자: 사장님 카톡 '나에게 보내기' ---------- */
  async function kakaoBox(ctx, me, el) {
    const esc = ctx.esc;
    const flash = new URLSearchParams(location.search).get("kakao");
    if (flash) history.replaceState(null, "", location.pathname);
    const FLASH = { linked: ["ok", "카톡 알림이 연결됐어요. 시험 보내기로 확인해 보세요."], denied: ["no", "카카오톡 메시지 권한에 동의하지 않아 연결되지 않았어요."], not_admin: ["no", "관리자 계정만 연결할 수 있어요."] };
    let msg = flash && FLASH[flash] ? FLASH[flash] : null;
    const linkHref = `${esc(ctx.API)}/auth/kakao/start?notify=1`;
    async function render() {
      let s;
      try { s = await api(ctx, "/api/admin/kakao-notify"); }
      catch (err) { el.innerHTML = `<div class="kn"><p class="err">${esc(err.message)}</p></div>`; return; }
      const m = s.mine, until = m && m.until ? new Date(m.until).toLocaleDateString("ko-KR", { month: "long", day: "numeric" }) : "";
      const others = s.all.filter(x => x.memberId !== me.id && !x.broken).map(x => esc(x.nickname)).join(", ");
      let body;
      if (!s.canLink) body = `<p>사장님 카톡으로 새 예약 알림을 받으려면 <b>카카오 계정</b>으로 로그인한 관리자가 연결해야 해요.</p>`;
      else if (!m) body = `<p><b>카톡 '나와의 채팅'에 예약 기록 받기</b> <span class="free">무료</span><br><span class="hint">새 예약·문의를 카카오톡 '나와의 채팅'에 남겨 둬요. (나와의 채팅은 알림음이 울리지 않아요 — 알림음은 텔레그램으로)</span></p><a class="btn primary sm" href="${linkHref}">카톡 알림 연결</a>`;
      else if (m.broken) body = `<p><b>카톡 알림 연결이 끊겼어요</b> <span class="hint">(${esc(m.broken)})</span><br><span class="hint">아래 버튼을 눌러 다시 동의하면 이어서 받을 수 있어요.</span></p><a class="btn primary sm" href="${linkHref}">다시 연결</a><button type="button" class="link-btn" data-kn="unlink">연결 해제</button>`;
      else body = `<p><b>카톡 기록 연결됨</b> · 새 예약을 '나와의 채팅'에 남겨요 (알림음 없음).<br><span class="hint">연결 유지: ${until}까지 (알림을 보낼 때마다 자동으로 연장돼요)</span></p><button type="button" class="btn sm" data-kn="test">시험 보내기</button><button type="button" class="link-btn" data-kn="unlink">연결 해제</button>`;
      el.innerHTML = `<div class="kn${m && !m.broken ? " on" : ""}">${body}${others ? `<p class="hint">함께 받는 관리자: ${others}</p>` : ""}${msg ? `<p class="kn-msg ${msg[0]}">${esc(msg[1])}</p>` : ""}</div>`;
    }
    el.addEventListener("click", async e => {
      const b = e.target.closest("[data-kn]"); if (!b) return;
      if (b.dataset.kn === "unlink" && !b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "한 번 더 누르면 해제"; return; }
      b.disabled = true;
      try {
        if (b.dataset.kn === "test") { const r = await api(ctx, "/api/admin/kakao-notify/test", { method: "POST" }); msg = r.sent ? ["ok", "보냈어요. 카카오톡 '나와의 채팅'을 확인해 보세요."] : ["no", "보내지 못했어요: " + (r.reason || "")]; }
        else { await api(ctx, "/api/admin/kakao-notify", { method: "DELETE" }); msg = ["ok", "카톡 알림 연결을 해제했어요."]; }
      } catch (err) { msg = ["no", err.message]; }
      render();
    });
    render();
  }

  async function loadInquiries(ctx, me) {
    const esc = ctx.esc, root = ctx.$('[data-panel="inq"]');
    root.innerHTML = `<div id="tg-box"></div><div id="kn-box"></div><div id="inq-body"></div>`;
    tgBox(ctx, ctx.$("#tg-box", root));
    kakaoBox(ctx, me, ctx.$("#kn-box", root));
    const panel = ctx.$("#inq-body", root);
    let list = [], filter = "new", alim = null;
    const badge = () => { const n = list.filter(x => x.status === "new").length, b = ctx.$("#inq-badge"); b.textContent = n; b.hidden = !n; };
    const telHref = t => "tel:" + String(t || "").replace(/[^0-9+]/g, "");
    const alimBar = () => {
      if (!alim) return "";
      if (!alim.ready) return ""; /* 알림톡은 지금 사용하지 않음 (닫아 둠) */
      const miss = [!alim.owner && "사장님 번호(OWNER_PHONE)", !alim.templates.new && "새 예약 템플릿", !alim.templates.confirm && "확정 템플릿", !alim.templates.cancel && "취소 템플릿"].filter(Boolean);
      return `<div class="alim-bar on">카카오 알림톡 연결됨${miss.length ? ` · 아직 설정 안 된 것: ${miss.join(", ")}` : " · 새 예약은 사장님께, 확정·취소는 손님께 자동 발송돼요."}</div>`;
    };
    const ntfLine = n => !n ? "" : `<p class="ntf ${n.sent ? "ok" : "no"}">알림 · ${esc(n.label || "")} ${n.sent ? "보냄" + (n.via ? " (" + esc(n.via) + ")" : "") : "못 보냄 (" + esc(n.reason || "") + ")"}${n.at ? " · " + fmtTime(n.at) : ""}</p>`;
    function render() {
      const c = { all: list.length, new: 0, done: 0, canceled: 0 };
      list.forEach(x => { c[x.status] = (c[x.status] || 0) + 1; });
      const rows = list.filter(x => filter === "all" || x.status === filter);
      panel.innerHTML = alimBar() + `<div class="inq-filter" role="group" aria-label="상태로 보기">
          ${[["new", "새 문의"], ["done", "확인 완료"], ["canceled", "취소"], ["all", "전체"]].map(([k, v]) => `<button type="button" data-f="${k}" aria-pressed="${filter === k}">${v} ${c[k]}</button>`).join("")}
          <button type="button" class="link-btn" id="inq-reload">새로고침</button>
        </div>
        <div class="inq-list">${rows.map(x => {
          const r = x.kind === "reserve";
          return `
          <article class="inq-card st-${esc(x.status)}" data-id="${x.id}">
            <div class="top"><span class="st ${esc(x.status)}">${esc(stLabel(x))}</span><span class="kind">${x.slotId ? "회차 예약" : KIND[x.kind] || esc(x.kind)}</span>
              <h3>${esc(x.itemName || "메뉴 미지정")}</h3><time>접수 ${fmtTime(x.createdAt)} · #${x.id}</time></div>
            <dl>
              <div><dt>이름</dt><dd>${esc(x.name)}${x.memberId ? ' <span class="chip">회원</span>' : ""}</dd></div>
              <div><dt>연락처</dt><dd><a href="${telHref(x.phone)}">${esc(x.phone)}</a></dd></div>
              ${x.date ? `<div><dt>${x.slotId ? "예약 일시" : "희망 날짜"}</dt><dd>${esc(dayLabel(x.date))}${x.time ? " " + esc(x.time) : ""}</dd></div>` : ""}
              ${x.people ? `<div><dt>${x.slotId ? "인원" : "인원 · 수량"}</dt><dd>${esc(x.people)}${x.slotId ? "명" : ""}</dd></div>` : ""}
            </dl>
            ${x.message ? `<p class="msg">${esc(x.message)}</p>` : ""}
            ${ntfLine(x.notify)}
            <div class="memo"><input type="text" maxlength="500" placeholder="관리자 메모 (손님에게는 안 보여요)" value="${esc(x.memo || "")}" aria-label="관리자 메모"><button type="button" class="btn sm" data-act="memo">메모 저장</button></div>
            <div class="acts">
              ${x.status !== "done" ? `<button type="button" class="btn primary sm" data-act="done">${r ? "예약 확정" : "확인 완료"}</button>` : ""}
              ${x.status !== "canceled" ? `<button type="button" class="btn sm" data-act="canceled">${r ? "예약 취소" : "취소 처리"}</button>` : ""}
              ${x.status !== "new" ? `<button type="button" class="btn sm" data-act="new">새 문의로 되돌리기</button>` : ""}
              <button type="button" class="link-btn danger" data-act="del">삭제</button>
            </div>
            ${r && alim && alim.ready && x.status === "new" ? `<p class="hint">예약 확정·취소를 누르면 손님께 알림톡이 가요.</p>` : ""}
          </article>`;
        }).join("") || `<p class="empty">${filter === "new" ? "새로 들어온 예약·문의가 없어요." : "해당하는 예약·문의가 없어요."}</p>`}</div>`;
      badge();
    }
    async function load() {
      panel.innerHTML = `<p class="loading">예약 · 문의를 불러오는 중…</p>`;
      try { const r = await api(ctx, "/api/admin/inquiries"); list = r.inquiries; alim = r.alimtalk || null; render(); }
      catch (err) { panel.innerHTML = `<div class="notice warn">${esc(err.message)}</div>`; }
    }
    panel.addEventListener("click", async e => {
      const f = e.target.closest("[data-f]");
      if (f) { filter = f.dataset.f; render(); return; }
      if (e.target.id === "inq-reload") { load(); return; }
      const b = e.target.closest("[data-act]"); if (!b) return;
      const card = b.closest(".inq-card"), id = Number(card.dataset.id), item = list.find(x => x.id === id);
      const act = b.dataset.act;
      if (act === "del" && !b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "정말 삭제할까요? 한 번 더 누르면 삭제돼요"; return; }
      b.disabled = true;
      try {
        if (act === "del") { await api(ctx, "/api/admin/inquiries/" + id, { method: "DELETE" }); list = list.filter(x => x.id !== id); }
        else if (act === "memo") { const memo = ctx.$("input", card).value; await api(ctx, "/api/admin/inquiries/" + id, { method: "PATCH", body: { memo } }); item.memo = memo; b.textContent = "저장됨"; setTimeout(() => { b.textContent = "메모 저장"; b.disabled = false; }, 1200); return; }
        else {
          const r = await api(ctx, "/api/admin/inquiries/" + id, { method: "PATCH", body: { status: act, memo: ctx.$("input", card).value } });
          item.status = act; item.memo = ctx.$("input", card).value;
          if (r.notify) item.notify = { label: act === "done" ? "고객 확정 알림" : "고객 취소 알림", ...r.notify, at: new Date().toISOString() };
        }
        render();
      } catch (err) { b.disabled = false; card.insertAdjacentHTML("beforeend", `<p class="err">${esc(err.message)}</p>`); }
    });
    load();
  }

  /* ---------- 관리자: 떡체험 회차 ---------- */
  function loadSlots(ctx) {
    const esc = ctx.esc, panel = ctx.$('[data-panel="slots"]');
    const kst = () => new Date(Date.now() + 9 * 3600e3).toISOString();
    const today = kst().slice(0, 10), nowHM = kst().slice(11, 16);
    const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
    let month = today.slice(0, 7), slots = [], msg = "";
    const monthAdd = (m, n) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
    const lastDay = m => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
    panel.innerHTML = `<div class="slot-adm">
      <form class="slot-add" novalidate>
        <h3>회차 한꺼번에 만들기</h3>
        <div class="row">
          <label class="fld"><span>시작일</span><input name="from" type="date" min="${today}" value="${today}"></label>
          <label class="fld"><span>종료일</span><input name="to" type="date" min="${today}" value="${addDays(today, 27)}"></label>
          <label class="fld"><span>시간 <small>쉼표로 여러 개</small></span><input name="times" placeholder="11:00, 14:00, 16:00" value="11:00, 14:00"></label>
          <label class="fld"><span>정원</span><input name="capacity" type="number" min="1" max="500" value="10" inputmode="numeric"></label>
          <label class="fld"><span>이름</span><input name="title" maxlength="30" value="떡체험"></label>
        </div>
        <fieldset class="fld"><legend>요일</legend><div class="wd">${WEEK.map((w, i) => `<label><input type="checkbox" name="wd" value="${i}"${i === 0 || i === 6 ? " checked" : ""}><span>${w}</span></label>`).join("")}</div></fieldset>
        <div class="acts"><button type="submit" class="btn primary">회차 만들기</button><span class="hint" id="slot-msg"></span></div>
      </form>
      <div class="slot-month"><button type="button" class="cal-nav" data-m="-1" aria-label="이전 달">‹</button><b id="slot-ym"></b><button type="button" class="cal-nav" data-m="1" aria-label="다음 달">›</button></div>
      <div id="slot-list"><p class="loading">회차를 불러오는 중…</p></div>
    </div>`;
    const form = ctx.$(".slot-add", panel), listEl = ctx.$("#slot-list", panel), msgEl = ctx.$("#slot-msg", panel);
    function render() {
      const [y, mo] = month.split("-").map(Number);
      ctx.$("#slot-ym", panel).textContent = `${y}년 ${mo}월`;
      const g = {};
      slots.forEach(s => { (g[s.date] = g[s.date] || []).push(s); });
      const days = Object.keys(g).sort();
      listEl.innerHTML = (msg ? `<p class="err">${esc(msg)}</p>` : "") + (days.map(d => `<section class="slot-day"><h4>${esc(dayLabel(d))}</h4>${g[d].map(s => {
        const past = s.date < today || (s.date === today && s.time <= nowHM), pct = Math.min(100, Math.round((s.booked / s.capacity) * 100));
        return `<div class="slot-row${past ? " past" : ""}" data-id="${s.id}">
          <b>${esc(s.time)}</b>
          <span>${esc(s.title)} ${s.closed ? '<span class="st canceled">마감</span>' : past ? '<span class="st canceled">지난 회차</span>' : s.remaining ? '<span class="st done">예약 가능</span>' : '<span class="st new">정원 마감</span>'}</span>
          <span class="cap"><small>예약 <b>${s.booked}</b> / 정원 ${s.capacity} · 남은 자리 ${s.remaining}</small><span class="bar"><i style="width:${pct}%"></i></span></span>
          <span class="ops">${past ? "" : `<input type="number" min="1" max="500" value="${s.capacity}" aria-label="정원"><button type="button" class="btn" data-op="cap">정원 저장</button>
            <button type="button" class="btn" data-op="close">${s.closed ? "다시 열기" : "마감"}</button>`}
            ${s.booked ? "" : `<button type="button" class="link-btn danger" data-op="del">삭제</button>`}</span>
        </div>`;
      }).join("")}</section>`).join("") || `<p class="empty">${lines(["이 달에 만든 회차가 없어요.", "위에서 회차를 만들어 주세요."])}</p>`);
    }
    const lines = a => ctx.lines(a);
    async function load() {
      msg = "";
      listEl.innerHTML = `<p class="loading">회차를 불러오는 중…</p>`;
      try { slots = (await api(ctx, `/api/admin/slots?from=${month}-01&to=${lastDay(month)}`)).slots; render(); }
      catch (err) { listEl.innerHTML = `<div class="notice warn">${esc(err.message)}</div>`; }
    }
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const f = form.elements, btn = ctx.$('button[type="submit"]', form);
      const body = { from: f.from.value, to: f.to.value, times: f.times.value.split(/[,\s]+/).map(s => s.trim()).filter(Boolean).map(s => /^\d:\d\d$/.test(s) ? "0" + s : s),
        capacity: Number(f.capacity.value), title: f.title.value.trim(), weekdays: [...form.querySelectorAll('input[name="wd"]:checked')].map(x => +x.value) };
      btn.disabled = true; msgEl.textContent = "만드는 중…"; msgEl.className = "hint";
      try {
        const r = await api(ctx, "/api/admin/slots", { method: "POST", body });
        msgEl.textContent = `${r.created}개 만들었어요.${r.skipped ? ` (이미 있던 ${r.skipped}개는 건너뜀)` : ""}`; msgEl.className = "hint ok-msg";
        month = body.from.slice(0, 7); load();
      } catch (err) { msgEl.textContent = err.message; msgEl.className = "err"; }
      finally { btn.disabled = false; }
    });
    panel.addEventListener("click", async e => {
      const nav = e.target.closest(".cal-nav"); if (nav) { month = monthAdd(month, +nav.dataset.m); load(); return; }
      const b = e.target.closest("[data-op]"); if (!b) return;
      const row = b.closest(".slot-row"), id = +row.dataset.id, s = slots.find(x => x.id === id);
      if (b.dataset.op === "del" && !b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "한 번 더 누르면 삭제"; return; }
      b.disabled = true;
      try {
        if (b.dataset.op === "cap") await api(ctx, "/api/admin/slots/" + id, { method: "PATCH", body: { capacity: Number(ctx.$("input", row).value) } });
        if (b.dataset.op === "close") await api(ctx, "/api/admin/slots/" + id, { method: "PATCH", body: { closed: !s.closed } });
        if (b.dataset.op === "del") await api(ctx, "/api/admin/slots/" + id, { method: "DELETE" });
        await load();
      } catch (err) { b.disabled = false; msg = err.message; render(); }
    });
    load();
  }

  const admin = {
    render(ctx) { return ctx.subTop("관리자", [{ name: "관리자" }]) + `<div class="wrap admin" id="admin"><p class="loading">불러오는 중…</p></div>`; },
    async bind(ctx) {
      const root = ctx.$("#admin"), esc = ctx.esc;
      if (!ctx.API) { root.innerHTML = notReady(ctx); return; }
      if (!token.get()) { location.replace("login.html?next=admin"); return; }
      let me;
      try { me = await api(ctx, "/api/me"); }
      catch (err) {
        if (err.status === 401) { location.replace("login.html?next=admin"); return; }
        root.innerHTML = `<div class="notice warn">${esc(err.message)}</div>`; return;
      }
      if (!me.isAdmin) {
        root.innerHTML = `<div class="auth-box"><div class="notice warn">관리자만 볼 수 있는 페이지예요.</div>
          <p class="auth-sub">${ctx.lines(["관리자로 등록하려면 아래 회원번호를", "서버 설정의 ADMIN_IDS 에 넣어 주세요."])}</p>
          <p style="text-align:center"><code class="mid">${esc(me.id)}</code></p></div>`;
        return;
      }

      root.innerHTML = `
        <div class="adm-tabs" role="tablist">
          <button type="button" role="tab" data-tab="inq" aria-selected="true">예약 · 문의${me.newInquiries ? `<span class="badge-n" id="inq-badge">${me.newInquiries}</span>` : `<span class="badge-n" id="inq-badge" hidden></span>`}</button>
          <button type="button" role="tab" data-tab="slots" aria-selected="false">떡체험 회차</button>
          <button type="button" role="tab" data-tab="menu" aria-selected="false">메뉴 관리</button>
          <button type="button" role="tab" data-tab="members" aria-selected="false">회원 목록</button>
          <span class="adm-who">${esc(me.nickname)} 님 · 관리자</span>
        </div>
        <div data-panel="inq"><p class="loading">예약 · 문의를 불러오는 중…</p></div>
        <div data-panel="slots" hidden></div>
        <div data-panel="menu" hidden><p class="loading">메뉴를 불러오는 중…</p></div>
        <div data-panel="members" hidden><p class="loading">회원 목록을 불러오는 중…</p></div>`;

      /* 탭 · 회원 목록 */
      let membersLoaded = false, slotsLoaded = false;
      ctx.$$(".adm-tabs [data-tab]").forEach(b => b.addEventListener("click", async () => {
        ctx.$$(".adm-tabs [data-tab]").forEach(x => x.setAttribute("aria-selected", String(x === b)));
        ctx.$$("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== b.dataset.tab; });
        if (b.dataset.tab === "slots" && !slotsLoaded) { slotsLoaded = true; loadSlots(ctx); return; }
        if (b.dataset.tab !== "members" || membersLoaded) return;
        const panel = ctx.$('[data-panel="members"]');
        try {
          const r = await api(ctx, "/api/admin/members");
          membersLoaded = true;
          panel.innerHTML = `<p class="adm-count">전체 회원 <b>${r.total.toLocaleString("ko-KR")}</b>명</p>
            <div class="table-wrap"><table class="adm-table"><thead><tr><th>닉네임</th><th>로그인 방식</th><th>가입일</th><th>최근 로그인</th><th>회원번호</th></tr></thead>
            <tbody>${r.members.map(m => `<tr><td>${esc(m.nickname)}${m.isAdmin ? ' <span class="chip good">관리자</span>' : ""}</td><td>${esc(PROVIDER[m.provider] || m.provider)}</td><td>${fmtDate(m.createdAt)}</td><td>${fmtTime(m.lastLogin)}</td><td><code>${esc(m.id)}</code></td></tr>`).join("") || `<tr><td colspan="5" class="none">아직 회원이 없어요.</td></tr>`}</tbody></table></div>`;
        } catch (err) { panel.innerHTML = `<div class="notice warn">${esc(err.message)}</div>`; }
      }));


      loadInquiries(ctx, me);

      let data;
      try { data = await api(ctx, "/api/admin/menu"); }
      catch (err) { ctx.$('[data-panel="menu"]').innerHTML = `<div class="notice warn">${esc(err.message)}</div>`; return; }

      const S = { items: data.items, sha: data.sha, cats: data.categories, sel: null, filter: "all", q: "", dirty: false, pending: new Map(), preview: new Map(), saving: false };
      const catName = id => (S.cats.find(c => c.id === id) || {}).name || id;
      const cur = () => S.items.find(x => x.id === S.sel);
      const thumb = m => {
        const src = S.preview.get(m.id) || m.image;
        return src ? `<img src="${esc(src)}" alt="">` : (ctx.ICON[m.icon] || ctx.ICON.tteok).replace("<svg", '<svg style="color:var(--brand-deep)" aria-hidden="true"');
      };

      ctx.$('[data-panel="menu"]').innerHTML = `
          <div class="adm-grid">
            <aside class="adm-list">
              <div class="adm-tools">
                <select id="f-cat" aria-label="분류로 보기"><option value="all">전체 분류</option>${S.cats.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select>
                <input id="f-q" type="search" placeholder="메뉴 이름 찾기" aria-label="메뉴 찾기">
              </div>
              <button type="button" class="btn primary sm" id="add">+ 새 메뉴 추가</button>
              <ul id="list"></ul>
            </aside>
            <section class="adm-form" id="form"></section>
          </div>
          <div class="adm-save"><span id="save-msg">바뀐 내용이 없어요.</span><button type="button" class="btn primary" id="save" disabled>홈페이지에 저장</button></div>`;

      const listEl = ctx.$("#list"), formEl = ctx.$("#form"), msgEl = ctx.$("#save-msg"), saveBtn = ctx.$("#save");
      const setMsg = (t, cls = "") => { msgEl.textContent = t; msgEl.className = cls; };
      const markDirty = () => { S.dirty = true; saveBtn.disabled = S.saving; setMsg("저장하지 않은 변경이 있어요.", "warn"); };

      function renderList() {
        const q = S.q.replace(/\s/g, "");
        const rows = S.items.filter(m => (S.filter === "all" || m.cat === S.filter) && (!q || String(m.name).replace(/\s/g, "").includes(q)));
        listEl.innerHTML = rows.map(m => `<li><button type="button" data-id="${esc(m.id)}" aria-current="${m.id === S.sel}">
            <span class="t" style="background:${esc(m.tile || "var(--brand-soft)")}">${thumb(m)}</span>
            <span class="n"><b>${esc(m.name || "(이름 없음)")}</b><small>${esc(catName(m.cat))} · ${ctx.priceText(m.price)}${m.soldout ? " · 품절" : ""}</small></span></button></li>`).join("")
          || `<li class="none">조건에 맞는 메뉴가 없어요.</li>`;
      }

      function renderForm() {
        const m = cur();
        if (!m) { formEl.innerHTML = `<div class="adm-empty">${ctx.lines(["목록에서 고칠 메뉴를 고르거나", "새 메뉴를 추가해 주세요."])}</div>`; return; }
        const pt = typeof m.price === "number" ? "num" : m.price === "ask" ? "ask" : "none";
        formEl.innerHTML = `
          <div class="f-photo">
            <span class="t" style="background:${esc(m.tile || "var(--brand-soft)")}">${thumb(m)}</span>
            <div>
              <label class="btn sm">사진 고르기<input type="file" id="f-file" accept="image/jpeg,image/png,image/webp" hidden></label>
              ${m.image || S.preview.has(m.id) ? `<button type="button" class="link-btn" id="f-noimg">사진 빼기</button>` : ""}
              <p class="hint">${ctx.lines(["정사각형으로 자동으로 잘려 올라가요.", "사진이 없으면 그림으로 보여요."])}</p>
            </div>
          </div>
          <label class="fld"><span>메뉴 이름 *</span><input id="f-name" maxlength="80" value="${esc(m.name)}"></label>
          <div class="fld-row">
            <label class="fld"><span>분류</span><select id="f-cat2">${S.cats.map(c => `<option value="${esc(c.id)}"${c.id === m.cat ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
            <label class="fld"><span>배지</span><input id="f-flag" maxlength="10" placeholder="예: 대표, NEW, 시즌" value="${esc(m.flag || "")}"></label>
          </div>
          <fieldset class="fld"><legend>가격</legend>
            <div class="radios">
              <label><input type="radio" name="pt" value="num"${pt === "num" ? " checked" : ""}> 금액</label>
              <input id="f-price" type="number" min="0" step="100" inputmode="numeric" value="${pt === "num" ? m.price : ""}" placeholder="예: 19000"${pt === "num" ? "" : " disabled"}><span class="unit">원</span>
              <label><input type="radio" name="pt" value="none"${pt === "none" ? " checked" : ""}> 매장 문의</label>
              <label><input type="radio" name="pt" value="ask"${pt === "ask" ? " checked" : ""}> 가격 변동 · 문의</label>
            </div>
          </fieldset>
          <fieldset class="fld"><legend>표시</legend>
            <div class="radios">
              <label><input type="checkbox" id="f-hot"${(m.temp || []).includes("hot") ? " checked" : ""}> HOT</label>
              <label><input type="checkbox" id="f-iced"${(m.temp || []).includes("iced") ? " checked" : ""}> ICED</label>
              <label><input type="checkbox" id="f-sold"${m.soldout ? " checked" : ""}> 품절</label>
            </div>
          </fieldset>
          <label class="fld"><span>설명</span><textarea id="f-desc" rows="4" maxlength="1000" placeholder="메뉴 상세 화면에 보이는 설명">${esc(m.desc || "")}</textarea></label>
          <label class="fld"><span>특징 <small>한 줄에 하나씩 · 최대 10개</small></span><textarea id="f-point" rows="3" placeholder="강화섬쌀&#10;첨가물·방부제 없이">${esc((m.point || []).join("\n"))}</textarea></label>
          <div class="f-foot">
            <div class="btns"><button type="button" class="btn sm" id="f-up">▲ 앞으로</button><button type="button" class="btn sm" id="f-down">▼ 뒤로</button>
              <a class="btn sm" href="menu-item.html?id=${esc(m.id)}" target="_blank" rel="noopener">홈페이지에서 보기</a></div>
            <button type="button" class="link-btn danger" id="f-del">이 메뉴 삭제</button>
          </div>
          <div id="del-box" class="notice warn" hidden><p>‘${esc(m.name)}’ 메뉴를 삭제할까요? 저장하기 전까지는 되돌릴 수 있어요(새로고침).</p>
            <div class="btns"><button type="button" class="btn danger sm" id="del-yes">삭제</button><button type="button" class="btn sm" id="del-no">취소</button></div></div>
          <p class="hint">메뉴 코드: ${esc(m.id)}</p>`;

        const f = id => ctx.$("#" + id, formEl);
        const upd = fn => { fn(m); markDirty(); renderList(); };
        f("f-name").addEventListener("input", e => upd(x => { x.name = e.target.value; }));
        f("f-cat2").addEventListener("change", e => upd(x => { x.cat = e.target.value; }));
        f("f-flag").addEventListener("input", e => upd(x => { if (e.target.value.trim()) x.flag = e.target.value; else delete x.flag; }));
        const priceSync = () => {
          const t = ctx.$('input[name="pt"]:checked', formEl).value, inp = f("f-price");
          inp.disabled = t !== "num";
          upd(x => { x.price = t === "num" ? (inp.value === "" ? null : Math.max(0, Math.round(Number(inp.value)))) : t === "ask" ? "ask" : null; });
        };
        ctx.$$('input[name="pt"]', formEl).forEach(r => r.addEventListener("change", () => { priceSync(); if (r.value === "num") f("f-price").focus(); }));
        f("f-price").addEventListener("input", priceSync);
        const tempSync = () => upd(x => { const t = []; if (f("f-hot").checked) t.push("hot"); if (f("f-iced").checked) t.push("iced"); if (t.length) x.temp = t; else delete x.temp; });
        f("f-hot").addEventListener("change", tempSync); f("f-iced").addEventListener("change", tempSync);
        f("f-sold").addEventListener("change", e => upd(x => { if (e.target.checked) x.soldout = true; else delete x.soldout; }));
        f("f-desc").addEventListener("input", e => upd(x => { if (e.target.value.trim()) x.desc = e.target.value; else delete x.desc; }));
        f("f-point").addEventListener("input", e => upd(x => { const p = e.target.value.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 10); if (p.length) x.point = p; else delete x.point; }));
        f("f-file").addEventListener("change", async e => {
          const file = e.target.files[0]; if (!file) return;
          try { const url = await toSquareJpeg(file); S.preview.set(m.id, url); S.pending.set(m.id, url); markDirty(); renderList(); renderForm(); }
          catch (err) { setMsg(err.message, "err"); }
        });
        const noimg = f("f-noimg");
        if (noimg) noimg.addEventListener("click", () => { S.preview.delete(m.id); S.pending.delete(m.id); delete m.image; if (!m.icon) m.icon = DEF_ICON[m.cat] || "tteok"; markDirty(); renderList(); renderForm(); });
        const move = d => { const i = S.items.indexOf(m), j = i + d; if (j < 0 || j >= S.items.length) return; S.items.splice(i, 1); S.items.splice(j, 0, m); markDirty(); renderList(); };
        f("f-up").addEventListener("click", () => move(-1));
        f("f-down").addEventListener("click", () => move(1));
        f("f-del").addEventListener("click", () => { f("del-box").hidden = false; });
        f("del-no").addEventListener("click", () => { f("del-box").hidden = true; });
        f("del-yes").addEventListener("click", () => { S.items.splice(S.items.indexOf(m), 1); S.pending.delete(m.id); S.sel = null; markDirty(); renderList(); renderForm(); });
      }

      listEl.addEventListener("click", e => { const b = e.target.closest("button[data-id]"); if (!b) return; S.sel = b.dataset.id; renderList(); renderForm(); if (matchMedia("(max-width:760px)").matches) formEl.scrollIntoView({ behavior: "smooth" }); });
      ctx.$("#f-cat").addEventListener("change", e => { S.filter = e.target.value; renderList(); });
      ctx.$("#f-q").addEventListener("input", e => { S.q = e.target.value; renderList(); });
      ctx.$("#add").addEventListener("click", () => {
        const cat = S.filter !== "all" ? S.filter : (S.cats[0] || {}).id;
        const pre = PREFIX[cat] || String(cat || "m")[0];
        const max = S.items.reduce((a, x) => { const mm = String(x.id).match(new RegExp("^" + pre + "(\\d+)$")); return mm ? Math.max(a, +mm[1]) : a; }, 0);
        const id = pre + String(max + 1).padStart(2, "0");
        const item = { id, cat, name: "새 메뉴", price: null, icon: DEF_ICON[cat] || "tteok", tile: "#eef3ec" };
        const lastOfCat = S.items.map(x => x.cat).lastIndexOf(cat);
        S.items.splice(lastOfCat + 1, 0, item);
        S.sel = id; S.q = ""; ctx.$("#f-q").value = "";
        markDirty(); renderList(); renderForm();
        const nm = ctx.$("#f-name"); nm.focus(); nm.select();
      });

      saveBtn.addEventListener("click", async () => {
        const blank = S.items.find(x => !String(x.name || "").trim());
        if (blank) { S.sel = blank.id; renderList(); renderForm(); setMsg("메뉴 이름이 비어 있는 메뉴가 있어요.", "err"); return; }
        S.saving = true; saveBtn.disabled = true;
        try {
          for (const [id, url] of [...S.pending]) {
            if (!S.items.some(x => x.id === id)) { S.pending.delete(id); continue; }
            setMsg("사진 올리는 중…");
            const r = await api(ctx, "/api/admin/image", { method: "POST", body: { id, data: url.split(",")[1] } });
            const it = S.items.find(x => x.id === id); if (it) it.image = r.path;
            S.pending.delete(id);
          }
          setMsg("메뉴 저장 중…");
          const r = await api(ctx, "/api/admin/menu", { method: "PUT", body: { items: S.items, sha: S.sha } });
          S.sha = r.sha; S.dirty = false;
          setMsg("저장했어요. 1~2분 뒤 홈페이지에 반영돼요.", "ok");
        } catch (err) {
          setMsg(err.message, "err");
          if (err.status === 401) setTimeout(() => location.replace("login.html?next=admin"), 1500);
        } finally {
          S.saving = false; saveBtn.disabled = !S.dirty;
        }
      });
      addEventListener("beforeunload", e => { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });

      renderList(); renderForm();
    }
  };

  window.HD_PAGES = Object.assign(window.HD_PAGES || {}, { login, mypage, admin });
  window.HD_TOKEN = token;
})();
