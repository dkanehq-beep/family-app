function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

function formatAnnounceDate(ts) {
    if (!ts || !ts.toDate) return "";
    const d = ts.toDate();
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

let allAnnouncements = [];

function renderAnnouncements() {
    const listEl = document.getElementById("announce-list");
    if (allAnnouncements.length === 0) {
        listEl.innerHTML = '<p class="empty-hint">등록된 공지가 없어요.</p>';
        return;
    }
    listEl.innerHTML = allAnnouncements.slice(0, 5).map(function(a) {
        return `
            <div class="announce-card">
                <div class="announce-card-top">
                    <span class="announce-title">${escapeHtml(a.title)}</span>
                    <span class="announce-meta">${escapeHtml(a.author)} · ${formatAnnounceDate(a.createdAt)}</span>
                </div>
                <p class="announce-content">${escapeHtml(a.content)}</p>
                ${isOwner(a) ? `<button class="announce-del" data-id="${a.id}">삭제</button>` : ""}
            </div>
        `;
    }).join("");
    listEl.querySelectorAll(".announce-del").forEach(function(btn) {
        btn.addEventListener("click", function() {
            if (!confirm("이 공지를 삭제할까요?")) return;
            db.collection("announcements").doc(btn.dataset.id).delete()
                .then(function() { showToast("공지를 삭제했어요."); });
        });
    });
}

const announceModal = document.getElementById("announce-modal");
const announceForm = document.getElementById("announce-form");

document.getElementById("announce-add-btn").addEventListener("click", function() {
    announceModal.classList.add("open");
});
document.getElementById("announce-modal-close").addEventListener("click", function() {
    announceModal.classList.remove("open");
});
document.getElementById("announce-cancel-btn").addEventListener("click", function() {
    announceModal.classList.remove("open");
});
announceModal.addEventListener("click", function(e) {
    if (e.target === announceModal) announceModal.classList.remove("open");
});

announceForm.addEventListener("submit", function(e) {
    e.preventDefault();
    const submitBtn = announceForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    db.collection("announcements").add({
        title: document.getElementById("announce-title").value.trim(),
        content: document.getElementById("announce-content").value.trim(),
        author: currentUserName(),
        ownerUid: auth.currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function() {
        showToast("공지를 등록했어요 📢");
        announceModal.classList.remove("open");
        announceForm.reset();
    }).catch(function(err) {
        showToast("등록에 실패했어요: " + err.message);
    }).finally(function() {
        submitBtn.disabled = false;
    });
});

// ✨ Firestore 실시간 동기화
db.collection("announcements").orderBy("createdAt", "desc").onSnapshot(function(snapshot) {
    allAnnouncements = snapshot.docs.map(function(doc) {
        return Object.assign({ id: doc.id }, doc.data());
    });
    renderAnnouncements();
});
