// ✨ 로그인 안 되어 있으면 로그인 페이지로 돌려보내기
// + 로그인 확인이 끝나기 "전"에 데이터 요청이 나가면 보안 규칙에 막혀 화면이
//   빈 채로 남는 문제가 있어서, 데이터 구독은 반드시 whenAuthReady() 안에서 시작
let _authUser = null;                // 로그인 확인이 끝나면 사용자 정보가 여기 담김
const _authReadyCallbacks = [];      // 로그인 확인을 기다리는 작업 대기줄

function whenAuthReady(cb) {
    if (_authUser) { cb(_authUser); return; }  // 이미 확인 끝났으면 바로 실행
    _authReadyCallbacks.push(cb);              // 아니면 대기줄에 등록
}

// 로그인한 본인을 profiles에 기록/갱신 - 마일리지 랭킹에서 "가입한 가족 전체 명단"으로 재사용
function syncMyProfile(user) {
    db.collection("profiles").doc(user.uid).set({ name: user.displayName || "가족" }, { merge: true });
}

auth.onAuthStateChanged(function(user) {
    if (!user) {
        window.location.href = "index.html";
        return;
    }
    // 가입할 때 이름을 못 받았거나 어떤 이유로 비어있으면, 마일리지 등 여기저기에
    // "가족"이라고만 뜨는 대신 지금 한 번 물어봐서 계정에 저장해둔다
    if (!user.displayName) {
        const name = window.prompt("이름을 등록해 주세요 (마일리지 등에 표시돼요)", "");
        if (name && name.trim()) {
            user.updateProfile({ displayName: name.trim() }).then(function() { syncMyProfile(user); });
        } else {
            syncMyProfile(user);
        }
    } else {
        syncMyProfile(user);
    }
    // 대기 중이던 작업(각 페이지의 데이터 구독)을 이제 실행
    if (!_authUser) {
        _authUser = user;
        _authReadyCallbacks.splice(0).forEach(function(cb) { cb(user); });
    }
});

// ✨ 현재 로그인한 사람 이름 (없으면 "가족"으로 표시)
function currentUserName() {
    return (auth.currentUser && auth.currentUser.displayName) ? auth.currentUser.displayName : "가족";
}

// ✨ 이 항목을 내가 만들었는지 (본인 것만 삭제 가능하게 하는 용도)
function isOwner(item) {
    return !!(item && auth.currentUser && item.ownerUid === auth.currentUser.uid);
}

// ✨ 프로필 이모지 아바타 + 가족 명단 (모든 페이지에서 공통으로 구독)
// 이름 옆에 아바타를 붙이고 싶은 곳에서는 avatarPrefix(uid)를 이름 앞에 붙이면 됨
// 가족 중 한 명을 골라야 하는 화면(편지함 등)에서는 familyRoster()를 쓰면 됨
let _profileAvatars = {};  // { uid: "🦊" } 형태
let _familyRoster = [];    // [{ id, name }] 가입한 가족 전체 명단
const AVATAR_CHOICES = ["🦊", "🐻", "🐰", "🐱", "🐶", "🐼", "🦁", "🐯", "🐨", "🐷", "🐮", "🐸", "🦄", "🐙", "🌟", "🌈"];

function avatarPrefix(uid) {
    const emoji = uid && _profileAvatars[uid];
    return emoji ? emoji + " " : "";
}

// 나를 뺀 가족 명단이 필요하면 familyRoster(true)로 호출
function familyRoster(excludeMe) {
    const myUid = auth.currentUser && auth.currentUser.uid;
    return _familyRoster.filter(function(p) { return !excludeMe || p.id !== myUid; });
}

whenAuthReady(function() {
    db.collection("profiles").onSnapshot(function(snapshot) {
        const nextAvatars = {};
        const nextRoster = [];
        snapshot.docs.forEach(function(doc) {
            const data = doc.data();
            nextAvatars[doc.id] = (data.avatar || "");
            nextRoster.push({ id: doc.id, name: data.name || "가족" });
        });
        _profileAvatars = nextAvatars;
        _familyRoster = nextRoster;
        // 아바타/명단이 바뀌면 화면에 다시 그려야 하는 페이지들이 각자 반영할 수 있도록 신호를 보냄
        document.dispatchEvent(new CustomEvent("avatars-updated"));
    });
});

// ✨ 내 정보 모달 (이메일 확인 / 이름 변경 / 아바타 선택) - 모든 페이지 상단바에서 열 수 있음
function initAccountModal() {
    const btn = document.getElementById("account-btn");
    const modal = document.getElementById("account-modal");
    if (!btn || !modal) return;

    btn.addEventListener("click", function() {
        const user = auth.currentUser;
        if (!user) return;
        document.getElementById("account-email").textContent = user.email || "";
        document.getElementById("account-name-input").value = user.displayName || "";

        const grid = document.getElementById("account-avatar-grid");
        const current = _profileAvatars[user.uid] || "";
        grid.innerHTML = AVATAR_CHOICES.map(function(emoji) {
            return `<button type="button" class="avatar-choice-btn${emoji === current ? " selected" : ""}" data-emoji="${emoji}">${emoji}</button>`;
        }).join("");
        grid.querySelectorAll(".avatar-choice-btn").forEach(function(choiceBtn) {
            choiceBtn.addEventListener("click", function() {
                db.collection("profiles").doc(user.uid).set({ avatar: choiceBtn.dataset.emoji }, { merge: true })
                    .then(function() { showToast("아바타를 바꿨어요"); });
            });
        });

        modal.classList.add("open");
    });

    document.getElementById("account-modal-close").addEventListener("click", function() { modal.classList.remove("open"); });
    modal.addEventListener("click", function(e) { if (e.target === modal) modal.classList.remove("open"); });

    document.getElementById("account-name-form").addEventListener("submit", function(e) {
        e.preventDefault();
        const name = document.getElementById("account-name-input").value.trim();
        if (!name) return;
        auth.currentUser.updateProfile({ displayName: name })
            .then(function() {
                syncMyProfile(auth.currentUser);
                showToast("이름을 저장했어요");
            })
            .catch(function(err) {
                showToast("저장에 실패했어요: " + err.message);
            });
    });
}
initAccountModal();

// ✨ 오늘 날짜 (YYYY-MM-DD) - 하루 한 번 제한 체크용
function todayKeyForMileage() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ✨ 마일리지 적립/차감 (현재 로그인한 계정 기준)
// amount: 양수면 적립, 음수면 차감 / reason: 내역에 표시될 문구
// type: 넘겨주면 "오늘 이 종류로는 이미 적립받았는지"를 확인해서, 하루에 한 번만 적립되게 함
//       (게시글/댓글처럼 여러 번 반복해도 매번 적립되면 안 되는 활동에 사용.
//        숙제 체크처럼 실제 항목 수만큼 정직하게 쌓여야 하면 type을 안 넘기면 됨)
function awardMileage(amount, reason, type) {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const name = currentUserName();
    const mileageRef = db.collection("mileage").doc(uid);
    const todayKey = todayKeyForMileage();

    function doAward() {
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
                type: type || null,
                dateKey: todayKey,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }).catch(function(err) {
            console.error("마일리지 적립 실패:", err.message);
        });
    }

    if (!type) { doAward(); return; }

    db.collection("mileage_log")
        .where("uid", "==", uid)
        .where("type", "==", type)
        .where("dateKey", "==", todayKey)
        .limit(1)
        .get()
        .then(function(snapshot) {
            if (snapshot.empty) doAward();  // 오늘 이미 이 종류로 적립받았으면 조용히 건너뜀
        })
        .catch(function(err) {
            console.error("마일리지 중복 확인 실패:", err.message);
        });
}

// ✨ 오늘의 질문에 새 답변이 올라오면, 지금 어느 페이지에 있든 토스트로 알려줌
// (푸시 알림이 아니라 앱을 켜놓고 있을 때만 실시간으로 뜨는 방식)
whenAuthReady(function() {
    const todayKey = todayKeyForMileage();
    let firstLoad = true;
    db.collection("checkins").where("dateKey", "==", todayKey).onSnapshot(function(snapshot) {
        snapshot.docChanges().forEach(function(change) {
            if (firstLoad || change.type !== "added") return;  // 처음 불러올 때 이미 있던 답변은 알리지 않음
            const data = change.doc.data();
            if (data.ownerUid === auth.currentUser.uid) return;  // 본인 답변은 알리지 않음
            showToast(`${avatarPrefix(data.ownerUid)}${data.name}님이 오늘의 질문에 답했어요 💬`);
        });
        firstLoad = false;
    });
});

// ✨ 안 읽은 공지 배지 (탭바/상단 메뉴의 "홈"에 빨간 점)
// 마지막으로 홈 화면을 본 시각(기기에 저장)보다 최신 공지가 있으면 배지를 켬
whenAuthReady(function() {
    db.collection("announcements").orderBy("createdAt", "desc").limit(1).onSnapshot(function(snapshot) {
        if (snapshot.empty) return;
        const latest = snapshot.docs[0].data().createdAt;
        if (!latest || !latest.toMillis) return;
        const lastSeen = Number(localStorage.getItem("lastSeenAnnounceMs") || 0);
        const hasUnread = latest.toMillis() > lastSeen;
        document.querySelectorAll('.tabbar a[href="home.html"], .topbar-nav a[href="home.html"]').forEach(function(link) {
            link.classList.toggle("has-badge", hasUnread);
        });
    });
});

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

// ✨ 탭바/상단 메뉴로 다른 페이지 이동할 때 뚝 끊기지 않고 부드럽게 페이드 전환
document.querySelectorAll(".tabbar a, .topbar-nav a").forEach(function(link) {
    link.addEventListener("click", function(e) {
        const href = link.getAttribute("href");
        // 이미 보고 있는 페이지를 다시 누른 거면 아무것도 안 함
        if (!href || link.classList.contains("active")) return;
        e.preventDefault();
        document.body.classList.add("page-leaving");
        setTimeout(function() { window.location.href = href; }, 180);
    });
});

// ✨ 섹션 접기/펼치기 - data-target에 적힌 id를 가진 요소를 보이거나 숨김
// (홈 화면이 너무 길어져서, 자주 안 쓰는 섹션은 기본 접힌 채로 시작하게 하는 용도)
document.querySelectorAll(".section-toggle-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        const willOpen = target.style.display === "none";
        target.style.display = willOpen ? "block" : "none";
        btn.classList.toggle("open", willOpen);
    });
});
