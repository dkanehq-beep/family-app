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

// ✨ 오늘의 질문 (체크인) - 답하면 마일리지 2점 + 가족 연속 체크인 스트릭 유지
const DAILY_QUESTIONS = [
    "오늘 가장 고마웠던 순간은?", "오늘 먹은 것 중에 제일 맛있었던 건?",
    "오늘 기분을 색깔로 표현한다면?", "요즘 제일 하고 싶은 일은?",
    "오늘 가족 중 누구에게 고마웠나요?", "최근에 웃겼던 일이 있다면?",
    "오늘 하루를 한 단어로 표현한다면?", "요즘 제일 좋아하는 노래나 음식은?",
    "오늘 있었던 일 중 기억에 남는 건?", "지금 가장 기대되는 일은?",
    "오늘 날씨는 어땠나요, 기분은요?", "요즘 배우고 싶은 게 있다면?",
    "오늘 누군가를 도와준 일이 있나요?", "우리 가족과 하고 싶은 게 있다면?",
    "오늘 스스로를 칭찬한다면?"
];
function dayOfYear(d) {
    const start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d - start) / 86400000);
}
function todaysQuestion() { return DAILY_QUESTIONS[dayOfYear(new Date()) % DAILY_QUESTIONS.length]; }

let todayCheckins = [];
let checkinStreak = 0;

function myTodayCheckin() {
    const uid = auth.currentUser && auth.currentUser.uid;
    return todayCheckins.find(function(c) { return c.ownerUid === uid; });
}

function renderCheckinWidget() {
    const widget = document.getElementById("checkin-widget");
    if (!widget) return;
    const mine = myTodayCheckin();
    const question = todaysQuestion();

    const answersHtml = todayCheckins.length > 0
        ? todayCheckins.map(function(c) {
            return `<div class="checkin-answer"><span class="checkin-answer-name">${avatarPrefix(c.ownerUid)}${escapeHtml(c.name)}</span><p>${escapeHtml(c.answer)}</p></div>`;
        }).join("")
        : '<p class="empty-hint">아직 아무도 답하지 않았어요. 첫 번째로 답해보세요!</p>';

    widget.innerHTML = `
        <p class="checkin-question">${escapeHtml(question)}</p>
        ${mine
            ? `<p class="checkin-done-note">오늘 답변 완료 ✓</p>`
            : `<form id="checkin-form" class="checkin-form">
                <input type="text" id="checkin-answer" placeholder="짧게 답해보세요" required maxlength="80">
                <button type="submit" class="btn-primary">답하기</button>
            </form>`}
        <div class="checkin-answers">${answersHtml}</div>
    `;

    const form = document.getElementById("checkin-form");
    if (form) {
        form.addEventListener("submit", function(e) {
            e.preventDefault();
            const answer = document.getElementById("checkin-answer").value.trim();
            const uid = auth.currentUser.uid;
            const dateKey = todayDateKey();
            db.collection("checkins").doc(`${uid}_${dateKey}`).set({
                ownerUid: uid,
                name: currentUserName(),
                question: question,
                answer: answer,
                dateKey: dateKey,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }).then(function() {
                showToast("체크인 완료! 🔥");
                awardMileage(2, "오늘의 질문 체크인", "checkin");
            }).catch(function(err) {
                showToast("체크인에 실패했어요: " + err.message);
            });
        });
    }
}

// 오늘까지(또는 어제까지) 하루도 안 빠지고 누군가 체크인한 날이 며칠 연속인지 계산
function computeStreak(recentDateKeys) {
    const set = new Set(recentDateKeys);
    let streak = 0;
    const cursor = new Date();
    if (!set.has(formatDateKey(cursor))) {
        cursor.setDate(cursor.getDate() - 1);  // 오늘 아직 아무도 체크인 안 했으면 어제부터 계산
    }
    while (set.has(formatDateKey(cursor))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}

function renderStreak() {
    const el = document.getElementById("checkin-streak");
    if (!el) return;
    el.textContent = checkinStreak > 0 ? `🔥 연속 ${checkinStreak}일째` : "";
}

renderCheckinWidget();
renderStreak();
whenAuthReady(function() {
    db.collection("checkins").where("dateKey", "==", todayDateKey()).onSnapshot(function(snapshot) {
        todayCheckins = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
        renderCheckinWidget();
    });
    db.collection("checkins").orderBy("dateKey", "desc").limit(200).onSnapshot(function(snapshot) {
        checkinStreak = computeStreak(snapshot.docs.map(function(doc) { return doc.data().dateKey; }));
        renderStreak();
    });
});

// ✨ 오늘 캘린더 일정(생일 등)이 있으면 축하 메시지 남기는 공간을 보여줌
function eventCoversDate(ev, key) {
    const end = ev.endDate || ev.date;
    return key >= ev.date && key <= end;
}

let allEventsForWish = [];
let todayEvents = [];
let todayEventWishes = [];

function renderEventWishes() {
    const wrap = document.getElementById("event-wish-section");
    if (!wrap) return;
    if (todayEvents.length === 0) {
        wrap.style.display = "none";
        wrap.innerHTML = "";
        return;
    }
    wrap.style.display = "block";
    wrap.innerHTML = `
        <div class="section-header"><h3 class="section-label">오늘의 축하</h3></div>
        ${todayEvents.map(function(ev) {
            const wishes = todayEventWishes.filter(function(w) { return w.eventId === ev.id; });
            const wishesHtml = wishes.length > 0
                ? wishes.map(function(w) {
                    return `<div class="wish-item"><span class="wish-item-title">${avatarPrefix(w.ownerUid)}${escapeHtml(w.author)}</span><p>${escapeHtml(w.text)}</p></div>`;
                }).join("")
                : '<p class="empty-hint">아직 메시지가 없어요. 첫 축하를 남겨보세요!</p>';
            return `
                <div class="event-wish-card">
                    <p class="event-wish-title">🎉 오늘은 <b>${escapeHtml(ev.title)}</b></p>
                    <div class="event-wish-list">${wishesHtml}</div>
                    <form class="event-wish-form" data-event-id="${ev.id}">
                        <input type="text" class="event-wish-input" placeholder="축하 메시지를 남겨보세요" required maxlength="80">
                        <button type="submit" class="btn-primary">남기기</button>
                    </form>
                </div>
            `;
        }).join("")}
    `;

    wrap.querySelectorAll(".event-wish-form").forEach(function(form) {
        form.addEventListener("submit", function(e) {
            e.preventDefault();
            const input = form.querySelector(".event-wish-input");
            const text = input.value.trim();
            db.collection("event_wishes").add({
                eventId: form.dataset.eventId,
                text: text,
                author: currentUserName(),
                ownerUid: auth.currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }).then(function() {
                input.value = "";
                showToast("메시지를 남겼어요 🎉");
            }).catch(function(err) {
                showToast("등록에 실패했어요: " + err.message);
            });
        });
    });
}

whenAuthReady(function() {
    db.collection("events").onSnapshot(function(snapshot) {
        allEventsForWish = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
        todayEvents = allEventsForWish.filter(function(ev) { return eventCoversDate(ev, todayDateKey()); });
        renderEventWishes();
    });
    db.collection("event_wishes").orderBy("createdAt").onSnapshot(function(snapshot) {
        todayEventWishes = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
        renderEventWishes();
    });
});

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
                    <span class="announce-meta">${avatarPrefix(a.ownerUid)}${escapeHtml(a.author)} · ${formatAnnounceDate(a.createdAt)}</span>
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
let todayAcademies = [];

function pad2(n) { return String(n).padStart(2, "0"); }
function formatDateKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function todayDateKey() { return formatDateKey(new Date()); }
function todayDayIndex() {
    // 0=월요일 ... 6=일요일 (schedule.js와 동일한 기준)
    const jsDay = new Date().getDay(); // 0=일 ... 6=토
    return jsDay === 0 ? 6 : jsDay - 1;
}
// 이번 주 월요일 날짜 (schedule.js의 getMonday와 동일한 계산)
function getWeekMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    date.setDate(date.getDate() + diff);
    return date;
}
const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

function renderTodaySummary() {
    const listEl = document.getElementById("today-summary-list");
    if (todayKids.length === 0) {
        listEl.innerHTML = '<p class="empty-hint">시간표에 아이를 등록하면 오늘 일정이 여기 보여요.</p>';
        return;
    }
    const dayIdx = todayDayIndex();
    const monday = getWeekMonday(new Date());

    listEl.innerHTML = todayKids.map(function(kid) {
        const sched = todaySchedule.find(function(s) { return s.kidId === kid.id && s.day === dayIdx; }) || {};

        // 이번 주 월~일 중 등록된 숙제가 전부 완료 체크된 요일만 뱃지로 표시
        const doneDays = [];
        for (let i = 0; i < 7; i++) {
            const dateObj = new Date(monday);
            dateObj.setDate(dateObj.getDate() + i);
            const key = formatDateKey(dateObj);
            const dayHw = todayHomework.filter(function(h) { return h.kidId === kid.id && h.date === key; });
            if (dayHw.length > 0 && dayHw.every(function(h) { return h.done; })) {
                doneDays.push(WEEKDAY_LABELS[i]);
            }
        }

        const kidAcademies = todayAcademies.filter(function(a) { return a.kidId === kid.id && a.day === dayIdx; });

        const parts = [];
        parts.push(`하교 <b>${sched.dismissal ? escapeHtml(sched.dismissal) : "미등록"}</b>`);
        if (kidAcademies.length > 0) {
            const names = kidAcademies.map(function(a) { return escapeHtml(a.name); }).join(", ");
            parts.push(`학원 <b>${names}</b>`);
        }
        parts.push(doneDays.length > 0
            ? `숙제 완료 <b>${doneDays.join(" ")}</b>`
            : "이번 주 완료한 숙제 없음");

        return `
            <div class="today-card">
                <span class="today-kid-name">${escapeHtml(kid.name)}</span>
                <div class="today-info">${parts.map(function(p) { return `<span>${p}</span>`; }).join("")}</div>
            </div>
        `;
    }).join("");
}

// 화면 틀은 데이터 도착 전에 즉시 그리고, 구독은 로그인 확인 후 시작
renderTodaySummary();
whenAuthReady(function() {
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
    db.collection("academies").onSnapshot(function(snapshot) {
        todayAcademies = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
        renderTodaySummary();
    });
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
            <p class="poll-meta">${avatarPrefix(currentPoll.ownerUid)}${escapeHtml(currentPoll.author || "")} · 총 ${totalVotes}표</p>
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

renderPollWidget();
whenAuthReady(function() {
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

// ✨ Firestore 실시간 동기화 — 로그인 확인 후 구독 시작
renderAnnouncements();
whenAuthReady(function() {
    db.collection("announcements").orderBy("createdAt", "desc").onSnapshot(function(snapshot) {
        allAnnouncements = snapshot.docs.map(function(doc) {
            return Object.assign({ id: doc.id }, doc.data());
        });
        renderAnnouncements();
    });
});

// ✨ 누군가 아바타를 바꾸면 이름 옆 이모지도 바로 갱신
document.addEventListener("avatars-updated", function() {
    renderAnnouncements();
    renderPollWidget();
    renderCheckinWidget();
    renderEventWishes();
});
