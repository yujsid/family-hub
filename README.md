# 우리 가족 허브 - 배포 & Firebase 설정

## 1) 접속 주소 (Domain)

### A. GitHub Pages (무료 공개 URL)
저장소를 공개한 뒤 Pages가 켜지면 아래 주소로 접속합니다.

- **기본 주소:** https://yujsid.github.io/family-hub/

GitHub에서 확인/설정:
1. https://github.com/yujsid/family-hub/settings/pages
2. **Source** → `Deploy from a branch`
3. Branch: `main` / Folder: `/ (root)` → Save

직접 산 도메인(예: `family.example.com`)을 쓰려면:
1. 위 Pages 설정 화면의 **Custom domain** 칸에 `family.example.com` 입력
2. 도메인 DNS에 GitHub이 안내하는 `A` 또는 `CNAME` 레코드 추가

### B. Firebase Hosting (권장, 데이터와 같은 프로젝트)
1. https://console.firebase.google.com/ 에서 프로젝트 생성
2. Hosting 사용 설정 후 배포하면 기본 주소:
   - `https://YOUR_PROJECT_ID.web.app`
   - `https://YOUR_PROJECT_ID.firebaseapp.com`
3. 커스텀 도메인은 Firebase Hosting → **맞춤 도메인 추가**에 입력

## 2) Firebase (localStorage 대신 공유 저장)

1. Firebase 콘솔에서 웹 앱을 추가하고 설정 값을 복사
2. `firebase-config.js`에 붙여 넣기
3. Firestore Database 생성 (프로덕션 모드 후 아래 규칙 적용 가능)
4. `firestore.rules` 내용을 Firestore 규칙에 붙여 넣기
5. 사이트를 새로고침하면 가족 기기끼리 일정이 실시간으로 맞춰집니다

## 3) Android에서 앱처럼 설치 (PWA)

1. 폰 Chrome으로 https://yujsid.github.io/family-hub/ 접속
2. 메뉴(⋮) → **홈 화면에 추가** 또는 **앱 설치**
3. 홈 화면 아이콘으로 실행하면 일반 앱처럼 전체 화면으로 열립니다

## 로컬에서 열기
`index.html`을 더블클릭하거나 로컬 서버로 열면 됩니다. Firebase 설정이 있어야 데이터가 클라우드에 저장됩니다.
PWA 설치는 HTTPS 주소(GitHub Pages)에서만 가능합니다.
