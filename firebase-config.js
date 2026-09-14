// Firebase 웹 앱 설정 (Console에서 복사한 값)
window.FAMILY_HUB_FIREBASE = {
  apiKey: "AIzaSyD5Noxuk8PxADT1r04_gx9-okqCSqhaVO8",
  authDomain: "vfamily-hub.firebaseapp.com",
  projectId: "vfamily-hub",
  storageBucket: "vfamily-hub.firebasestorage.app",
  messagingSenderId: "250438122381",
  appId: "1:250438122381:web:78b4fdf786474ba4575bc4",
  measurementId: "G-07ZVHTF5RE",
};

// 날씨 (기상청 단기예보). serviceKey는 공공데이터포털에서 발급해 넣으세요.
// https://www.data.go.kr/data/15084084/openapi.do
window.FAMILY_HUB_WEATHER = {
  serviceKey: "", // 예: Decoding 인증키
  regionId: "seoul",
};

// 가족 데이터 문서 경로 (같은 값을 쓰는 기기끼리 데이터를 공유합니다)
window.FAMILY_HUB_DOC = "families/yu-family";
