const MILEAGE_RATE = 50; // 1 마일리지 = 50원 (필요하면 이 숫자만 바꾸면 돼요)

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

function formatLogDate(ts) {
    if (!ts || !ts.toDate) return "";
    const d = ts.toDate();
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

let allProfiles = [];     // 가입한 가족 전체 명단 (로그인할 때마다 자동 기록됨)
let allMileageTotals = {}; // uid -> { name, total }
let allLogs = [];

// 명단(profiles) + 마일리지 총합을 합쳐서, 마일리지가 0이라 아직 mileage 문서가 없는
// 사람도 랭킹에 같이 뜨게 함
function mergedMileageList() {
    return allProfiles
        .map(function(p) {
            const m = allMileageTotals[p.id];
            return { id: p.id, name: (m && m.name) || p.name || "가족", total: (m && m.total) || 0 };
        })
        .sort(function(a, b) { return b.total - a.total; });
}

function renderMileageList() {
    const listEl = document.getElementById("mileage-list");
    const allMileage = mergedMileageList();
    if (allMileage.length === 0) {
        listEl.innerHTML = '<p class="empty-hint">아직 가입한 가족이 없어요.</p>';
        return;
    }
    // 순위 배지 (1~3위는 메달, 그 아래는 숫자) - 마일리지가 0이면 순위를 매기지 않음
    const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };
    const myUid = auth.currentUser && auth.currentUser.uid;
    listEl.innerHTML = allMileage.map(function(m, index) {
        const total = m.total || 0;
        const krw = total * MILEAGE_RATE;
        const rank = index + 1;
        const rankLabel = total > 0 ? (MEDALS[rank] || `${rank}위`) : "";
        const isMine = m.id === myUid;
        return `
            <div class="mileage-card${rank === 1 && total > 0 ? " rank-1" : ""}">
                ${rankLabel ? `<span class="mileage-rank${MEDALS[rank] ? " medal" : ""}">${rankLabel}</span>` : ""}
                <div class="mileage-card-info">
                    <span class="mileage-name">${avatarPrefix(m.id)}${escapeHtml(m.name)}${isMine ? '<button type="button" class="avatar-edit-btn" id="avatar-edit-btn">아바타 변경</button>' : ""}</span>
                    <span class="mileage-total">${total} 마일리지</span>
                    <span class="mileage-krw">약 ${krw.toLocaleString("ko-KR")}원</span>
                </div>
                <button class="btn-secondary mileage-cashout-btn" data-uid="${m.id}" data-name="${escapeHtml(m.name)}" data-total="${total}" ${total > 0 ? "" : "disabled"}>캐쉬전환</button>
            </div>
        `;
    }).join("");
    listEl.querySelectorAll(".mileage-cashout-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
            openCashoutModal(btn.dataset.uid, btn.dataset.name, Number(btn.dataset.total));
        });
    });
    const avatarBtn = document.getElementById("avatar-edit-btn");
    if (avatarBtn) avatarBtn.addEventListener("click", openAvatarModal);
}

// ✨ 아바타(이모지 프로필) 고르기 - 본인 카드에서만 보임
const avatarModal = document.getElementById("avatar-modal");

function openAvatarModal() {
    const grid = document.getElementById("avatar-grid");
    const myUid = auth.currentUser.uid;
    const current = _profileAvatars[myUid] || "";
    grid.innerHTML = AVATAR_CHOICES.map(function(emoji) {
        return `<button type="button" class="avatar-choice-btn${emoji === current ? " selected" : ""}" data-emoji="${emoji}">${emoji}</button>`;
    }).join("");
    grid.querySelectorAll(".avatar-choice-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
            db.collection("profiles").doc(myUid).set({ avatar: btn.dataset.emoji }, { merge: true })
                .then(function() {
                    showToast("아바타를 바꿨어요");
                    avatarModal.classList.remove("open");
                });
        });
    });
    avatarModal.classList.add("open");
}
document.getElementById("avatar-modal-close").addEventListener("click", function() { avatarModal.classList.remove("open"); });
avatarModal.addEventListener("click", function(e) { if (e.target === avatarModal) avatarModal.classList.remove("open"); });

function renderLogList() {
    const listEl = document.getElementById("mileage-log-list");
    if (allLogs.length === 0) {
        listEl.innerHTML = '<p class="empty-hint">아직 내역이 없어요.</p>';
        return;
    }
    listEl.innerHTML = allLogs.slice(0, 30).map(function(log) {
        const isPositive = log.amount > 0;
        return `
            <div class="mileage-log-item">
                <div class="mileage-log-left">
                    <span class="mileage-log-name">${avatarPrefix(log.uid)}${escapeHtml(log.name)}</span>
                    <span class="mileage-log-reason">${escapeHtml(log.reason)} · ${formatLogDate(log.createdAt)}</span>
                </div>
                <span class="mileage-log-amount ${isPositive ? "positive" : "negative"}">${isPositive ? "+" : ""}${log.amount}</span>
            </div>
        `;
    }).join("");
}

// ✨ 캐쉬전환 모달 (마일리지를 실제 현금으로 바꿨다고 기록 → 모두가 보는 내역에 남음)
let cashoutTarget = null;
const cashoutModal = document.getElementById("cashout-modal");

function openCashoutModal(uid, name, total) {
    cashoutTarget = { uid: uid, name: name, total: total };
    const krw = total * MILEAGE_RATE;
    document.getElementById("cashout-desc").textContent =
        `${name}님의 ${total}마일리지(약 ${krw.toLocaleString("ko-KR")}원)를 캐쉬로 전환할까요? 확인을 누르면 마일리지가 0으로 초기화되고, 전환 내역이 가족 모두에게 보여요.`;
    cashoutModal.classList.add("open");
}
document.getElementById("cashout-modal-close").addEventListener("click", function() { cashoutModal.classList.remove("open"); });
document.getElementById("cashout-cancel-btn").addEventListener("click", function() { cashoutModal.classList.remove("open"); });
cashoutModal.addEventListener("click", function(e) { if (e.target === cashoutModal) cashoutModal.classList.remove("open"); });

document.getElementById("cashout-confirm-btn").addEventListener("click", function() {
    if (!cashoutTarget) return;
    const krw = cashoutTarget.total * MILEAGE_RATE;
    const btn = document.getElementById("cashout-confirm-btn");
    btn.disabled = true;

    db.collection("mileage").doc(cashoutTarget.uid).set({ name: cashoutTarget.name, total: 0 }, { merge: true })
        .then(function() {
            // mileage_log에 남기는 이 기록을 가족 전원이 실시간으로 같이 보게 됨
            return db.collection("mileage_log").add({
                uid: cashoutTarget.uid,
                name: cashoutTarget.name,
                amount: -cashoutTarget.total,
                reason: `캐쉬전환 (${krw.toLocaleString("ko-KR")}원)`,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        })
        .then(function() {
            showToast(`${cashoutTarget.name}님이 ${krw.toLocaleString("ko-KR")}원으로 캐쉬전환했어요.`);
            cashoutModal.classList.remove("open");
        })
        .catch(function(err) {
            showToast("처리에 실패했어요: " + err.message);
        })
        .finally(function() {
            btn.disabled = false;
        });
});

// ✨ Firestore 실시간 동기화 — 로그인 확인 후 구독 시작
renderMileageList();
renderLogList();
whenAuthReady(function() {
    db.collection("profiles").onSnapshot(function(snapshot) {
        allProfiles = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
        renderMileageList();
    });

    db.collection("mileage").onSnapshot(function(snapshot) {
        allMileageTotals = {};
        snapshot.docs.forEach(function(doc) { allMileageTotals[doc.id] = doc.data(); });
        renderMileageList();
    });

    db.collection("mileage_log").orderBy("createdAt", "desc").limit(30).onSnapshot(function(snapshot) {
        allLogs = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
        renderLogList();
    });
});

// ✨ 누군가 아바타를 바꾸면 이름 옆 이모지도 바로 갱신
document.addEventListener("avatars-updated", function() {
    renderMileageList();
    renderLogList();
});
