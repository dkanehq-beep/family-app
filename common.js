// ✨ 로그인 안 되어 있으면 로그인 페이지로 돌려보내기
auth.onAuthStateChanged(function(user) {
    if (!user) {
        window.location.href = "index.html";
        return;
    }
    const greetEl = document.getElementById("home-greeting");
    if (greetEl) {
        greetEl.textContent = buildGreeting(user.displayName || "가족");
    }
});

// ✨ 시간대별로 달라지는 인사말 (매번 조금씩 다르게)
function buildGreeting(name) {
    const hour = new Date().getHours();
    let pool;
    if (hour < 6) {
        pool = ["아직 깨어 계셨네요, 너무 무리하진 마세요", "고요한 새벽이에요"];
    } else if (hour < 11) {
        pool = ["좋은 아침이에요, 오늘도 반가워요", "상쾌한 아침, 잘 시작해봐요", "오늘 하루도 좋은 일만 가득하길"];
    } else if (hour < 14) {
        pool = ["점심은 맛있게 드셨나요?", "오늘 하루도 절반 왔어요", "따뜻한 한 끼 챙기셨길 바라요"];
    } else if (hour < 18) {
        pool = ["나른한 오후, 잠깐 쉬어가도 좋아요", "오늘도 애쓰고 계시네요", "남은 오후도 힘내봐요"];
    } else if (hour < 22) {
        pool = ["오늘 하루도 고생 많으셨어요", "저녁 시간, 가족과 함께 보내세요", "편안한 저녁 되시길 바라요"];
    } else {
        pool = ["오늘 하루도 수고 많으셨어요", "포근한 밤 되세요", "내일은 또 어떤 이야기가 기다릴까요"];
    }
    const line = pool[Math.floor(Math.random() * pool.length)];
    return `${name}님, ${line}`;
}

// ✨ 현재 로그인한 사람 이름 (없으면 "가족"으로 표시)
function currentUserName() {
    return (auth.currentUser && auth.currentUser.displayName) ? auth.currentUser.displayName : "가족";
}

// ✨ 이 항목을 내가 만들었는지 (본인 것만 삭제 가능하게 하는 용도)
function isOwner(item) {
    return !!(item && auth.currentUser && item.ownerUid === auth.currentUser.uid);
}

// ✨ 마일리지 적립/차감 (현재 로그인한 계정 기준)
// amount: 양수면 적립, 음수면 차감 / reason: 내역에 표시될 문구
function awardMileage(amount, reason) {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const name = currentUserName();
    const mileageRef = db.collection("mileage").doc(uid);

    db.runTransaction(function(tx) {
        return tx.get(mileageRef).then(function(doc) {
            const current = doc.exists ? (doc.data().total || 0) : 0;
            const next = Math.max(0, current + amount);
            tx.set(mileageRef, { name: name, total: next }, { merge: true });
        });
    }).then(function() {
        return db.collection("mileage_log").add({
            uid: uid,
            name: name,
            amount: amount,
            reason: reason,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }).catch(function(err) {
        console.error("마일리지 적립 실패:", err.message);
    });
}

// ✨ 다크 모드 토글 (로컬 저장)
const MOON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/></svg>';
const SUN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"/></svg>';

function initThemeToggle() {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
        document.body.classList.add("dark-mode");
        btn.innerHTML = SUN_ICON;
    } else {
        btn.innerHTML = MOON_ICON;
    }
    btn.addEventListener("click", function() {
        document.body.classList.toggle("dark-mode");
        const isDark = document.body.classList.contains("dark-mode");
        localStorage.setItem("theme", isDark ? "dark" : "light");
        btn.innerHTML = isDark ? SUN_ICON : MOON_ICON;
    });
}
initThemeToggle();

// ✨ 로그아웃
function initLogoutButton() {
    const btn = document.getElementById("logout-btn");
    if (btn) {
        btn.addEventListener("click", function() {
            auth.signOut().then(function() {
                window.location.href = "index.html";
            });
        });
    }
}
initLogoutButton();

// ✨ 토스트 알림
function showToast(message) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function() {
        toast.classList.add("hide");
        setTimeout(function() { toast.remove(); }, 300);
    }, 2600);
}

// ✨ 날짜 포맷 (YYYY-MM-DD -> M월 D일)
function formatDateShort(dateStr) {
    const parts = dateStr.split("-");
    return `${Number(parts[1])}월 ${Number(parts[2])}일`;
}

// ✨ 직접 타이핑 + 네이티브 선택기(달력/시계) 둘 다 되는 하이브리드 입력
// textId: 눈에 보이는 텍스트 입력창 / nativeId: 숨겨진 type=date,time 입력창 / btnSelector: 선택 버튼
function bindHybridPicker(textId, nativeId, btnSelector) {
    const textInput = document.getElementById(textId);
    const nativeInput = document.getElementById(nativeId);
    const btn = document.querySelector(btnSelector);
    if (!textInput || !nativeInput) return;

    if (btn) {
        btn.addEventListener("click", function() {
            if (nativeInput.showPicker) {
                try { nativeInput.showPicker(); } catch (e) { nativeInput.focus(); }
            } else {
                nativeInput.focus();
            }
        });
    }

    nativeInput.addEventListener("change", function() {
        textInput.value = nativeInput.value;
    });
}
