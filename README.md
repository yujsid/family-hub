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

이 방법으로 설치한 화면에는 오늘 일정 위젯이 없습니다. 위젯은 아래 APK를 설치한 뒤에 홈 화면에서 추가합니다.

## 4) Android APK 설치 파일

GitHub Actions가 APK를 자동 빌드합니다.

- 릴리스 목록: https://github.com/yujsid/family-hub/releases
- 파일 이름: `app-debug.apk`
- 설치: 폰으로 받아 실행 → **알 수 없는 앱 설치** 허용 후 설치

로컬에서 빌드하려면 Android Studio / SDK가 필요합니다.

APK를 설치한 뒤 홈 화면을 길게 눌러 **위젯 → 가족허브 → 오늘 일정**을 추가합니다. 수아를 고르면 수아의 오늘 일정과 할일만, 수민을 고르면 수민의 것만 보입니다. 위젯을 누르면 가족허브 앱이 열립니다. 목록은 읽기 전용이고, 앱을 한 번 연 뒤에 채워집니다.

```bash
npm install
npm run build:apk
```

## 5) 구글 캘린더 「가족」과 동기화

설정 → 구글 캘린더에서 일정만 구글 캘린더의 「가족」 캘린더와 맞출 수 있습니다. 구글 일정 제목 앞에는 (수아), (수민)처럼 누구 일정인지 붙습니다. 구글에 (수아) 축구처럼 적힌 일정은 허브에서 수아의 축구 일정으로 들어옵니다. 할 일과 용돈 도장은 올리지 않습니다.

1. [Google Cloud 사용자 인증 정보](https://console.cloud.google.com/apis/credentials)에서 OAuth 클라이언트 ID(웹 애플리케이션)를 만듭니다.
2. 승인된 자바스크립트 원본에 `https://yujsid.github.io` 를 넣습니다.
3. [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)를 사용 설정합니다.
4. 동의 화면이 테스트 중이면 본인 구글 계정을 테스트 사용자로 추가합니다.
5. 발급된 클라이언트 ID를 가족 허브 설정의 「구글 연결 설정」에 저장하고 **가족 캘린더 연결**을 누릅니다.

이름이 「가족」인, 수정 권한이 있는 캘린더를 찾아 일정·할 일을 올리고, 그 캘린더에만 있는 일정은 허브로 가져옵니다. 로그인은 약 1시간 유지되며, 만료되면 「다시 연결하고 동기화」를 누르면 됩니다.

## 로컬에서 열기
`index.html`을 더블클릭하거나 로컬 서버로 열면 됩니다. Firebase 설정이 있어야 데이터가 클라우드에 저장됩니다.
PWA 설치는 HTTPS 주소(GitHub Pages)에서만 가능합니다.
