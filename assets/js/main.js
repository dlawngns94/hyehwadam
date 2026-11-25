/* =========================================================
   혜화담 — 화면 구성 로직 (보통 수정할 필요 없음)
   메뉴·가격·영업시간·문구는 data/*.json 에서 바꾸세요.
   ========================================================= */
(function () {
  "use strict";

  const PAGE = document.body.dataset.page || "home";
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const params = new URLSearchParams(location.search);
  const nl = s => esc(s).replace(/\n/g, "<br>");
  /* 문장 줄 나눔 — "\n" 또는 배열을 문장 한 줄(.ln)로 */
  const lines = s => (Array.isArray(s) ? s : String(s ?? "").split("\n")).map(l => `<span class="ln">${esc(l)}</span>`).join("");

  let SITE, HOME, MENU;
  const byId = id => MENU.find(m => m.id === id);
  const catOf = id => SITE.categories.find(c => c.id === id) || { name: "", en: "" };
  const telHref = t => "tel:" + String(t || "").replace(/[^0-9+]/g, "");

  /* 가격 표시 — 숫자: 6,000원 / null: 매장 문의 / "ask": 가격 변동 · 문의 */
  function priceText(p) {
    if (typeof p === "number") return p.toLocaleString("ko-KR") + "원";
    if (p === "ask") return "가격 변동 · 문의";
    return "매장 문의";
  }
  const isAsk = p => typeof p !== "number";

  /* ---------- 그림 (사진이 없을 때 쓰는 일러스트) ---------- */
  const S = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  const ICON = {
    tteok: `<svg viewBox="0 0 64 64" ${S}><ellipse cx="32" cy="44" rx="22" ry="6" fill="#fff"/><path d="M14 40c0-9 8-15 18-15s18 6 18 15c0 3-8 5-18 5s-18-2-18-5z" fill="#fffdf8"/><path d="M22 26c0-6 4-10 10-10s10 4 10 10" fill="#f4f8f2"/><path d="M26 33c2 1.5 4 2 6 2s4-.5 6-2"/><circle cx="32" cy="20" r="1.6" fill="currentColor"/></svg>`,
    garae: `<svg viewBox="0 0 64 64" ${S}><ellipse cx="32" cy="50" rx="24" ry="5" fill="#fff"/><rect x="10" y="18" width="9" height="30" rx="4.5" fill="#cdb3df"/><rect x="21.5" y="16" width="9" height="32" rx="4.5" fill="#9fc79a"/><rect x="33" y="18" width="9" height="30" rx="4.5" fill="#f3efe4"/><rect x="44.5" y="16" width="9" height="32" rx="4.5" fill="#a98bc4"/></svg>`,
    strawberry: `<svg viewBox="0 0 64 64" ${S}><path d="M12 40c0-10 9-17 20-17s20 7 20 17c0 4-9 7-20 7s-20-3-20-7z" fill="#fff"/><path d="M24 30c0-7 4-12 8-12s8 5 8 12c0 4-4 7-8 7s-8-3-8-7z" fill="#f08a95"/><path d="M27 18l5 3 5-3M32 21v-5"/><circle cx="29" cy="27" r=".8" fill="currentColor"/><circle cx="35" cy="29" r=".8" fill="currentColor"/></svg>`,
    cup: `<svg viewBox="0 0 64 64" ${S}><path d="M16 22h32l-4 30a4 4 0 0 1-4 3H24a4 4 0 0 1-4-3z" fill="#fff"/><path d="M18 34h28M19 43h26"/><circle cx="26" cy="28" r="2.5" fill="#f3b04d"/><circle cx="36" cy="29" r="2.5" fill="#e86f7e"/><circle cx="31" cy="39" r="2.5" fill="#9fc79a"/><path d="M14 22h36" stroke-width="3"/><path d="M28 22c0-5 2-9 4-11"/></svg>`,
    bingsu: `<svg viewBox="0 0 64 64" ${S}><path d="M10 38h44c0 9-10 16-22 16S10 47 10 38z" fill="#fff"/><path d="M14 38c0-12 8-22 18-22s18 10 18 22" fill="#fbfaf7"/><circle cx="24" cy="30" r="4" fill="#f3b04d"/><circle cx="33" cy="24" r="4" fill="#e86f7e"/><circle cx="41" cy="31" r="4" fill="#9fc79a"/><circle cx="31" cy="33" r="3.2" fill="#f7c9a6"/><path d="M33 20c0-3 2-5 4-6"/></svg>`,
    coffee: `<svg viewBox="0 0 64 64" ${S}><path d="M14 26h32v14a12 12 0 0 1-12 12h-8a12 12 0 0 1-12-12z" fill="#fff"/><path d="M46 30h3a5 5 0 0 1 0 10h-4"/><path d="M18 30h24" stroke="#8a6248"/><path d="M24 12c-2 3 2 5 0 8M32 10c-2 3 2 5 0 8M40 12c-2 3 2 5 0 8"/><path d="M10 56h40"/></svg>`,
    latte: `<svg viewBox="0 0 64 64" ${S}><path d="M14 22h32v18a12 12 0 0 1-12 12h-8a12 12 0 0 1-12-12z" fill="#fff"/><path d="M46 27h3a5 5 0 0 1 0 10h-4"/><path d="M30 34c-3-3-7 1-3 4l3 2 3-2c4-3 0-7-3-4z" fill="#e8c9a8"/><path d="M10 56h40"/></svg>`,
    glass: `<svg viewBox="0 0 64 64" ${S}><path d="M18 18h28l-3 34a4 4 0 0 1-4 4H25a4 4 0 0 1-4-4z" fill="#fff"/><path d="M19.5 30h25l-2 20H21.5z" fill="currentColor" fill-opacity=".14" stroke="none"/><path d="M36 18l6-10h6"/><circle cx="27" cy="38" r="3"/><circle cx="36" cy="43" r="2.4"/><path d="M40 18a6 6 0 0 1 9-3"/></svg>`,
    tea: `<svg viewBox="0 0 64 64" ${S}><path d="M12 30h40c0 12-9 20-20 20s-20-8-20-20z" fill="#fff"/><path d="M16 34h32" stroke="#b07a52"/><ellipse cx="32" cy="52" rx="14" ry="3" fill="#fff"/><path d="M26 22c-2-3 2-5 0-8M34 22c-2-3 2-5 0-8"/></svg>`,
    hands: `<svg viewBox="0 0 64 64" ${S}><ellipse cx="32" cy="46" rx="22" ry="7" fill="#fff"/><circle cx="24" cy="38" r="6" fill="#fffdf8"/><circle cx="38" cy="36" r="7" fill="#e6efe4"/><rect x="12" y="18" width="40" height="7" rx="3.5" fill="#f1dfc4" transform="rotate(-12 32 21)"/><circle cx="46" cy="44" r="4" fill="#cdb3df"/></svg>`,
    gift: `<svg viewBox="0 0 64 64" ${S}><rect x="12" y="26" width="40" height="28" rx="3" fill="#fff"/><rect x="9" y="19" width="46" height="9" rx="2.5" fill="#e6efe4"/><path d="M32 19v35"/><path d="M32 19c-4-8-14-8-12-2 1 3 8 2 12 2zM32 19c4-8 14-8 12-2-1 3-8 2-12 2z"/></svg>`,
    box: `<svg viewBox="0 0 64 64" ${S}><rect x="8" y="16" width="48" height="34" rx="5" fill="#fff"/><path d="M28 16v34M28 33h28"/><circle cx="18" cy="26" r="4" fill="#9fc79a"/><circle cx="18" cy="40" r="4" fill="#e86f7e"/><circle cx="38" cy="25" r="3" fill="#f3b04d"/><circle cx="47" cy="25" r="3" fill="#cdb3df"/><rect x="34" y="38" width="16" height="7" rx="3.5" fill="#f1dfc4"/></svg>`,
    sandwich: `<svg viewBox="0 0 64 64" ${S}><path d="M8 46L32 14l24 32z" fill="#f6e7c8"/><path d="M14 40h36" stroke="#7fb36f" stroke-width="4"/><path d="M17 36h30" stroke="#e86f7e" stroke-width="3"/><path d="M8 46h48v4H8z" fill="#fff"/></svg>`,
    rice: `<svg viewBox="0 0 64 64" ${S}><path d="M10 32h44c0 12-10 20-22 20S10 44 10 32z" fill="#fff"/><path d="M14 32c0-8 8-14 18-14s18 6 18 14" fill="#fbfaf7"/><path d="M24 26l1 1M32 23l1 1M40 26l1 1M28 29l1 1M36 29l1 1"/><path d="M24 54h16"/></svg>`,
    leaf: `<svg viewBox="0 0 64 64" ${S}><path d="M14 50C14 26 30 14 52 12c0 24-14 38-38 38z" fill="currentColor" fill-opacity=".12"/><path d="M14 50L38 26"/></svg>`,
    shield: `<svg viewBox="0 0 64 64" ${S}><path d="M32 8l20 7v15c0 13-9 22-20 26-11-4-20-13-20-26V15z" fill="currentColor" fill-opacity=".12"/><path d="M23 32l6 6 12-13"/></svg>`
  };
  const UI = {
    menu: `<svg viewBox="0 0 24 24" ${S}><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
    close: `<svg viewBox="0 0 24 24" ${S}><path d="M6 6l12 12M18 6L6 18"/></svg>`,
    insta: `<svg viewBox="0 0 24 24" ${S}><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".8" fill="currentColor"/></svg>`,
    pin: `<svg viewBox="0 0 24 24" ${S}><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
    phone: `<svg viewBox="0 0 24 24" ${S}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>`,
    home: `<svg viewBox="0 0 24 24" ${S}><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/></svg>`,
    search: `<svg viewBox="0 0 24 24" ${S}><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>`,
    up: `<svg viewBox="0 0 24 24" ${S}><path d="M6 14l6-6 6 6"/></svg>`,
    store: `<svg viewBox="0 0 24 24" ${S}><path d="M4 10h16v10H4zM3 10l2-6h14l2 6M10 20v-5h4v5"/></svg>`,
    user: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>`,
    note: `<svg viewBox="0 0 24 24" ${S}><rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2v4M16 2v4M4 10h16M8 14h3M8 17h6"/></svg>`
  };
  /* 회원 기능 — data/site.json 의 auth.api 에 서버 주소가 있을 때만 켜짐 */
  const apiBase = () => String((SITE.auth && SITE.auth.api) || "").replace(/\/+$/, "");
  const loggedIn = () => { try { return !!localStorage.getItem("hd_token"); } catch { return false; } };
  const art = (m, cls = "") => m.image
    ? `<img src="${esc(m.image)}" alt="${esc(m.name)}" loading="lazy">`
    : (ICON[m.icon] || ICON.tteok).replace("<svg", `<svg class="${cls}" style="color:var(--brand-deep)" aria-hidden="true"`);

  /* ---------- 공통: 헤더 · 푸터 ---------- */
  const NAV = [
    { href: "about.html", en: "ABOUT", ko: "혜화담 이야기", page: "about" },
    { href: "menu.html", en: "MENU", ko: "메뉴", page: "menu", mega: true },
    { href: "class.html", en: "CLASS", ko: "떡체험", page: "class" },
    { href: "store.html", en: "STORE", ko: "매장 안내", page: "store" }
  ];
  function megaMenu() {
    const cats = SITE.categories.filter(c => c.id !== "all");
    const col = list => list.map(c => `<a href="menu.html?cat=${c.id}">${esc(c.name)}</a>`).join("");
    return `<div class="mega"><div class="wrap">
      <div><h4>디저트</h4>${col(cats.filter(c => ["tteok", "bingsu"].includes(c.id)))}</div>
      <div><h4>음료</h4>${col(cats.filter(c => ["coffee", "ade", "tea"].includes(c.id)))}</div>
      <div><h4>단체 · 선물</h4>${col(cats.filter(c => c.id === "order"))}<a href="class.html">떡체험 클래스</a></div>
      <div class="promo"><p>대표 메뉴</p><a href="menu-item.html?id=t01"><b style="color:#fff">강화섬쌀 우유앙금효소떡 세트</b></a><a href="menu.html">전체 메뉴 보기 →</a></div>
    </div></div>`;
  }
  function header() {
    const items = NAV.map(n => `<li><a href="${n.href}"${PAGE === n.page || (PAGE === "item" && n.page === "menu") ? ' aria-current="page"' : ""}><div>${n.en}<span>${n.ko}</span></div></a>${n.mega ? megaMenu() : ""}</li>`).join("");
    const drawerMenu = SITE.categories.filter(c => c.id !== "all").map(c => `<a href="menu.html?cat=${c.id}">${esc(c.name)}</a>`).join("");
    return `<header class="site"><div class="wrap h-row">
        <a class="logo" href="index.html" aria-label="${esc(SITE.name)} 홈"><b>${esc(SITE.name)}</b><small>${esc(SITE.nameEn)}</small></a>
        <ul class="gnb">${items}</ul>
        <div class="h-util">
          <a class="icon-btn ext" href="${esc(SITE.links.instagram)}" target="_blank" rel="noopener" aria-label="인스타그램">${UI.insta}</a>
          <a class="icon-btn ext" href="store.html" aria-label="매장 안내">${UI.pin}</a>
          <a class="icon-btn" href="${loggedIn() ? "mypage.html" : "login.html"}" aria-label="${loggedIn() ? "내 정보" : "로그인"}">${UI.user}</a>
          <button class="icon-btn menu-toggle" type="button" aria-label="메뉴 열기" aria-expanded="false">${UI.menu}</button>
        </div>
      </div></header>
      <div class="drawer" aria-hidden="true"><nav aria-label="모바일 메뉴">
        <div class="d-head"><a class="logo" href="index.html"><b>${esc(SITE.name)}</b><small>${esc(SITE.nameEn)}</small></a><button class="icon-btn d-close" type="button" aria-label="메뉴 닫기">${UI.close}</button></div>
        <a class="d-link" href="about.html">혜화담 이야기</a>
        <details open><summary>메뉴</summary><a href="menu.html">전체 메뉴</a>${drawerMenu}</details>
        <a class="d-link" href="class.html">떡체험</a>
        <a class="d-link" href="store.html">매장 안내</a>
        <a class="d-link" href="${esc(SITE.links.instagram)}" target="_blank" rel="noopener">인스타그램</a>
        <a class="d-link" href="${esc(SITE.links.smartstore)}" target="_blank" rel="noopener">스마트스토어</a>
        <a class="d-link" href="${loggedIn() ? "mypage.html" : "login.html"}">${loggedIn() ? "내 정보" : "로그인"}</a>
      </nav></div>`;
  }
  function footer() {
    const st = SITE.store, co = SITE.company;
    return `<footer class="site"><div class="wrap">
      <div class="f-top">
        <a class="logo" href="index.html"><b>${esc(SITE.name)}</b><small>${esc(SITE.nameEn)}</small></a>
        <div class="f-links">
          <a href="menu.html">메뉴</a><a href="class.html">떡체험</a><a href="store.html">매장 안내</a>
          <a href="${esc(SITE.links.instagram)}" target="_blank" rel="noopener">인스타그램</a>
          <a href="${esc(SITE.links.smartstore)}" target="_blank" rel="noopener">스마트스토어</a>
        </div>
      </div>
      <div class="f-info">
        <p><b>${esc(co.corpName)}</b> · 대표 ${esc(co.ceo)} · 사업자등록번호 ${esc(co.businessNumber)}</p>
        <p>${esc(st.address)} · <a href="${telHref(st.tel)}">${esc(st.tel)}</a></p>
        <p>${st.hours.map(h => `${esc(h.day)} ${esc(h.time)}`).join(" · ")} · ${esc(st.hoursNote)}</p>
      </div>
      <p class="f-legal"><a href="privacy.html"><b>개인정보처리방침</b></a></p>
      <p class="copy">© ${new Date().getFullYear()} ${esc(SITE.name)}. All rights reserved.</p>
    </div></footer>
    <button class="to-top" type="button" aria-label="맨 위로">${UI.up}</button>`;
  }
  function bindChrome() {
    const drawer = $(".drawer"), tog = $(".menu-toggle");
    const set = open => { drawer.classList.toggle("open", open); drawer.setAttribute("aria-hidden", String(!open)); tog.setAttribute("aria-expanded", String(open)); document.body.style.overflow = open ? "hidden" : ""; };
    tog.addEventListener("click", () => set(true));
    $(".d-close").addEventListener("click", () => set(false));
    drawer.addEventListener("click", e => { if (e.target === drawer) set(false); });
    addEventListener("keydown", e => { if (e.key === "Escape") set(false); });
    const top = $(".to-top");
    addEventListener("scroll", () => top.classList.toggle("show", scrollY > 600), { passive: true });
    top.addEventListener("click", () => scrollTo({ top: 0 }));
  }
  const subTop = (title, trail) => `<section class="sub-top"><div class="wrap"><h1>${esc(title)}</h1>
    <nav class="crumb" aria-label="현재 위치"><a href="index.html" aria-label="홈">${UI.home}</a>${trail.map(t => `<span>›</span>${t.href ? `<a href="${t.href}">${esc(t.name)}</a>` : `<span>${esc(t.name)}</span>`}`).join("")}</nav></div></section>`;

  /* 메뉴 카드 (스타벅스식 둥근 사진 + 이름) */
  const card = m => `<a class="card${m.soldout ? " soldout" : ""}" href="menu-item.html?id=${m.id}">
      <span class="thumb" style="background:${esc(m.tile || "var(--brand-soft)")}">${art(m)}${m.soldout ? `<span class="flag">품절</span>` : m.flag ? `<span class="flag f-${esc(m.flag)}">${esc(m.flag)}</span>` : ""}</span>
      <span class="name">${esc(m.name)}</span>
      <span class="price num${isAsk(m.price) ? " ask" : ""}">${priceText(m.price)}</span></a>`;

  /* ---------- 페이지: 메인 ---------- */
  function pageHome() {
    const s = HOME.slides;
    const slides = s.map(sl => `<div class="slide" style="background:${esc(sl.color)}"><div class="wrap">
        <div><div class="eyebrow">${esc(sl.eyebrow)}</div><h2>${esc(sl.title)}</h2><p>${esc(sl.text)}</p><a class="btn primary" href="${esc(sl.link)}">자세히 보기</a></div>
        <div class="art">${sl.image ? `<img src="${esc(sl.image)}" alt="">` : (ICON[sl.icon] || ICON.tteok).replace("<svg", '<svg style="color:var(--brand-deep)" aria-hidden="true"')}</div>
      </div></div>`).join("");
    const pick = list => list.map(byId).filter(Boolean).map(card).join("");
    const st = HOME.story, go = HOME.groupOrder;
    return `<section class="hero" aria-label="소개 배너"><div class="slides">${slides}</div>
        <div class="dots">${s.map((_, i) => `<button type="button" aria-label="${i + 1}번째 배너"${i ? "" : ' aria-current="true"'}></button>`).join("")}</div></section>
      <section class="sec"><div class="wrap">
        <div class="sec-head"><div><h2>${esc(HOME.signature.title)}</h2><p>${esc(HOME.signature.sub)}</p></div><a class="more" href="menu.html">전체 메뉴 →</a></div>
        <div class="grid">${pick(HOME.signature.pick)}</div></div></section>
      <section class="sec cream"><div class="wrap"><div class="promise">
        ${HOME.promise.map(p => `<div>${ICON[p.icon] || ""}<b>${esc(p.title)}</b><span>${esc(p.text)}</span></div>`).join("")}
      </div></div></section>
      <section class="sec"><div class="wrap story">
        <div class="art">${st.image ? `<img src="${esc(st.image)}" alt="혜화담 우유앙금효소떡 세트" loading="lazy">` : ICON.rice}</div>
        <div><div class="eyebrow">${esc(st.eyebrow)}</div><h2>${esc(st.title)}</h2><p>${lines(st.text)}</p><a class="btn" href="${esc(st.link)}">혜화담 이야기</a></div>
      </div></section>
      <section class="sec cream"><div class="wrap">
        <div class="sec-head"><div><h2>${esc(catOf("bingsu").name)}</h2><p>${esc(catOf("bingsu").sub)}</p></div><a class="more" href="menu.html?cat=bingsu">빙수 전체 →</a></div>
        <div class="grid">${MENU.filter(m => m.cat === "bingsu").slice(0, 8).map(card).join("")}</div></div></section>
      <section class="band"><div class="wrap">
        <div><div class="eyebrow">${esc(go.eyebrow)}</div><h2>${esc(go.title)}</h2><p>${lines(go.text)}</p>
          <a class="btn light" href="${telHref(SITE.store.tel)}">${UI.phone} 전화 문의 ${esc(SITE.store.tel)}</a></div>
        <div class="grid">${pick(go.pick)}</div></div></section>
      <section class="sec"><div class="wrap info-grid" style="padding-block:0">
        ${mapCard()}
        <div><div class="sec-head" style="margin-bottom:8px"><div><h2>매장 안내</h2></div><a class="more" href="store.html">자세히 →</a></div>${infoList()}</div>
      </div></section>`;
  }
  function bindSlider() {
    const track = $(".slides"); if (!track) return;
    const dots = $$(".dots button"); let i = 0, timer;
    const go = n => { i = (n + dots.length) % dots.length; track.style.transform = `translateX(-${i * 100}%)`; dots.forEach((d, k) => d.setAttribute("aria-current", String(k === i))); };
    const play = () => { clearInterval(timer); timer = setInterval(() => go(i + 1), 5500); };
    dots.forEach((d, k) => d.addEventListener("click", () => { go(k); play(); }));
    let x0 = null;
    track.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
    track.addEventListener("touchend", e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) { go(i + (dx < 0 ? 1 : -1)); play(); } x0 = null; });
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) play();
  }

  /* ---------- 페이지: 메뉴 목록 ---------- */
  const state = { cat: params.get("cat") || "all", temp: "all", q: params.get("q") || "" };
  function pageMenu() {
    if (!SITE.categories.some(c => c.id === state.cat)) state.cat = "all";
    return subTop("메뉴", [{ name: "메뉴", href: "menu.html" }]) + `<div class="wrap">
      <div class="filter">
        <div class="filter-top"><b>분류 보기</b><label class="search">${UI.search}<input type="search" placeholder="메뉴 이름으로 찾기" value="${esc(state.q)}" aria-label="메뉴 검색"></label></div>
        <div class="tabs" role="group" aria-label="분류">${SITE.categories.map(c => `<button type="button" data-cat="${c.id}" aria-pressed="${c.id === state.cat}">${esc(c.name)}</button>`).join("")}</div>
        <div class="temps" role="group" aria-label="온도"><span>온도</span>
          <button type="button" data-temp="all" aria-pressed="true">전체</button>
          <button type="button" class="hot" data-temp="hot" aria-pressed="false">HOT</button>
          <button type="button" class="iced" data-temp="iced" aria-pressed="false">ICED</button></div>
      </div>
      <div id="menu-list"></div></div>`;
  }
  function renderMenuList() {
    const q = state.q.trim().replace(/\s/g, "");
    const match = m => (state.cat === "all" || m.cat === state.cat)
      && (state.temp === "all" || (m.temp || []).includes(state.temp))
      && (!q || m.name.replace(/\s/g, "").includes(q));
    const cats = SITE.categories.filter(c => c.id !== "all" && (state.cat === "all" || c.id === state.cat));
    const html = cats.map(c => {
      const items = MENU.filter(m => m.cat === c.id && match(m));
      if (!items.length) return "";
      return `<section class="group"><div class="group-head"><small>${esc(c.en)}</small><h2>${esc(c.name)}</h2><p>${esc(c.sub)}</p></div>
        <div class="grid">${items.map(card).join("")}</div></section>`;
    }).join("");
    $("#menu-list").innerHTML = html || `<p class="empty">조건에 맞는 메뉴가 없어요.</p>`;
  }
  function bindMenu() {
    renderMenuList();
    const sync = () => { const u = new URL(location.href); state.cat === "all" ? u.searchParams.delete("cat") : u.searchParams.set("cat", state.cat); history.replaceState(null, "", u); };
    $$(".tabs button").forEach(b => b.addEventListener("click", () => {
      state.cat = b.dataset.cat; $$(".tabs button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); sync(); renderMenuList();
    }));
    $$(".temps button").forEach(b => b.addEventListener("click", () => {
      state.temp = b.dataset.temp; $$(".temps button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); renderMenuList();
    }));
    $(".search input").addEventListener("input", e => { state.q = e.target.value; renderMenuList(); });
  }

  /* ---------- 페이지: 메뉴 상세 ---------- */
  function pageItem() {
    const m = byId(params.get("id"));
    if (!m) return subTop("메뉴", [{ name: "메뉴", href: "menu.html" }]) + `<p class="empty">메뉴를 찾을 수 없어요.<br><br><a class="btn" href="menu.html">메뉴 전체 보기</a></p>`;
    const c = catOf(m.cat);
    document.title = `${m.name} | ${SITE.name}`;
    const temps = (m.temp || []).map(t => `<span class="tag ${t}">${t === "hot" ? "HOT" : "ICED"}</span>`).join("");
    const actions = [
      m.link === "class.html" ? `<a class="btn primary" href="class.html">떡체험 자세히 보기</a>` : "",
      apiBase() && !m.link ? `<a class="btn primary" href="#inquiry">${UI.note} ${inqKind(m) === "reserve" ? "예약 · 문의 남기기" : "문의 남기기"}</a>` : "",
      `<a class="btn${m.link || apiBase() ? "" : " primary"}" href="${telHref(SITE.store.tel)}">${UI.phone} 전화 문의</a>`,
      `<a class="btn" href="${esc(SITE.links.instagram)}" target="_blank" rel="noopener">${UI.insta} 인스타그램 DM</a>`,
      `<a class="btn" href="${esc(SITE.links.smartstore)}" target="_blank" rel="noopener">스마트스토어</a>`
    ].join("");
    const related = MENU.filter(x => x.cat === m.cat && x.id !== m.id).slice(0, 4);
    return subTop(c.name, [{ name: "메뉴", href: "menu.html" }, { name: c.name, href: `menu.html?cat=${m.cat}` }, { name: m.name }]) + `<div class="wrap">
      <div class="detail">
        <div class="pic" style="background:${esc(m.tile || "var(--brand-soft)")}">${art(m)}</div>
        <div>
          <div class="cat">${esc(c.en)}</div>
          <h1>${esc(m.name)}</h1>
          ${temps ? `<div class="temp-tags">${temps}</div>` : ""}
          ${m.flag ? `<span class="tag" style="color:var(--brand);border-color:#cfe1d5;background:var(--brand-soft)">${esc(m.flag)} 메뉴</span>` : ""}
          ${m.desc ? `<p class="desc">${esc(m.desc)}</p>` : `<p class="desc">${esc(c.sub)}</p>`}
          <div class="price-row"><span>가격</span>${isAsk(m.price) ? `<span class="ask">${priceText(m.price)}</span>` : `<strong class="num">${priceText(m.price)}</strong>`}</div>
          ${m.point ? `<ul class="points">${m.point.map(p => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
          <div class="actions">${actions}</div>
          <p class="note">${m.soldout ? "지금은 품절이에요. " : ""}가격과 구성은 계절·재료 상황에 따라 바뀔 수 있어요.</p>
        </div>
      </div>
      ${m.link ? "" : inquiryForm(m)}
      ${related.length ? `<section class="group"><div class="group-head"><small>MORE</small><h2>${esc(c.name)} 다른 메뉴</h2></div><div class="grid">${related.map(card).join("")}</div></section>` : ""}
    </div>`;
  }

  /* ---------- 공통 블록: 예약 · 문의 폼 (서버가 연결됐을 때만 보임) ---------- */
  const inqKind = m => ["tteok", "order"].includes(m.cat) ? "reserve" : "inquiry";
  const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  function inquiryForm(m, force, bare) {
    if (!apiBase()) return "";
    const k = force || inqKind(m);
    const head = bare ? "" : `<section class="inq" id="inquiry">
      <div class="inq-head"><small>RESERVATION · INQUIRY</small><h2>예약 · 문의하기</h2>
        <p>${lines(["남겨 주시면 확인 후 연락드려요.", "급한 예약은 전화가 가장 빨라요."])}</p></div>`;
    return head + `
      <form class="inq-form" novalidate data-item="${esc(m.id)}" data-name="${esc(m.name)}">
        <div class="seg" role="radiogroup" aria-label="종류">
          <label><input type="radio" name="kind" value="reserve"${k === "reserve" ? " checked" : ""}><span>예약 · 주문</span></label>
          <label><input type="radio" name="kind" value="inquiry"${k === "inquiry" ? " checked" : ""}><span>문의</span></label>
        </div>
        <p class="inq-item">선택한 메뉴 <b>${esc(m.name)}</b></p>
        <div class="fld-row">
          <label class="fld"><span>이름 *</span><input name="name" maxlength="30" autocomplete="name"></label>
          <label class="fld"><span>연락처 *</span><input name="phone" type="tel" inputmode="tel" maxlength="13" placeholder="010-1234-5678" autocomplete="tel"></label>
        </div>
        <div class="fld-row r3" data-for="reserve">
          <label class="fld"><span>희망 날짜 *</span><input name="date" type="date" min="${kstToday()}"></label>
          <label class="fld"><span>희망 시간</span><input name="time" type="time" step="600"></label>
          <label class="fld"><span>인원 · 수량</span><input name="people" type="number" min="1" max="1000" inputmode="numeric" placeholder="예: 20"></label>
        </div>
        <label class="fld"><span class="msg-label">요청 사항</span><textarea name="message" rows="4" maxlength="1000" placeholder="예: 답례품 포장 원해요, 알레르기가 있어요"></textarea></label>
        <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div class="agree">
          <label><input type="checkbox" name="agree"> <span><b>[필수]</b> 개인정보 수집·이용에 동의합니다.</span></label>
          <details><summary>내용 보기</summary><ul>
            <li>수집 항목: 이름, 연락처, 희망 날짜·시간, 인원·수량, 요청 내용</li>
            <li>이용 목적: 예약·문의 확인 및 연락</li>
            <li>보유 기간: 처리 완료 후 1년 (이후 자동 삭제)</li>
            <li>동의하지 않으셔도 되며, 이 경우 전화(${esc(SITE.store.tel)})로 예약·문의하실 수 있어요.</li>
          </ul></details>
        </div>
        <p class="inq-err" role="alert" hidden></p>
        <button class="btn primary inq-submit" type="submit">보내기</button>
      </form>` + (bare ? "" : `</section>`);
  }
  function bindPhone(input) {
    input.addEventListener("input", e => {
      const d = e.target.value.replace(/\D/g, "").slice(0, 11);
      e.target.value = d.length < 4 ? d : d.length < 8 ? d.replace(/^(\d{3})(\d+)/, "$1-$2")
        : d.startsWith("02") ? d.replace(/^(02)(\d{3,4})(\d{4})$/, "$1-$2-$3") : d.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
    });
  }
  const authHeaders = () => { const h = { "Content-Type": "application/json" }; try { const tk = localStorage.getItem("hd_token"); if (tk) h.Authorization = "Bearer " + tk; } catch { /* 무시 */ } return h; };
  const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
  const dayLabel = d => { const x = new Date(d + "T00:00:00Z"); return `${x.getUTCMonth() + 1}월 ${x.getUTCDate()}일 (${WEEK[x.getUTCDay()]})`; };

  /* ---------- 떡체험 달력 예약 (회차 · 정원 · 남은 자리) ---------- */
  function bookingBox(m) {
    if (!apiBase()) return "";
    return `<section class="inq book" id="inquiry" data-item="${esc(m.id)}" data-name="${esc(m.name)}">
      <div class="inq-head"><small>RESERVATION</small><h2>떡체험 예약</h2>
        <p>${lines(["달력에서 날짜와 시간을 골라 주세요.", "회차마다 정원이 있어 남은 자리만큼 예약할 수 있어요."])}</p></div>
      <div id="book"><p class="loading">예약 가능한 날짜를 불러오는 중…</p></div>
    </section>`;
  }
  function bindBooking() {
    const box = $("#book"); if (!box) return;
    const sec = box.closest(".book"), item = { id: sec.dataset.item, name: sec.dataset.name };
    const S = { slots: [], today: kstToday(), month: null, date: null, slotId: null };
    const ym = d => d.slice(0, 7);
    const monthAdd = (m, n) => { const [y, mo] = m.split("-").map(Number); const x = new Date(Date.UTC(y, mo - 1 + n, 1)); return x.toISOString().slice(0, 7); };
    const byDate = () => { const g = {}; S.slots.forEach(s => { (g[s.date] = g[s.date] || []).push(s); }); return g; };
    const open = s => !s.closed && s.remaining > 0;

    async function load(keep) {
      try {
        const res = await fetch(apiBase() + "/api/slots", { headers: authHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "불러오지 못했어요.");
        S.slots = data.slots; S.today = data.today || S.today;
      } catch (err) { S.slots = []; S.err = err.message; }
      if (!S.slots.length) return fallback();
      if (!keep || !S.month) {
        const first = S.slots.find(open) || S.slots[0];
        S.month = ym(first.date);
      }
      if (S.slotId && !S.slots.some(s => s.id === S.slotId)) S.slotId = null;
      render();
    }
    function fallback() {
      box.innerHTML = `<div class="notice">${lines(["지금은 온라인으로 예약할 수 있는 회차가 없어요.", "원하시는 날짜를 남겨 주시면 확인 후 연락드릴게요."])}</div>` + inquiryForm({ ...item, cat: "order" }, "reserve", true);
      bindInquiry();
    }
    function calendar() {
      const g = byDate();
      const [y, mo] = S.month.split("-").map(Number);
      const first = new Date(Date.UTC(y, mo - 1, 1)), days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      const minM = ym(S.today), maxM = ym(S.slots[S.slots.length - 1].date);
      let cells = "";
      for (let i = 0; i < first.getUTCDay(); i++) cells += `<span class="cd empty"></span>`;
      for (let d = 1; d <= days; d++) {
        const ds = `${S.month}-${String(d).padStart(2, "0")}`, list = g[ds] || [];
        const left = list.filter(open).reduce((a, s) => a + s.remaining, 0);
        const cls = !list.length ? "off" : left ? "has" : "full";
        cells += list.length
          ? `<button type="button" class="cd ${cls}${ds === S.date ? " sel" : ""}${ds === S.today ? " today" : ""}" data-date="${ds}" aria-label="${dayLabel(ds)} ${left ? `남은 자리 ${left}` : "마감"}"><b>${d}</b><small>${left ? `${left}석` : "마감"}</small></button>`
          : `<span class="cd off${ds === S.today ? " today" : ""}"><b>${d}</b></span>`;
      }
      return `<div class="cal">
        <div class="cal-head"><button type="button" class="cal-nav" data-m="-1" aria-label="이전 달"${S.month <= minM ? " disabled" : ""}>‹</button>
          <b>${y}년 ${mo}월</b><button type="button" class="cal-nav" data-m="1" aria-label="다음 달"${S.month >= maxM ? " disabled" : ""}>›</button></div>
        <div class="cal-grid">${WEEK.map((w, i) => `<span class="cw${i === 0 ? " sun" : i === 6 ? " sat" : ""}">${w}</span>`).join("")}${cells}</div>
        <p class="cal-legend"><span class="lg has"></span>예약 가능 <span class="lg full"></span>마감</p>
      </div>`;
    }
    function slotList() {
      if (!S.date) return `<div class="slot-pick empty">${lines(["달력에서 예약 가능한(초록) 날짜를", "골라 주세요."])}</div>`;
      const list = byDate()[S.date] || [];
      return `<div class="slot-pick"><h3>${dayLabel(S.date)}</h3><div class="slots">${list.map(s => {
        const full = !open(s), pct = Math.round((s.booked / s.capacity) * 100);
        return `<button type="button" class="slot${s.id === S.slotId ? " sel" : ""}" data-slot="${s.id}"${full ? " disabled" : ""}>
          <b>${esc(s.time)}</b><span class="slot-t">${esc(s.title)}</span>
          <span class="slot-n">${full ? (s.closed ? "예약 마감" : "정원 마감") : `남은 자리 <em>${s.remaining}</em> / ${s.capacity}`}</span>
          <span class="bar"><i style="width:${Math.min(100, pct)}%"></i></span></button>`;
      }).join("")}</div></div>`;
    }
    function bookForm() {
      const s = S.slots.find(x => x.id === S.slotId);
      if (!s) return "";
      return `<form class="inq-form book-form" novalidate>
        <p class="book-sum"><b>${dayLabel(s.date)} ${esc(s.time)}</b> · ${esc(s.title)} · 남은 자리 ${s.remaining}</p>
        <div class="fld-row r3">
          <label class="fld"><span>이름 *</span><input name="name" maxlength="30" autocomplete="name"></label>
          <label class="fld"><span>연락처 *</span><input name="phone" type="tel" inputmode="tel" maxlength="13" placeholder="010-1234-5678" autocomplete="tel"></label>
          <label class="fld"><span>인원 * <small>최대 ${s.remaining}명</small></span><input name="people" type="number" min="1" max="${s.remaining}" inputmode="numeric" value="1"></label>
        </div>
        <label class="fld"><span>요청 사항</span><textarea name="message" rows="3" maxlength="1000" placeholder="예: 아이 2명, 어른 2명이에요 / 단체명"></textarea></label>
        <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div class="agree">
          <label><input type="checkbox" name="agree"> <span><b>[필수]</b> 개인정보 수집·이용에 동의합니다.</span></label>
          <details><summary>내용 보기</summary><ul>
            <li>수집 항목: 이름, 연락처, 예약 날짜·시간, 인원, 요청 내용</li>
            <li>이용 목적: 예약 확인 및 연락(카카오 알림톡 포함)</li>
            <li>보유 기간: 처리 완료 후 1년 (이후 자동 삭제)</li>
            <li>동의하지 않으셔도 되며, 이 경우 전화(${esc(SITE.store.tel)})로 예약하실 수 있어요.</li>
          </ul></details>
        </div>
        <p class="inq-err" role="alert" hidden></p>
        <button class="btn primary inq-submit" type="submit">예약 신청하기</button>
      </form>`;
    }
    function render() {
      const keep = box.querySelector(".book-form") && S.slotId ? Object.fromEntries([...new FormData(box.querySelector(".book-form"))]) : null;
      box.innerHTML = `<div class="book-grid">${calendar()}${slotList()}</div>${bookForm()}`;
      const form = box.querySelector(".book-form");
      if (form) {
        if (keep) for (const [k, v] of Object.entries(keep)) { const el = form.elements[k]; if (el && el.type !== "checkbox" && k !== "people") el.value = v; }
        bindPhone(form.elements.phone);
        form.addEventListener("submit", submit);
      }
    }
    box.addEventListener("click", e => {
      const nav = e.target.closest(".cal-nav"); if (nav) { S.month = monthAdd(S.month, +nav.dataset.m); render(); return; }
      const day = e.target.closest(".cd[data-date]"); if (day) { S.date = day.dataset.date; S.slotId = null; render(); return; }
      const sl = e.target.closest(".slot[data-slot]");
      if (sl && !sl.disabled) { S.slotId = +sl.dataset.slot; render(); const f = box.querySelector(".book-form"); if (f) { f.scrollIntoView({ behavior: "smooth", block: "nearest" }); f.elements.name.focus({ preventScroll: true }); } }
    });
    async function submit(e) {
      e.preventDefault();
      const form = e.target, f = form.elements, err = form.querySelector(".inq-err"), btn = form.querySelector(".inq-submit");
      const s = S.slots.find(x => x.id === S.slotId);
      const show = (msg, field) => { err.textContent = msg; err.hidden = false; if (field && f[field]) f[field].focus(); };
      err.hidden = true;
      const body = { slotId: S.slotId, itemId: item.id, itemName: s ? s.title : item.name, name: f.name.value.trim(), phone: f.phone.value.trim(),
        people: f.people.value === "" ? null : Number(f.people.value), message: f.message.value.trim(), agree: f.agree.checked, website: f.website.value };
      if (!body.name) return show("이름을 입력해 주세요.", "name");
      if (!/^0\d{8,10}$/.test(body.phone.replace(/\D/g, ""))) return show("연락처를 정확히 입력해 주세요. 예: 010-1234-5678", "phone");
      if (!Number.isInteger(body.people) || body.people < 1) return show("인원을 입력해 주세요.", "people");
      if (s && body.people > s.remaining) return show(`남은 자리가 ${s.remaining}자리예요.`, "people");
      if (!body.agree) return show("개인정보 수집·이용에 동의해 주세요.", "agree");
      btn.disabled = true; btn.textContent = "보내는 중…";
      try {
        const res = await fetch(apiBase() + "/api/inquiries", { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) { await load(true); const f2 = box.querySelector(".book-form"); const msg = data.message || "자리가 바뀌었어요."; if (f2) { const e2 = f2.querySelector(".inq-err"); e2.textContent = msg; e2.hidden = false; } else box.insertAdjacentHTML("beforeend", `<p class="inq-err">${esc(msg)}</p>`); return; }
        if (!res.ok) throw new Error(data.message || "보내지 못했어요. 잠시 후 다시 시도해 주세요.");
        sec.querySelector(".inq-head p").hidden = true;
        box.innerHTML = `<div class="inq-done" role="status"><b>예약 신청이 접수됐어요.</b>
          <p>${lines(["사장님이 확인 후 확정 여부를 알려 드릴게요.", "급한 경우 전화 주시면 더 빨라요."])}</p>
          <dl><div><dt>체험</dt><dd>${esc(body.itemName)}</dd></div><div><dt>일시</dt><dd>${esc(dayLabel(data.date || s.date))} ${esc(data.time || s.time)}</dd></div>
          <div><dt>인원</dt><dd>${body.people}명</dd></div><div><dt>연락처</dt><dd>${esc(body.phone)}</dd></div></dl>
          <a class="btn" href="${telHref(SITE.store.tel)}">${UI.phone} ${esc(SITE.store.tel)}</a></div>`;
      } catch (er) {
        btn.disabled = false; btn.textContent = "예약 신청하기";
        show(er.message === "Failed to fetch" ? "서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요." : er.message);
      }
    }
    load();
  }

  function bindInquiry() {
    const form = $(".inq-form"); if (!form) return;
    const errEl = $(".inq-err", form), btn = $(".inq-submit", form);
    const showErr = (msg, field) => { errEl.textContent = msg; errEl.hidden = false; if (field) { const f = form.elements[field]; if (f) f.focus(); } };
    const syncKind = () => {
      const k = form.elements.kind.value;
      $$('[data-for="reserve"]', form).forEach(el => { el.hidden = k !== "reserve"; });
      $(".msg-label", form).textContent = k === "reserve" ? "요청 사항" : "문의 내용 *";
      form.elements.message.placeholder = k === "reserve" ? "예: 답례품 포장 원해요, 알레르기가 있어요" : "궁금하신 내용을 적어 주세요";
    };
    $$('input[name="kind"]', form).forEach(r => r.addEventListener("change", syncKind));
    syncKind();
    bindPhone(form.elements.phone);
    form.addEventListener("submit", async e => {
      e.preventDefault();
      errEl.hidden = true;
      const f = form.elements, kind = f.kind.value;
      const body = {
        kind, itemId: form.dataset.item, itemName: form.dataset.name,
        name: f.name.value.trim(), phone: f.phone.value.trim(),
        date: kind === "reserve" ? f.date.value : "", time: kind === "reserve" ? f.time.value : "",
        people: kind === "reserve" && f.people.value !== "" ? Number(f.people.value) : null,
        message: f.message.value.trim(), agree: f.agree.checked, website: f.website.value
      };
      if (!body.name) return showErr("이름을 입력해 주세요.", "name");
      if (!/^0\d{8,10}$/.test(body.phone.replace(/\D/g, ""))) return showErr("연락처를 정확히 입력해 주세요. 예: 010-1234-5678", "phone");
      if (kind === "reserve" && !body.date) return showErr("희망 날짜를 골라 주세요.", "date");
      if (kind === "reserve" && body.date < kstToday()) return showErr("지난 날짜는 고를 수 없어요.", "date");
      if (kind === "inquiry" && !body.message) return showErr("문의 내용을 입력해 주세요.", "message");
      if (!body.agree) return showErr("개인정보 수집·이용에 동의해 주세요.", "agree");
      btn.disabled = true; btn.textContent = "보내는 중…";
      const headers = { "Content-Type": "application/json" };
      try { const tk = localStorage.getItem("hd_token"); if (tk) headers.Authorization = "Bearer " + tk; } catch { /* 무시 */ }
      try {
        const res = await fetch(apiBase() + "/api/inquiries", { method: "POST", headers, body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "보내지 못했어요. 잠시 후 다시 시도해 주세요.");
        const when = kind === "reserve" ? [body.date, body.time].filter(Boolean).join(" ") + (body.people ? ` · ${body.people}명/개` : "") : "";
        form.outerHTML = `<div class="inq-done" role="status"><b>${kind === "reserve" ? "예약 요청이" : "문의가"} 접수됐어요.</b>
          <p>${lines(["확인 후 남겨 주신 연락처로 연락드릴게요.", "급한 경우 전화 주시면 더 빨라요."])}</p>
          <dl><div><dt>메뉴</dt><dd>${esc(body.itemName)}</dd></div>${when ? `<div><dt>희망 일시</dt><dd>${esc(when)}</dd></div>` : ""}<div><dt>연락처</dt><dd>${esc(body.phone)}</dd></div></dl>
          <a class="btn" href="${telHref(SITE.store.tel)}">${UI.phone} ${esc(SITE.store.tel)}</a></div>`;
      } catch (err) {
        btn.disabled = false; btn.textContent = "보내기";
        showErr(err.message === "Failed to fetch" ? "서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요." : err.message);
      }
    });
  }

  /* ---------- 공통 블록: 매장 정보 ---------- */
  function mapCard() {
    return `<div class="map-card">${UI.pin}<b style="font-size:18px">${esc(SITE.store.address)}</b><span style="color:var(--sub)">${esc(SITE.store.directions)}</span>
      <div class="btns"><a class="btn primary" href="${esc(SITE.links.naverMap)}" target="_blank" rel="noopener">네이버 지도</a><a class="btn" href="${esc(SITE.links.kakaoMap)}" target="_blank" rel="noopener">카카오맵</a></div></div>`;
  }
  function infoList() {
    const st = SITE.store;
    return `<dl class="info">
      <div><dt>영업시간</dt><dd>${st.hours.map(h => `<b style="color:var(--ink)">${esc(h.day)} ${esc(h.time)}</b>`).join("<br>")}<br>${esc(st.hoursNote)}</dd></div>
      <div><dt>전화</dt><dd><a href="${telHref(st.tel)}">${esc(st.tel)}</a>${st.mobile ? ` · <a href="${telHref(st.mobile)}">${esc(st.mobile)}</a>` : ""}</dd></div>
      <div><dt>주소</dt><dd>${esc(st.address)}</dd></div>
      <div><dt>이용 안내</dt><dd><div class="chips">${st.badges.map(b => `<span class="chip good">${esc(b)}</span>`).join("")}${st.services.map(s => `<span class="chip">${esc(s)}</span>`).join("")}</div></dd></div>
    </dl>`;
  }

  /* ---------- 페이지: 매장 안내 · 소개 · 체험 ---------- */
  function pageStore() {
    return subTop("매장 안내", [{ name: "매장 안내" }]) + `<div class="wrap info-grid">${mapCard()}<div>${infoList()}
      <div class="cta" style="margin-top:28px;text-align:left;padding:24px"><p style="font-size:15px">${lines(["떡 택배 · 답례품 · 단체 주문은", "전화나 인스타그램 DM으로 문의해 주세요."])}</p>
      <div class="btns" style="justify-content:flex-start"><a class="btn primary" href="${telHref(SITE.store.tel)}">${UI.phone} 전화하기</a><a class="btn" href="${esc(SITE.links.instagram)}" target="_blank" rel="noopener">${UI.insta} 인스타그램</a></div></div>
    </div></div>`;
  }
  const step = (n, title, text) => `<div><b>${n} · ${title}</b><p>${lines(text)}</p></div>`;
  function pageAbout() {
    return subTop("혜화담 이야기", [{ name: "혜화담 이야기" }]) + `<div class="wrap"><article class="prose center">
      <p class="lead">${lines(["혜화담은", "'은혜로운 강화를 담다'라는 뜻입니다."])}</p>
      <p>${lines(["강화는 섬이라는 땅, 바다에서 불어오는 해풍, 큰 일교차 덕분에", "농산물이 맛있게 자라는 곳입니다.", "혜화담은 그 강화의 맛을 건강하게 즐길 수 있는 공간을 만들고 싶어 문을 열었습니다."])}</p>
      <h2>4대째 이어 온 쌀로 빚는 떡</h2>
      <p>${lines(["혜화담의 떡은 1926년부터 4대째 강화에서 농사짓고 쌀을 도정해 온", "집안의 강화섬쌀로 만듭니다.", "쌀을 키우는 일부터 떡을 빚어 손님께 내기까지 모두 직접 하기에,", "무엇이 들어갔는지 솔직하게 말씀드릴 수 있어요."])}</p>
      <div class="steps">${step("01", "쌀", ["가족이 강화에서 직접", "농사짓고 도정한 강화섬쌀"])}${step("02", "효소", ["소화를 돕는 효소를 넣어", "먹고 나서도 속 편하게"])}${step("03", "무첨가", ["첨가물과 방부제를", "넣지 않아요"])}</div>
      <h2>강화의 계절을 담은 빙수</h2>
      <p>${lines(["메론, 망고, 복숭아, 수박, 무화과처럼", "싱싱한 생과일을 듬뿍 올린 빙수를 만듭니다.", "매장에서 드셔도 좋고, 포장도 가능합니다."])}</p>
      <h2>지역과 함께 자라는 가게</h2>
      <p>${lines(["강화의 역사 이야기와 함께하는 떡 체험 클래스로", "지역 아이들과 여행객을 만나고,", "강화의 청년 농부들과 함께 새로운 메뉴를 준비하고 있습니다.", "혜화담은 '농업과 일상, 사람'이 이어지는", "강화의 로컬 브랜드가 되고자 합니다."])}</p>
      <div class="cta"><p>혜화담의 대표 메뉴를 만나 보세요</p><div class="btns"><a class="btn primary" href="menu.html">메뉴 보기</a><a class="btn" href="${esc(SITE.links.rice)}" target="_blank" rel="noopener">쌀 브랜드 근자필성</a></div></div>
    </article></div>`;
  }
  function pageClass() {
    const item = byId("o01") || {};
    return subTop("떡체험", [{ name: "떡체험" }]) + `<div class="wrap"><article class="prose">
      <p class="lead">${lines(["강화 역사 이야기를 들으며", "강화섬쌀로 떡을 빚어 보세요."])}</p>
      <p>${lines(["혜화담의 떡체험은 강화의 역사 이야기와 함께하는 체험 클래스입니다.", "지역 아이들, 가족 여행객, 학교·기관 단체 모두 환영해요."])}</p>
      <div class="steps">${step("01", "이야기", ["강화의 역사와", "강화섬쌀 이야기를 들어요"])}${step("02", "빚기", ["강화섬쌀 떡 반죽으로", "직접 떡을 빚어요"])}${step("03", "맛보기", ["내가 만든 떡을", "맛보고 즐겨요"])}</div>
      <h2>체험 안내</h2>
      <dl class="info">
        <div><dt>대상</dt><dd>어린이 · 가족 · 관광객 · 단체 (단체 환영)</dd></div>
        <div><dt>비용</dt><dd>${priceText(item.price)} — 인원과 구성에 따라 달라요</dd></div>
        <div><dt>예약</dt><dd>${apiBase() ? `<a href="#inquiry">아래 달력에서 온라인 예약</a>, ` : ""}전화 <a href="${telHref(SITE.store.tel)}">${esc(SITE.store.tel)}</a> 또는 인스타그램 DM</dd></div>
        <div><dt>장소</dt><dd>${esc(SITE.store.address)}</dd></div>
      </dl>
      ${bookingBox({ id: item.id || "o01", name: item.name || "떡체험" })}
      <div class="cta"><p>${lines(["원하시는 날짜와 인원을 알려 주시면", "일정을 안내해 드려요"])}</p><div class="btns"><a class="btn primary" href="${telHref(SITE.store.tel)}">${UI.phone} 전화 예약</a><a class="btn" href="${esc(SITE.links.instagram)}" target="_blank" rel="noopener">${UI.insta} 인스타그램 DM</a></div></div>
    </article></div>`;
  }

  /* ---------- 페이지: 개인정보처리방침 ---------- */
  function pagePrivacy() {
    const co = SITE.company, st = SITE.store, p = SITE.privacy || {};
    return subTop("개인정보처리방침", [{ name: "개인정보처리방침" }]) + `<div class="wrap"><article class="prose legal">
      <p>${esc(co.corpName)}(이하 '혜화담')은 「개인정보 보호법」에 따라 회원의 개인정보를 보호하고, 관련 고충을 신속하게 처리하기 위해 다음과 같이 개인정보처리방침을 둡니다.</p>
      <h2>1. 수집하는 개인정보와 수집 방법</h2>
      <ul><li>카카오 또는 네이버 로그인 시: 회원번호(카카오·네이버가 발급한 고유 식별값), 닉네임</li>
        <li>예약·문의 폼 작성 시: 이름, 연락처, 희망 날짜·시간, 인원·수량, 요청 내용</li>
        <li>서비스 이용 과정에서 자동 생성: 가입·로그인 일시, 예약·문의 접수 일시, 스팸 방지를 위한 접속 정보의 암호화 값</li>
        <li>혜화담은 이메일, 비밀번호를 받지 않습니다.</li></ul>
      <h2>2. 이용 목적</h2>
      <ul><li>회원 식별과 로그인 유지</li><li>회원 관리(가입·탈퇴 처리)</li><li>예약·문의 확인 및 연락(예약 접수·확정·취소 카카오 알림톡 발송 포함)</li></ul>
      <h2>3. 보유 및 이용 기간</h2>
      <ul><li>회원 정보: 회원 탈퇴 시까지 보관하며, 탈퇴하면 지체 없이 삭제합니다. 탈퇴는 [내 정보] 화면의 '회원 탈퇴'에서 언제든 할 수 있습니다.</li>
        <li>예약·문의 정보: 처리(완료·취소)한 날로부터 1년이 지나면 자동으로 삭제합니다. 그 전에 삭제를 원하시면 전화로 요청해 주세요.</li></ul>
      <h2>4. 제3자 제공</h2>
      <p>혜화담은 회원의 개인정보를 제3자에게 제공하지 않습니다.</p>
      <h2>5. 처리 위탁 및 국외 이전</h2>
      <p>예약 안내 알림톡 발송을 위해 아래와 같이 업무를 위탁합니다.</p>
      <ul><li>수탁자: 솔라피(SOLAPI), 주식회사 카카오</li><li>위탁 업무: 예약 접수·확정·취소 카카오 알림톡 및 문자 발송</li><li>제공 항목: 이름, 연락처, 예약 메뉴·일시·인원</li></ul>
      <p>회원 정보와 예약·문의 정보는 아래와 같이 국외에 저장됩니다.</p>
      <ul><li>수탁자: Cloudflare, Inc. (미국)</li><li>위탁 업무: 회원 정보 저장 및 로그인 서버 운영</li>
        <li>이전 항목: 회원번호, 닉네임, 가입·로그인 일시, 예약·문의 내용(이름, 연락처, 희망 일시, 인원, 요청 내용)</li><li>이전 시기·방법: 로그인·예약·문의 시 네트워크를 통해 전송</li><li>보유 기간: 3번의 보유 기간과 같음</li></ul>
      <h2>6. 회원의 권리</h2>
      <p>회원은 언제든지 자신의 개인정보를 조회하거나 삭제(탈퇴)를 요청할 수 있습니다. 카카오·네이버와의 연결 해제는 각 서비스의 계정 설정에서 할 수 있습니다.</p>
      <h2>7. 안전성 확보 조치</h2>
      <p>개인정보는 접근이 통제된 서버에 저장하며, 모든 통신은 암호화(https)합니다. 관리자 화면은 지정된 관리자만 이용할 수 있습니다.</p>
      <h2>8. 개인정보 보호책임자</h2>
      <ul><li>성명: ${esc(p.officer || co.ceo)} (대표)</li><li>연락처: ${esc(st.tel)}</li></ul>
      <p>개인정보 침해 신고·상담: 개인정보침해신고센터(국번 없이 118), 개인정보분쟁조정위원회(1833-6972)</p>
      <h2>9. 시행일</h2>
      <p>이 방침은 ${esc(p.effective || "2026년 11월 25일")}부터 적용됩니다.</p>
    </article></div>`;
  }

  /* ---------- 시작 ---------- */
  async function getJSON(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${path} (${res.status})`);
    try { return await res.json(); } catch (e) { throw new Error(`${path} — JSON 형식 오류: ${e.message}`); }
  }
  async function boot() {
    const view = $("#view");
    try {
      [SITE, MENU, HOME] = await Promise.all([getJSON("data/site.json"), getJSON("data/menu.json"), getJSON("data/home.json")]);
    } catch (err) {
      console.error("[혜화담] 사이트 데이터 로딩 실패", err);
      view.innerHTML = `<p class="empty">페이지를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>`;
      return;
    }
    const pages = { home: pageHome, menu: pageMenu, item: pageItem, store: pageStore, about: pageAbout, class: pageClass, privacy: pagePrivacy };
    /* 회원 화면(login · mypage · admin)은 member.js 가 등록 */
    const ext = (window.HD_PAGES || {})[PAGE];
    const ctx = { SITE, MENU, API: apiBase(), $, $$, esc, lines, subTop, UI, ICON, priceText, catOf };
    view.innerHTML = ext ? ext.render(ctx) : (pages[PAGE] || pageHome)();
    view.insertAdjacentHTML("beforebegin", header());
    document.body.insertAdjacentHTML("beforeend", footer());
    bindChrome();
    if (PAGE === "home") bindSlider();
    if (PAGE === "menu") bindMenu();
    if (PAGE === "item") bindInquiry();
    if (PAGE === "class") bindBooking();
    if (ext && ext.bind) ext.bind(ctx);
  }
  boot();
})();
