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

let allMileage = [];
let allLogs = [];

function renderMileageList() {
    const listEl = document.getElementById("mileage-list");
    if (allMileage.length === 0) {
        listEl.innerHTML = '<p class="empty-hint">아직 적립된 마일리지가 없어요. 숙제를 체크하거나 게시글을 써보세요!</p>';
        return;
    }
    listEl.innerHTML = allMileage.map(function(m) {
        const total = m.total || 0;
        const krw = total * MILEAGE_RATE;
        return `
            <div class="mileage-card">
                <div class="mileage-card-info">
                    <span class="mileage-name">${escapeHtml(m.name)}</span>
                    <span class="mileage-total">${total} 마일리지</span>
                    <span class="mileage-krw">약 ${krw.toLocaleString("ko-KR")}원</span>
                </div>
                <button class="btn-secondary mileage-payout-btn" data-uid="${m.id}" data-name="${escapeHtml(m.name)}" data-total="${total}" ${total > 0 ? "" : "disabled"}>지급하기</button>
            </div>
        `;
    }).join("");
    listEl.querySelectorAll(".mileage-payout-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
            openPayoutModal(btn.dataset.uid, btn.dataset.name, Number(btn.dataset.total));
        });
    });
}

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
                    <span class="mileage-log-name">${escapeHtml(log.name)}</span>
                    <span class="mileage-log-reason">${escapeHtml(log.reason)} · ${formatLogDate(log.createdAt)}</span>
                </div>
                <span class="mileage-log-amount ${isPositive ? "positive" : "negative"}">${isPositive ? "+" : ""}${log.amount}</span>
            </div>
        `;
    }).join("");
}

// ✨ 지급 모달
let payoutTarget = null;
const payoutModal = document.getElementById("payout-modal");

function openPayoutModal(uid, name, total) {
    payoutTarget = { uid: uid, name: name, total: total };
    const krw = total * MILEAGE_RATE;
    document.getElementById("payout-desc").textContent =
        `${name}님의 ${total}마일리지(약 ${krw.toLocaleString("ko-KR")}원)를 실제로 지급하셨나요? 확인을 누르면 마일리지가 0으로 초기화돼요.`;
    payoutModal.classList.add("open");
}
document.getElementById("payout-modal-close").addEventListener("click", function() { payoutModal.classList.remove("open"); });
document.getElementById("payout-cancel-btn").addEventListener("click", function() { payoutModal.classList.remove("open"); });
payoutModal.addEventListener("click", function(e) { if (e.target === payoutModal) payoutModal.classList.remove("open"); });

document.getElementById("payout-confirm-btn").addEventListener("click", function() {
    if (!payoutTarget) return;
    const krw = payoutTarget.total * MILEAGE_RATE;
    const btn = document.getElementById("payout-confirm-btn");
    btn.disabled = true;

    db.collection("mileage").doc(payoutTarget.uid).set({ name: payoutTarget.name, total: 0 }, { merge: true })
        .then(function() {
            return db.collection("mileage_log").add({
                uid: payoutTarget.uid,
                name: payoutTarget.name,
                amount: -payoutTarget.total,
                reason: `지급 완료 (${krw.toLocaleString("ko-KR")}원)`,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        })
        .then(function() {
            showToast(`${payoutTarget.name}님에게 ${krw.toLocaleString("ko-KR")}원 지급 완료로 기록했어요.`);
            payoutModal.classList.remove("open");
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
    db.collection("mileage").onSnapshot(function(snapshot) {
        allMileage = snapshot.docs
            .map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); })
            .sort(function(a, b) { return (b.total || 0) - (a.total || 0); });
        renderMileageList();
    });

    db.collection("mileage_log").orderBy("createdAt", "desc").limit(30).onSnapshot(function(snapshot) {
        allLogs = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
        renderLogList();
    });
});
