function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

// ✨ 앱을 열 때마다 잠깐 보이는 인사말 스플래시
setTimeout(function() {
    const splash = document.getElementById("app-splash");
    if (!splash) return;
    splash.classList.add("splash-hide");
    setTimeout(function() { splash.style.display = "none"; }, 500);
}, 1300);

function formatAnnounceDate(ts) {
    if (!ts || !ts.toDate) return "";
    const d = ts.toDate();
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

let allAnnouncements = [];
let announceExpanded = false;

function renderAnnouncements() {
    const listEl = document.getElementById("announce-list");
    const moreBtn = document.getElementById("announce-more-btn");

    if (allAnnouncements.length === 0) {
        listEl.innerHTML = '<p class="empty-hint">등록된 공지가 없어요.</p>';
        moreBtn.style.display = "none";
        return;
    }

    const visible = announceExpanded ? allAnnouncements.slice(0, 5) : allAnnouncements.slice(0, 1);
    listEl.innerHTML = visible.map(function(a) {
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

    const remaining = allAnnouncements.length - 1;
    if (remaining > 0) {
        moreBtn.style.display = "block";
        moreBtn.textContent = announceExpanded ? "접기" : `이전 공지 ${remaining}개 더보기`;
    } else {
        moreBtn.style.display = "none";
    }
}

document.getElementById("announce-more-btn").addEventListener("click", function() {
    announceExpanded = !announceExpanded;
    renderAnnouncements();
});

// ✨ 오늘의 요약 (아이 시간표 + 숙제)
let todayKids = [];
let todaySchedule = [];
let todayHomework = [];

function pad2(n) { return String(n).padStart(2, "0"); }
function todayDateKey() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function todayDayIndex() {
    // 0=월요일 ... 6=일요일 (schedule.js와 동일한 기준)
    const jsDay = new Date().getDay(); // 0=일 ... 6=토
    return jsDay === 0 ? 6 : jsDay - 1;
}

function renderTodaySummary() {
    const listEl = document.getElementById("today-summary-list");
    if (todayKids.length === 0) {
        listEl.innerHTML = '<p class="empty-hint">시간표에 아이를 등록하면 오늘 일정이 여기 보여요.</p>';
        return;
    }
    const dayIdx = todayDayIndex();
    const dKey = todayDateKey();

    listEl.innerHTML = todayKids.map(function(kid) {
        const sched = todaySchedule.find(function(s) { return s.kidId === kid.id && s.day === dayIdx; }) || {};
        const hw = todayHomework.filter(function(h) { return h.kidId === kid.id && h.date === dKey; });
        const doneCount = hw.filter(function(h) { return h.done; }).length;

        const parts = [];
        parts.push(`하교 <b>${sched.dismissal ? escapeHtml(sched.dismissal) : "미등록"}</b>`);
        if (sched.academy) parts.push(`학원 <b>${escapeHtml(sched.academy)}</b>`);
        parts.push(hw.length > 0 ? `숙제 <b>${doneCount}/${hw.length}</b> 완료` : "숙제 없음");

        return `
            <div class="today-card">
                <span class="today-kid-name">${escapeHtml(kid.name)}</span>
                <div class="today-info">${parts.map(function(p) { return `<span>${p}</span>`; }).join("")}</div>
            </div>
        `;
    }).join("");
}

db.collection("kids").orderBy("createdAt").onSnapshot(function(snapshot) {
    todayKids = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
    renderTodaySummary();
});
db.collection("weekly_schedule").onSnapshot(function(snapshot) {
    todaySchedule = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
    renderTodaySummary();
});
db.collection("homework").onSnapshot(function(snapshot) {
    todayHomework = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
    renderTodaySummary();
});

// ✨ 가족 투표
let currentPoll = null;
let currentPollVotes = [];
let pollVotesUnsub = null;

function renderPollWidget() {
    const widget = document.getElementById("poll-widget");
    if (!currentPoll) {
        widget.innerHTML = '<p class="empty-hint">진행 중인 투표가 없어요. "+ 새 투표"로 만들어보세요.</p>';
        return;
    }

    const totalVotes = currentPollVotes.length;
    const myVote = currentPollVotes.find(function(v) { return v.id === (auth.currentUser && auth.currentUser.uid); });

    const optionsHtml = currentPoll.options.map(function(opt, i) {
        const count = currentPollVotes.filter(function(v) { return v.optionIndex === i; }).length;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        const isMine = myVote && myVote.optionIndex === i;
        return `
            <button type="button" class="poll-option-btn${isMine ? " voted" : ""}" data-index="${i}">
                <span class="poll-option-bar" style="width:${pct}%;"></span>
                <span class="poll-option-label">${escapeHtml(opt)}${isMine ? " ✓" : ""}</span>
                <span class="poll-option-count">${count}표</span>
            </button>
        `;
    }).join("");

    widget.innerHTML = `
        <div class="poll-card">
            <p class="poll-question">${escapeHtml(currentPoll.question)}</p>
            <div class="poll-options">${optionsHtml}</div>
            <p class="poll-meta">${escapeHtml(currentPoll.author || "")} · 총 ${totalVotes}표</p>
        </div>
    `;

    widget.querySelectorAll(".poll-option-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
            const idx = Number(btn.dataset.index);
            const alreadyVoted = !!currentPollVotes.find(function(v) { return v.id === auth.currentUser.uid; });
            db.collection("polls").doc(currentPoll.id).collection("votes").doc(auth.currentUser.uid).set({
                optionIndex: idx,
                voterName: currentUserName()
            }).then(function() {
                if (!alreadyVoted) awardMileage(5, "투표 참여: " + currentPoll.question);
            }).catch(function(err) {
                showToast("투표에 실패했어요: " + err.message);
            });
        });
    });
}

function watchPollVotes(pollId) {
    if (pollVotesUnsub) pollVotesUnsub();
    pollVotesUnsub = db.collection("polls").doc(pollId).collection("votes").onSnapshot(function(snapshot) {
        currentPollVotes = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
        renderPollWidget();
    });
}

db.collection("polls").orderBy("createdAt", "desc").limit(1).onSnapshot(function(snapshot) {
    if (snapshot.empty) {
        currentPoll = null;
        currentPollVotes = [];
        renderPollWidget();
        return;
    }
    const doc = snapshot.docs[0];
    currentPoll = Object.assign({ id: doc.id }, doc.data());
    watchPollVotes(currentPoll.id);
    renderPollWidget();
});

const pollModal = document.getElementById("poll-modal");
const pollForm = document.getElementById("poll-form");

document.getElementById("poll-add-btn").addEventListener("click", function() {
    pollModal.classList.add("open");
});
document.getElementById("poll-modal-close").addEventListener("click", function() { pollModal.classList.remove("open"); });
document.getElementById("poll-cancel-btn").addEventListener("click", function() { pollModal.classList.remove("open"); });
pollModal.addEventListener("click", function(e) { if (e.target === pollModal) pollModal.classList.remove("open"); });

pollForm.addEventListener("submit", function(e) {
    e.preventDefault();
    const question = document.getElementById("poll-question").value.trim();
    const options = Array.from(document.querySelectorAll(".poll-option-input"))
        .map(function(input) { return input.value.trim(); })
        .filter(function(v) { return v.length > 0; });

    if (options.length < 2) {
        showToast("선택지를 2개 이상 입력해 주세요.");
        return;
    }

    const submitBtn = pollForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    db.collection("polls").add({
        question: question,
        options: options,
        author: currentUserName(),
        ownerUid: auth.currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function() {
        showToast("투표를 만들었어요 🗳️");
        pollModal.classList.remove("open");
        pollForm.reset();
    }).catch(function(err) {
        showToast("투표 생성에 실패했어요: " + err.message);
    }).finally(function() {
        submitBtn.disabled = false;
    });
});

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
