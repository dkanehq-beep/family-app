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
let recentCheckins = [];  // 최근 200건 - 스트릭 계산 + 최근 활동 피드에 재사용

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
    // 최근 체크인 기록은 스트릭 계산 + 최근 활동 피드에 재사용
    db.collection("checkins").orderBy("dateKey", "desc").limit(200).onSnapshot(function(snapshot) {
        recentCheckins = snapshot.docs.map(function(doc) { return doc.data(); });
        checkinStreak = computeStreak(recentCheckins.map(function(c) { return c.dateKey; }));
        renderStreak();
        renderActivityFeed();
    });
});

// ✨ 오늘 캘린더 일정(생일 등)이 있으면 축하 메시지 남기는 공간을 보여줌
// "매년 반복"은 연도 상관없이 월-일만 같으면 해당하는 걸로 침 (calendar.js와 동일한 기준)
function monthDayOf(dateStr) { return dateStr.slice(5); }

function eventCoversDate(ev, key) {
    if (ev.recurYearly) return monthDayOf(key) === monthDayOf(ev.date);
    const end = ev.endDate || ev.date;
    return key >= ev.date && key <= end;
}

function nextOccurrenceKey(ev, todayKey) {
    if (!ev.recurYearly) return ev.date;
    const todayYear = Number(todayKey.slice(0, 4));
    const md = monthDayOf(ev.date);
    const thisYearKey = `${todayYear}-${md}`;
    return thisYearKey >= todayKey ? thisYearKey : `${todayYear + 1}-${md}`;
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
                awardMileage(3, "축하 메시지 작성", "wish");
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

        // 다가오는 일정 중 가장 가까운 것 하나를 홈 대시보드 카드에 보여줌 (반복 일정은 다음 번 날짜로 계산)
        const todayKey = todayDateKey();
        const upcoming = allEventsForWish
            .filter(function(ev) { return ev.recurYearly || (ev.endDate || ev.date) >= todayKey; })
            .map(function(ev) { return Object.assign({}, ev, { _occursOn: nextOccurrenceKey(ev, todayKey) }); })
            .sort(function(a, b) { return a._occursOn.localeCompare(b._occursOn); });
        if (upcoming.length > 0) {
            const diff = daysUntilDate(upcoming[0]._occursOn);
            glanceUpcomingEvent = { title: upcoming[0].title, dday: diff === 0 ? "오늘" : `D-${diff}` };
        } else {
            glanceUpcomingEvent = null;
        }
        renderGlanceGrid();
    });
    db.collection("event_wishes").orderBy("createdAt").onSnapshot(function(snapshot) {
        todayEventWishes = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
        renderEventWishes();
    });
});

// ✨ 홈 대시보드 - 마일리지 1위 / 다가오는 일정 / 게시판 최신글을 한눈에 모아 보여줌
function daysUntilDate(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr + "T00:00:00");
    return Math.round((target - today) / 86400000);
}

let glanceProfiles = [];
let glanceMileageTotals = {};
let glanceMileageTop = null;
let glanceUpcomingEvent = null;
let glanceLatestPost = null;

// ✨ "오늘의 추억" - 여행 추억/게시판 글 중 몇 해 전 오늘(월-일이 같은 날)에 있었던 걸 자동으로 보여줌
let memoryTrips = [];
let memoryPosts = [];

function monthDay(dateStr) { return dateStr.slice(5); } // "YYYY-MM-DD" -> "MM-DD"
function monthDayFromTimestamp(ts) {
    if (!ts || !ts.toDate) return null;
    const d = ts.toDate();
    return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function renderMemories() {
    const wrap = document.getElementById("memory-section");
    if (!wrap) return;
    const todayMd = monthDay(todayDateKey());
    const currentYear = new Date().getFullYear();

    const tripItems = memoryTrips
        .filter(function(t) { return t.date && monthDay(t.date) === todayMd && Number(t.date.slice(0, 4)) < currentYear; })
        .map(function(t) {
            return {
                years: currentYear - Number(t.date.slice(0, 4)),
                title: t.title, sub: t.location || "",
                img: (t.photoUrls && t.photoUrls[0]) || null
            };
        });

    const postItems = memoryPosts
        .filter(function(p) { return p.createdAt && monthDayFromTimestamp(p.createdAt) === todayMd && p.createdAt.toDate().getFullYear() < currentYear; })
        .map(function(p) {
            return {
                years: currentYear - p.createdAt.toDate().getFullYear(),
                title: p.title, sub: (p.content || "").slice(0, 40),
                img: null
            };
        });

    const items = tripItems.concat(postItems);
    if (items.length === 0) { wrap.style.display = "none"; wrap.innerHTML = ""; return; }

    wrap.style.display = "block";
    wrap.innerHTML = `
        <div class="section-header"><h3 class="section-label">오늘의 추억</h3></div>
        ${items.map(function(it) {
            return `
                <div class="memory-card">
                    ${it.img ? `<img class="memory-card-img" src="${it.img}" alt="">` : ""}
                    <div class="memory-card-body">
                        <span class="memory-card-badge">${it.years}년 전 오늘</span>
                        <h4>${escapeHtml(it.title)}</h4>
                        ${it.sub ? `<p>${escapeHtml(it.sub)}</p>` : ""}
                    </div>
                </div>
            `;
        }).join("")}
    `;
}

// ✨ 최근 활동 피드 - 이미 홈에서 불러온 데이터(체크인/게시글/편지/할일)를 시간순으로 모아서 보여줌
// (새로 구독하는 게 아니라 다른 기능들이 이미 불러온 데이터를 재사용)
function renderActivityFeed() {
    const wrap = document.getElementById("activity-feed");
    if (!wrap) return;

    const items = [];
    recentCheckins.forEach(function(c) {
        items.push({ ts: c.createdAt, icon: "💬", text: `${c.name}님이 오늘의 질문에 답했어요` });
    });
    memoryPosts.forEach(function(p) {
        items.push({ ts: p.createdAt, icon: "✏️", text: `${p.author}님이 글을 남겼어요: ${p.title}` });
    });
    myLetters.forEach(function(l) {
        items.push({ ts: l.createdAt, icon: "💌", text: `${l.author}님이 나에게 편지를 보냈어요` });
    });
    allTodos.forEach(function(t) {
        items.push({ ts: t.createdAt, icon: "🛒", text: `"${t.title}" 항목이 추가됐어요` });
    });

    const sorted = items
        .filter(function(it) { return it.ts && it.ts.toMillis; })
        .sort(function(a, b) { return b.ts.toMillis() - a.ts.toMillis(); })
        .slice(0, 15);

    if (sorted.length === 0) {
        wrap.innerHTML = '<p class="empty-hint">아직 활동이 없어요.</p>';
        return;
    }
    wrap.innerHTML = sorted.map(function(it) {
        return `
            <div class="activity-item">
                <span class="activity-icon">${it.icon}</span>
                <div class="activity-body">
                    <p>${escapeHtml(it.text)}</p>
                    <span class="activity-time">${formatAnnounceDate(it.ts)}</span>
                </div>
            </div>
        `;
    }).join("");
}

function computeMileageTop() {
    const merged = glanceProfiles
        .map(function(p) { return { id: p.id, name: p.name || "가족", total: glanceMileageTotals[p.id] || 0 }; })
        .sort(function(a, b) { return b.total - a.total; });
    glanceMileageTop = (merged.length > 0 && merged[0].total > 0) ? merged[0] : null;
}

function renderGlanceGrid() {
    const grid = document.getElementById("glance-grid");
    if (!grid) return;

    const mileageCard = glanceMileageTop
        ? `<a class="glance-card" href="mileage.html">
             <span class="glance-card-label">마일리지 1위</span>
             <span class="glance-card-main">🥇 ${avatarPrefix(glanceMileageTop.id)}${escapeHtml(glanceMileageTop.name)}</span>
             <span class="glance-card-sub">${glanceMileageTop.total} 마일리지</span>
           </a>`
        : `<a class="glance-card empty" href="mileage.html">
             <span class="glance-card-label">마일리지</span>
             <span class="glance-card-main">아직 순위가 없어요</span>
             <span class="glance-card-sub">숙제나 글쓰기로 시작해보세요</span>
           </a>`;

    const eventCard = glanceUpcomingEvent
        ? `<a class="glance-card" href="calendar.html">
             <span class="glance-card-label">다가오는 일정</span>
             <span class="glance-card-main">${escapeHtml(glanceUpcomingEvent.title)}</span>
             <span class="glance-card-sub">${glanceUpcomingEvent.dday}</span>
           </a>`
        : `<a class="glance-card empty" href="calendar.html">
             <span class="glance-card-label">다가오는 일정</span>
             <span class="glance-card-main">예정된 일정이 없어요</span>
             <span class="glance-card-sub">캘린더에 등록해보세요</span>
           </a>`;

    const postCard = glanceLatestPost
        ? `<a class="glance-card" href="board.html">
             <span class="glance-card-label">게시판 최신글</span>
             <span class="glance-card-main">${escapeHtml(glanceLatestPost.title)}</span>
             <span class="glance-card-sub">${avatarPrefix(glanceLatestPost.ownerUid)}${escapeHtml(glanceLatestPost.author)}</span>
           </a>`
        : `<a class="glance-card empty" href="board.html">
             <span class="glance-card-label">게시판</span>
             <span class="glance-card-main">아직 글이 없어요</span>
             <span class="glance-card-sub">첫 소식을 남겨보세요</span>
           </a>`;

    grid.innerHTML = mileageCard + eventCard + postCard;
}

renderGlanceGrid();
renderMemories();
whenAuthReady(function() {
    db.collection("profiles").onSnapshot(function(snapshot) {
        glanceProfiles = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
        computeMileageTop();
        renderGlanceGrid();
    });
    db.collection("mileage").onSnapshot(function(snapshot) {
        glanceMileageTotals = {};
        snapshot.docs.forEach(function(doc) { glanceMileageTotals[doc.id] = doc.data().total || 0; });
        computeMileageTop();
        renderGlanceGrid();
    });
    // "오늘의 추억" 매칭 + 최근 활동 피드에도 재사용하기 위해 최근 글을 넉넉히 가져옴
    db.collection("posts").orderBy("createdAt", "desc").limit(300).onSnapshot(function(snapshot) {
        const posts = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
        glanceLatestPost = posts.length > 0 ? posts[0] : null;
        memoryPosts = posts;
        renderGlanceGrid();
        renderMemories();
        renderActivityFeed();
    });

    db.collection("trips").onSnapshot(function(snapshot) {
        memoryTrips = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
        renderMemories();
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
        // 하교시간/학원은 학기중·방학중을 따로 저장하므로, 이 아이가 지금 어느 쪽인지에 맞는 것만 가져옴
        const profile = kid.activeProfile || "term";
        const sched = todaySchedule.find(function(s) { return s.kidId === kid.id && s.day === dayIdx && (s.profile || "term") === profile; }) || {};

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

        const kidAcademies = todayAcademies.filter(function(a) { return a.kidId === kid.id && a.day === dayIdx && (a.profile || "term") === profile; });

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
    // 최신 20개를 가져와서, 맨 앞(0번)은 진행 중인 투표로 쓰고 나머지는 "지난 투표" 기록으로 재사용
    db.collection("polls").orderBy("createdAt", "desc").limit(20).onSnapshot(function(snapshot) {
        allPolls = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
        if (allPolls.length === 0) {
            currentPoll = null;
            currentPollVotes = [];
            renderPollWidget();
            renderPollHistoryToggle();
            return;
        }
        currentPoll = allPolls[0];
        watchPollVotes(currentPoll.id);
        renderPollWidget();
        renderPollHistoryToggle();
    });
});

// ✨ 지난 투표 기록 - 진행 중인 투표(allPolls[0])를 뺀 나머지를 눌러서 펼쳐봄
let allPolls = [];
let pollHistoryVotes = {};  // pollId -> [{optionIndex, ...}]
let pollHistoryExpanded = false;
let pollHistoryLoaded = false;

function renderPollHistoryToggle() {
    const btn = document.getElementById("poll-history-toggle");
    if (!btn) return;
    const past = allPolls.slice(1);
    if (past.length === 0) { btn.style.display = "none"; return; }
    btn.style.display = "block";
    btn.textContent = pollHistoryExpanded ? "지난 투표 접기" : `지난 투표 보기 (${past.length})`;
}

function renderPollHistory() {
    const wrap = document.getElementById("poll-history-list");
    if (!wrap) return;
    if (!pollHistoryExpanded) { wrap.innerHTML = ""; return; }
    const past = allPolls.slice(1);
    wrap.innerHTML = past.map(function(p) {
        const votes = pollHistoryVotes[p.id] || [];
        const total = votes.length;
        const optionsHtml = (p.options || []).map(function(opt, i) {
            const count = votes.filter(function(v) { return v.optionIndex === i; }).length;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return `<div class="poll-history-option"><span>${escapeHtml(opt)}</span><span>${count}표 (${pct}%)</span></div>`;
        }).join("");
        return `
            <div class="poll-history-card">
                <p class="poll-history-question">${escapeHtml(p.question)}</p>
                <div class="poll-history-options">${optionsHtml}</div>
                <p class="poll-history-meta">${avatarPrefix(p.ownerUid)}${escapeHtml(p.author || "")} · 총 ${total}표</p>
            </div>
        `;
    }).join("");
}

document.getElementById("poll-history-toggle").addEventListener("click", function() {
    pollHistoryExpanded = !pollHistoryExpanded;
    renderPollHistoryToggle();
    if (pollHistoryExpanded && !pollHistoryLoaded) {
        pollHistoryLoaded = true;
        const past = allPolls.slice(1);
        Promise.all(past.map(function(p) {
            return db.collection("polls").doc(p.id).collection("votes").get().then(function(snap) {
                pollHistoryVotes[p.id] = snap.docs.map(function(d) { return d.data(); });
            });
        })).then(renderPollHistory).catch(function(err) {
            showToast("지난 투표를 불러오지 못했어요: " + err.message);
        });
    } else {
        renderPollHistory();
    }
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
        awardMileage(5, "공지 작성", "announce");
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

// ✨ 가족 편지함 - 게시판처럼 전체공개가 아니라, 받는 사람+보낸 사람만 볼 수 있음
let myLetters = [];
const letterModal = document.getElementById("letter-modal");
const letterForm = document.getElementById("letter-form");

function renderLetterList() {
    const listEl = document.getElementById("letter-list");
    if (!listEl) return;
    if (myLetters.length === 0) {
        listEl.innerHTML = '<p class="empty-hint">아직 받은 편지가 없어요. 가족에게 먼저 편지를 남겨보세요!</p>';
        return;
    }
    listEl.innerHTML = myLetters.map(function(l) {
        return `
            <div class="letter-item" data-id="${l.id}">
                <div class="letter-item-top">
                    <span class="letter-from">${avatarPrefix(l.ownerUid)}${escapeHtml(l.author)}님이 보낸 편지</span>
                    <span class="letter-date">${formatAnnounceDate(l.createdAt)}</span>
                </div>
                <p class="letter-text">${escapeHtml(l.text)}</p>
                <button type="button" class="letter-del" data-id="${l.id}">삭제</button>
            </div>
        `;
    }).join("");
    listEl.querySelectorAll(".letter-del").forEach(function(btn) {
        btn.addEventListener("click", function() {
            if (!confirm("이 편지를 삭제할까요?")) return;
            db.collection("letters").doc(btn.dataset.id).delete();
        });
    });
}

document.getElementById("letter-add-btn").addEventListener("click", function() {
    const select = document.getElementById("letter-to");
    const others = familyRoster(true);
    if (others.length === 0) {
        showToast("편지 보낼 다른 가족이 아직 없어요.");
        return;
    }
    select.innerHTML = others.map(function(p) {
        return `<option value="${p.id}" data-name="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`;
    }).join("");
    letterModal.classList.add("open");
});
document.getElementById("letter-modal-close").addEventListener("click", function() { letterModal.classList.remove("open"); });
document.getElementById("letter-cancel-btn").addEventListener("click", function() { letterModal.classList.remove("open"); });
letterModal.addEventListener("click", function(e) { if (e.target === letterModal) letterModal.classList.remove("open"); });

letterForm.addEventListener("submit", function(e) {
    e.preventDefault();
    const select = document.getElementById("letter-to");
    const toUid = select.value;
    const toName = select.selectedOptions[0] ? select.selectedOptions[0].dataset.name : "가족";
    const text = document.getElementById("letter-text").value.trim();
    const submitBtn = letterForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    db.collection("letters").add({
        toUid: toUid,
        toName: toName,
        text: text,
        author: currentUserName(),
        ownerUid: auth.currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function() {
        showToast(`${toName}님에게 편지를 보냈어요 💌`);
        letterModal.classList.remove("open");
        letterForm.reset();
    }).catch(function(err) {
        showToast("전송에 실패했어요: " + err.message);
    }).finally(function() {
        submitBtn.disabled = false;
    });
});

renderLetterList();
whenAuthReady(function() {
    // where + orderBy를 같이 쓰면 복합 색인이 필요해지므로, 정렬은 받아온 뒤 코드에서 처리
    db.collection("letters").where("toUid", "==", auth.currentUser.uid).onSnapshot(function(snapshot) {
        myLetters = snapshot.docs
            .map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); })
            .sort(function(a, b) {
                const at = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
                const bt = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
                return bt - at;
            });
        renderLetterList();
        renderActivityFeed();
    }, function(err) {
        console.error("편지함 구독 실패:", err.message);
    });
});

// ✨ 장보기 · 할일 공유 리스트 (완료 체크에만 마일리지, 등록 자체는 안 걸음)
let allTodos = [];
const todoModal = document.getElementById("todo-modal");
const todoForm = document.getElementById("todo-form");

function renderTodoList() {
    const listEl = document.getElementById("todo-list");
    if (!listEl) return;
    if (allTodos.length === 0) {
        listEl.innerHTML = '<p class="empty-hint">아직 등록된 게 없어요. 장보기나 할일을 추가해보세요!</p>';
        return;
    }
    listEl.innerHTML = allTodos.map(function(t) {
        return `
            <div class="todo-item${t.done ? " done" : ""}" data-id="${t.id}">
                <label class="toggle-switch sm todo-toggle">
                    <input type="checkbox" class="todo-toggle-input" data-id="${t.id}" ${t.done ? "checked" : ""}>
                    <span class="toggle-track"></span>
                </label>
                <span class="todo-text">${escapeHtml(t.title)}</span>
                ${isOwner(t) ? `<button type="button" class="todo-del" data-id="${t.id}">✕</button>` : ""}
            </div>
        `;
    }).join("");

    function toggleTodo(id, newDone) {
        const t = allTodos.find(function(x) { return x.id === id; });
        if (!t) return;
        db.collection("todos").doc(id).update({ done: newDone });
        if (newDone) awardMileage(5, "할일 완료: " + t.title);
    }
    listEl.querySelectorAll(".todo-toggle-input").forEach(function(input) {
        input.addEventListener("change", function() { toggleTodo(input.dataset.id, input.checked); });
    });
    listEl.querySelectorAll(".todo-text").forEach(function(el) {
        el.addEventListener("click", function() {
            const item = el.closest(".todo-item");
            const input = item.querySelector(".todo-toggle-input");
            input.checked = !input.checked;
            input.dispatchEvent(new Event("change"));
        });
    });
    listEl.querySelectorAll(".todo-del").forEach(function(btn) {
        btn.addEventListener("click", function() {
            db.collection("todos").doc(btn.dataset.id).delete();
        });
    });
}

document.getElementById("todo-add-btn").addEventListener("click", function() { todoModal.classList.add("open"); });
document.getElementById("todo-modal-close").addEventListener("click", function() { todoModal.classList.remove("open"); });
document.getElementById("todo-cancel-btn").addEventListener("click", function() { todoModal.classList.remove("open"); });
todoModal.addEventListener("click", function(e) { if (e.target === todoModal) todoModal.classList.remove("open"); });

todoForm.addEventListener("submit", function(e) {
    e.preventDefault();
    const title = document.getElementById("todo-title").value.trim();
    db.collection("todos").add({
        title: title,
        done: false,
        ownerUid: auth.currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function() {
        showToast("추가했어요");
        todoModal.classList.remove("open");
        todoForm.reset();
    }).catch(function(err) {
        showToast("추가에 실패했어요: " + err.message);
    });
});

renderTodoList();
renderActivityFeed();
whenAuthReady(function() {
    db.collection("todos").orderBy("createdAt", "desc").onSnapshot(function(snapshot) {
        allTodos = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
        renderTodoList();
        renderActivityFeed();
    }, function(err) { console.error("할일 구독 실패:", err.message); });
});

// ✨ 위시리스트 - 사람별로 묶어서 보여주고, 선물했으면 "완료" 체크로 표시(중복 선물 방지)
let allWishlist = [];
const wishlistModal = document.getElementById("wishlist-modal");
const wishlistForm = document.getElementById("wishlist-form");

function renderWishlist() {
    const wrap = document.getElementById("wishlist-section");
    if (!wrap) return;
    if (allWishlist.length === 0) {
        wrap.innerHTML = '<p class="empty-hint">아직 위시리스트가 없어요. 갖고 싶은 걸 적어보세요!</p>';
        return;
    }
    const grouped = {};
    allWishlist.forEach(function(w) {
        if (!grouped[w.ownerUid]) grouped[w.ownerUid] = { name: w.author, items: [] };
        grouped[w.ownerUid].items.push(w);
    });
    wrap.innerHTML = Object.keys(grouped).map(function(uid) {
        const g = grouped[uid];
        return `
            <div class="wishlist-person">
                <span class="wishlist-person-name">${avatarPrefix(uid)}${escapeHtml(g.name)}</span>
                <div class="wishlist-items">
                    ${g.items.map(function(w) {
                        return `
                            <div class="wishlist-row${w.fulfilled ? " fulfilled" : ""}" data-id="${w.id}">
                                <label class="toggle-switch sm wishlist-toggle">
                                    <input type="checkbox" class="wishlist-toggle-input" data-id="${w.id}" ${w.fulfilled ? "checked" : ""}>
                                    <span class="toggle-track"></span>
                                </label>
                                <span class="wishlist-title">${escapeHtml(w.title)}</span>
                                ${isOwner(w) ? `<button type="button" class="wishlist-del" data-id="${w.id}">✕</button>` : ""}
                            </div>
                        `;
                    }).join("")}
                </div>
            </div>
        `;
    }).join("");

    wrap.querySelectorAll(".wishlist-toggle-input").forEach(function(input) {
        input.addEventListener("change", function() {
            db.collection("wishlist_items").doc(input.dataset.id).update({ fulfilled: input.checked });
        });
    });
    wrap.querySelectorAll(".wishlist-del").forEach(function(btn) {
        btn.addEventListener("click", function() {
            db.collection("wishlist_items").doc(btn.dataset.id).delete();
        });
    });
}

document.getElementById("wishlist-add-btn").addEventListener("click", function() { wishlistModal.classList.add("open"); });
document.getElementById("wishlist-modal-close").addEventListener("click", function() { wishlistModal.classList.remove("open"); });
document.getElementById("wishlist-cancel-btn").addEventListener("click", function() { wishlistModal.classList.remove("open"); });
wishlistModal.addEventListener("click", function(e) { if (e.target === wishlistModal) wishlistModal.classList.remove("open"); });

wishlistForm.addEventListener("submit", function(e) {
    e.preventDefault();
    const title = document.getElementById("wishlist-title").value.trim();
    db.collection("wishlist_items").add({
        title: title,
        fulfilled: false,
        author: currentUserName(),
        ownerUid: auth.currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function() {
        showToast("위시리스트에 추가했어요");
        wishlistModal.classList.remove("open");
        wishlistForm.reset();
    }).catch(function(err) {
        showToast("추가에 실패했어요: " + err.message);
    });
});

renderWishlist();
whenAuthReady(function() {
    db.collection("wishlist_items").orderBy("createdAt", "desc").onSnapshot(function(snapshot) {
        allWishlist = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
        renderWishlist();
    }, function(err) { console.error("위시리스트 구독 실패:", err.message); });
});

// ✨ 누군가 아바타를 바꾸면 이름 옆 이모지도 바로 갱신
document.addEventListener("avatars-updated", function() {
    renderAnnouncements();
    renderPollWidget();
    renderCheckinWidget();
    renderEventWishes();
    renderGlanceGrid();
    renderLetterList();
    renderWishlist();
    renderActivityFeed();
});

// ✨ 홈 화면을 열어봤으니 지금까지의 공지는 다 본 것으로 처리 (탭바 배지 해제용)
whenAuthReady(function() {
    db.collection("announcements").orderBy("createdAt", "desc").limit(1).get().then(function(snapshot) {
        if (snapshot.empty) return;
        const latest = snapshot.docs[0].data().createdAt;
        if (latest && latest.toMillis) {
            localStorage.setItem("lastSeenAnnounceMs", String(latest.toMillis()));
        }
    });
});
