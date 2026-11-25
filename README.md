# 혜화담 홈페이지

GitHub Pages로 무료 호스팅하는 정적 홈페이지입니다. (프롬강화 쇼핑몰과 같은 방식)
**메뉴·가격·영업시간·문구는 `data/` 폴더의 JSON 파일에 있어서, 코드를 몰라도 JSON만 수정하면 사이트가 바뀝니다.**

## 폴더 구조

```
index.html        메인 (배너 · 대표 메뉴 · 혜화담 약속 · 이야기 · 빙수 · 단체주문 · 매장 안내)
menu.html         메뉴 목록 (스타벅스식 분류 탭 · 검색 · HOT/ICED 필터)
menu-item.html    메뉴 상세 (menu-item.html?id=t01 처럼 id 로 구분)
about.html        혜화담 이야기
class.html        떡체험 안내
store.html        매장 안내 (주소 · 지도 · 영업시간 · 전화)
login.html        카카오 · 네이버 로그인
mypage.html       내 정보 (로그아웃 · 회원 탈퇴)
admin.html        관리자 (메뉴 · 사진 · 설명 수정, 회원 목록)
privacy.html      개인정보처리방침
404.html          없는 주소 접속 시 표시
data/
  site.json       상호, 주소, 전화, 영업시간, 링크(인스타·스마트스토어·지도), 메뉴 분류
  home.json       메인 배너(슬라이드), 대표 메뉴 묶음, 이야기 문구, 단체주문 묶음
  menu.json       메뉴 전체 (이름, 가격, 분류, 설명, 사진)
assets/
  css/style.css   디자인 (맨 위 :root 에서 색상·폰트 변경)
  js/main.js      화면 구성 로직 (보통 수정할 필요 없음)
  js/member.js    로그인 · 내 정보 · 관리자 화면
worker/
  index.js        로그인·관리자 서버 (Cloudflare Worker 에 붙여 넣는 파일)
로그인_관리자_설정안내.md   로그인·관리자 기능 켜는 방법
알림톡_설정안내.md          카카오 알림톡(솔라피) 연결 방법 · 템플릿 문구
텔레그램_설정안내.md        텔레그램으로 새 예약 알림 받기 (무료 · 알림음)
  images/         사진 파일 (favicon.svg = 브라우저 탭 아이콘)
기획서_강화프롬프트.md   이 홈페이지의 기획서
```

## 1. GitHub에 올리기 (최초 1회)

1. GitHub에서 새 저장소(Repository) 생성 — 예: `hyehwadam` (Public)
2. **Add file → Upload files** 로 이 폴더 안의 파일/폴더를 전부 끌어다 놓고 **Commit changes**
   - `.nojekyll` 파일도 같이 올라가야 합니다 (숨김 파일이라 안 보이면 탐색기에서 '숨긴 항목 표시')
   - `기획서_강화프롬프트.md` 는 올리지 않아도 됩니다
3. 저장소 **Settings → Pages** → Source: `Deploy from a branch`, Branch: `main` / `/ (root)` → Save
4. 1~2분 후 `https://아이디.github.io/hyehwadam/` 에서 확인
5. 주소가 정해지면 `sitemap.xml` 의 `DOMAIN` 과 `robots.txt` 의 Sitemap 줄을 실제 주소로 바꿔 주세요

> 내 컴퓨터에서 index.html 을 더블클릭하면 메뉴가 안 뜹니다 (브라우저 보안상 JSON을 못 읽음). GitHub Pages 주소로 확인하세요.

## 2. 메뉴 추가 · 가격 변경

GitHub 웹에서 `data/menu.json` 을 열고 ✏️(연필) → 수정 → **Commit changes** 하면 1~2분 뒤 반영됩니다.

```json
{ "id": "b12", "cat": "bingsu", "name": "샤인머스캣빙수", "price": 19000, "flag": "NEW",
  "icon": "bingsu", "tile": "#e4f0dc", "image": "assets/images/shine.jpg",
  "desc": "한 줄 설명", "point": ["특징1", "특징2"] }
```

| 항목 | 설명 |
|---|---|
| `id` | 겹치지 않게 (떡 t, 빙수 b, 커피 c, 에이드 a, 전통차 e, 단체 o + 번호) |
| `cat` | 분류 — `tteok` 떡 / `bingsu` 빙수 / `coffee` 커피·라떼 / `ade` 에이드·주스·스무디 / `tea` 전통차 / `order` 단체·특별주문 |
| `price` | 숫자 = `19,000원` 표시 · `null` = '매장 문의' · `"ask"` = '가격 변동 · 문의' |
| `flag` | 사진 위 배지 (`대표`, `NEW`, `시즌` 등). 없으면 줄 삭제 |
| `temp` | 음료 온도 `["hot", "iced"]` — 메뉴 화면 HOT/ICED 필터에 쓰입니다 |
| `soldout` | `true` 면 흑백 + '품절' 배지 |
| `image` | 사진 경로. 없으면 `icon` 그림 + `tile` 배경색으로 표시 |
| `icon` | 사진 없을 때 그림 — tteok, garae, strawberry, cup, bingsu, coffee, latte, glass, tea, hands, gift, box, sandwich, rice |
| `desc` · `point` | 상세 화면의 설명 문단 · 특징 목록 (없어도 됨) |

> **현재 '매장 문의'로 표시되는 메뉴**: 무설탕 현미 통팥 앙금떡, 초코바나나 오레오빙수, 헤이즐넛 아메리카노·카페라떼, 카라멜마키아또, 녹차라떼, 망고에이드, 메론·바나나주스, 스무디 4종
> 매장 메뉴판에는 있지만 네이버에 가격이 없던 메뉴입니다. 가격을 숫자로 넣어 주세요.

> JSON 주의: 항목 사이 쉼표(,)를 빠뜨리거나 마지막 항목 뒤에 쉼표를 붙이면 페이지가 안 뜹니다.
> 수정 후 '페이지를 불러오지 못했어요'가 나오면 https://jsonlint.com 에 붙여넣어 오류를 확인하세요.
> 브라우저 F12 → Console 탭에 `[혜화담] 사이트 데이터 로딩 실패` 와 어느 파일인지 표시됩니다.

## 3. 사진 넣기 (추천)

지금은 사진 대신 그림으로 표시됩니다. 실제 사진을 넣으면 훨씬 좋아집니다.

1. 정사각형으로 자른 사진(가로세로 800px 정도, jpg)을 `assets/images/` 에 올립니다 — 파일 이름은 영어로 (예: `melon-bingsu.jpg`)
2. `data/menu.json` 해당 메뉴에 `"image": "assets/images/melon-bingsu.jpg",` 를 추가합니다
3. 메인 배너는 `data/home.json` 의 `slides` → `"image"` 에 같은 방식으로 넣습니다

## 4. 영업시간 · 주소 · 링크

`data/site.json` 의 `store`, `links` 를 수정하세요.
메인 하단·매장 안내·푸터에 자동으로 함께 바뀝니다.
**사업자등록번호**가 아직 `(입력 필요)` 입니다.

> 각 HTML 안의 `seo-fb` 부분(검색 로봇·카카오톡 미리보기용 글)에도 가격·영업시간이 적혀 있으니, 크게 바뀌면 같이 고쳐 주세요.

## 5. 색상 · 폰트

`assets/css/style.css` 맨 위 `:root` 에서 바꿉니다.
- `--brand` 혜화담 초록 · `--brand-deep` 진한 초록(제목·띠) · `--cream` 크림 배경 · `--accent` 노랑
- 제목 폰트 `Gowun Batang`(명조), 본문 `Noto Sans KR`

## 6. 로그인 · 관리자 기능

카카오·네이버 로그인, 회원 목록, **관리자 화면에서 메뉴·사진·설명 직접 수정** 기능이 들어 있습니다.
켜는 방법은 **[로그인_관리자_설정안내.md](로그인_관리자_설정안내.md)** 를 따라 하세요.

- 설정 전에는 `login.html` 에 '준비 중' 안내만 보이고 상단 로그인 아이콘은 숨겨져 있습니다.
- 관리자 화면에서 저장하면 서버가 이 저장소의 `data/menu.json` 과 `assets/images/uploads/` 에 저장합니다. 1~2분 뒤 반영됩니다.
- 비밀 열쇠(토큰·Secret)는 Cloudflare 설정에만 넣고, 이 저장소에는 절대 넣지 마세요.
