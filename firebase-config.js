// ⚠️ Firebase 콘솔(console.firebase.google.com)에서 프로젝트를 만든 후,
// "프로젝트 설정 > 일반 > 내 앱"에서 나오는 값으로 아래를 전부 교체하세요.
const firebaseConfig = {
    apiKey: "AIzaSyCEPE6J7vqmJddKU5L4-UQYyx1QdqyPb04",
    authDomain: "our-family-ec547.firebaseapp.com",
    projectId: "our-family-ec547",
    storageBucket: "our-family-ec547.firebasestorage.app",
    messagingSenderId: "179430150587",
    appId: "1:179430150587:web:c25685da6cfd9dbfa8749e"
};

// 가족 초대 코드 (회원가입 시 이 코드를 아는 사람만 가입할 수 있어요. 원하는 값으로 바꾸세요.)
const FAMILY_INVITE_CODE = "우리가족2026";

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ✨ Storage(사진 저장)는 Blaze 요금제 결제 전까지는 비활성 상태로 둡니다.
// 나중에 결제하시면 이 줄을 "const storage = firebase.storage();"로 바꿔주세요.
let storage = null;
try {
    storage = firebase.storage();
} catch (e) {
    storage = null;
}
