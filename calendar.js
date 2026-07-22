let calYear, calMonth; // calMonth: 0-11
let allEvents = []; // Firestore에서 받아온 전체 일정
let selectedDate = null;

const today = new Date();
calYear = today.getFullYear();
calMonth = today.getMonth();

function pad2(n) { return String(n).padStart(2, "0"); }
function dateKey(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }

bindHybridPicker("event-date", "event-date-native", '[data-for="event-date-native"]');
bindHybridPicker("event-end-date", "event-end-date-native", '[data-for="event-end-date-native"]');
bindHybridPicker("event-time", "event-time-native", '[data-for="event-time-native"]');

// ✨ 한국 공휴일
// 날짜가 매년 고정인 공휴일 ("월-일": 이름)
const FIXED_HOLIDAYS = {
    "01-01": "신정", "03-01": "삼일절", "05-05": "어린이날", "06-06": "현충일",
    "08-15": "광복절", "10-03": "개천절", "10-09": "한글날", "12-25": "성탄절"
};
// 음력 기준이라 매년 바뀌는 공휴일 + 대체공휴일 (연도별로 등록, 새 연도는 여기에 추가)
const LUNAR_HOLIDAYS = {
    2025: {
        "01-27": "임시공휴일", "01-28": "설날 연휴", "01-29": "설날", "01-30": "설날 연휴",
        "03-03": "대체공휴일", "05-06": "대체공휴일",
        "10-05": "추석 연휴", "10-06": "추석", "10-07": "추석 연휴", "10-08": "대체공휴일"
    },
    2026: {
        "02-16": "설날 연휴", "02-17": "설날", "02-18": "설날 연휴",
        "03-02": "대체공휴일", "05-24": "석가탄신일", "05-25": "대체공휴일",
        "08-17": "대체공휴일",
        "09-24": "추석 연휴", "09-25": "추석", "09-26": "추석 연휴",
        "10-05": "대체공휴일"
    },
    2027: {
        "02-05": "설날 연휴", "02-06": "설날", "02-07": "설날 연휴", "02-08": "대체공휴일",
        "05-13": "석가탄신일", "08-16": "대체공휴일",
        "09-14": "추석 연휴", "09-15": "추석", "09-16": "추석 연휴",
        "10-04": "대체공휴일", "10-11": "대체공휴일", "12-27": "대체공휴일"
    }
};

// 해당 날짜가 공휴일이면 이름을, 아니면 null을 돌려준다
function getHoliday(y, m, d) { // m: 0-11
    const md = `${pad2(m + 1)}-${pad2(d)}`;
    const lunar = LUNAR_HOLIDAYS[y] || {};
    return lunar[md] || FIXED_HOLIDAYS[md] || null;
}

// ✨ 여러 날짜 일정 지원: 이 날짜가 일정 기간(date~endDate) 안에 포함되는지
function eventCoversDate(ev, key) {
    const end = ev.endDate || ev.date;
    return key >= ev.date && key <= end;
}

// ✨ 여러 날짜 일정이면 "7월 1일 ~ 7월 10일" 형태로 표시
function formatEventDateLabel(ev) {
    if (ev.endDate && ev.endDate !== ev.date) {
        return `${formatDateShort(ev.date)} ~ ${formatDateShort(ev.endDate)}`;
    }
    return formatDateShort(ev.date);
}

function renderCalendar() {
    document.getElementById("cal-month-label").textContent = `${calYear}년 ${calMonth + 1}월`;

    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

    const daysEl = document.getElementById("cal-days");
    daysEl.innerHTML = "";

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement("div");
        empty.className = "cal-day empty";
        daysEl.appendChild(empty);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const key = dateKey(calYear, calMonth, d);
        const cell = document.createElement("div");
        cell.className = "cal-day" + (key === todayKey ? " today" : "");

        // 요일 계산: (첫날의 요일 + 날짜 - 1) % 7 → 0=일요일, 6=토요일
        const weekdayIdx = (firstDay + d - 1) % 7;
        if (weekdayIdx === 0) cell.classList.add("sun");
        if (weekdayIdx === 6) cell.classList.add("sat");

        const holidayName = getHoliday(calYear, calMonth, d);
        if (holidayName) cell.classList.add("holiday");

        const num = document.createElement("div");
        num.className = "cal-day-num";
        num.textContent = d;
        cell.appendChild(num);

        // 공휴일이면 숫자 아래에 작은 이름표 표시 (예: 설날, 광복절)
        if (holidayName) {
            const tag = document.createElement("span");
            tag.className = "cal-holiday-name";
            tag.textContent = holidayName;
            cell.appendChild(tag);
        }

        const dayEvents = allEvents.filter(function(ev) { return eventCoversDate(ev, key); });
        dayEvents.slice(0, 3).forEach(function(ev) {
            const dot = document.createElement("span");
            dot.className = "cal-event-dot";
            dot.textContent = ev.title;
            cell.appendChild(dot);
        });

        cell.addEventListener("click", function() { openEventModal(key); });
        daysEl.appendChild(cell);
    }
}

function renderUpcoming() {
    const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
    const upcoming = allEvents
        .filter(function(ev) { return (ev.endDate || ev.date) >= todayKey; })
        .sort(function(a, b) { return a.date.localeCompare(b.date); })
        .slice(0, 8);

    const listEl = document.getElementById("upcoming-list");
    if (upcoming.length === 0) {
        listEl.innerHTML = '<p class="empty-hint">다가오는 일정이 없어요.</p>';
        return;
    }
    listEl.innerHTML = "";
    upcoming.forEach(function(ev) {
        const item = document.createElement("div");
        item.className = "event-item";
        item.innerHTML = `
            <div class="event-item-date">${formatEventDateLabel(ev)}</div>
            <div class="event-item-body">
                <h4>${escapeHtml(ev.title)}${ev.time ? " · " + ev.time : ""}</h4>
                <p>${escapeHtml(ev.author)}${ev.memo ? " · " + escapeHtml(ev.memo) : ""}</p>
            </div>
            ${isOwner(ev) ? `<button class="event-item-del" data-id="${ev.id}">삭제</button>` : ""}
        `;
        listEl.appendChild(item);
    });
    listEl.querySelectorAll(".event-item-del").forEach(function(btn) {
        btn.addEventListener("click", function() { deleteEvent(btn.dataset.id); });
    });
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

// ✨ 모달
const eventModal = document.getElementById("event-modal");
const eventForm = document.getElementById("event-form");

function openEventModal(dateStr) {
    selectedDate = dateStr;
    document.getElementById("event-date").value = dateStr;
    document.getElementById("event-date-native").value = dateStr;
    document.getElementById("event-modal-title").textContent = formatDateShort(dateStr) + " 일정";

    const dayEvents = allEvents.filter(function(ev) { return eventCoversDate(ev, dateStr); });
    const listEl = document.getElementById("day-events-list");
    if (dayEvents.length > 0) {
        listEl.innerHTML = dayEvents.map(function(ev) {
            const rangeNote = (ev.endDate && ev.endDate !== ev.date) ? `<span class="event-range-tag">${formatEventDateLabel(ev)}</span>` : "";
            return `
                <div class="event-item">
                    <div class="event-item-body">
                        <h4>${escapeHtml(ev.title)}${ev.time ? " · " + ev.time : ""}</h4>
                        <p>${escapeHtml(ev.author)}${ev.memo ? " · " + escapeHtml(ev.memo) : ""}</p>
                        ${rangeNote}
                    </div>
                    ${isOwner(ev) ? `<button class="event-item-del" data-id="${ev.id}">삭제</button>` : ""}
                </div>
            `;
        }).join("");
        listEl.querySelectorAll(".event-item-del").forEach(function(btn) {
            btn.addEventListener("click", function() { deleteEvent(btn.dataset.id); });
        });
    } else {
        listEl.innerHTML = "";
    }

    eventModal.classList.add("open");
}

function closeEventModal() {
    eventModal.classList.remove("open");
    eventForm.reset();
}

document.getElementById("add-event-fab").addEventListener("click", function() {
    const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
    openEventModal(todayKey);
});
document.getElementById("event-modal-close").addEventListener("click", closeEventModal);
document.getElementById("event-cancel-btn").addEventListener("click", closeEventModal);
eventModal.addEventListener("click", function(e) {
    if (e.target === eventModal) closeEventModal();
});

eventForm.addEventListener("submit", function(e) {
    e.preventDefault();
    const startDate = document.getElementById("event-date").value;
    const endDate = document.getElementById("event-end-date").value.trim();

    if (endDate && endDate < startDate) {
        showToast("종료일이 시작일보다 빠를 수 없어요.");
        return;
    }

    const data = {
        date: startDate,
        endDate: endDate || null,
        title: document.getElementById("event-title").value.trim(),
        time: document.getElementById("event-time").value,
        memo: document.getElementById("event-memo").value.trim(),
        author: currentUserName(),
        ownerUid: auth.currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    db.collection("events").add(data)
        .then(function() {
            showToast("일정이 등록되었어요 🎉");
            closeEventModal();
            awardMileage(5, "일정 등록: " + data.title);
        })
        .catch(function() {
            showToast("등록에 실패했어요. 다시 시도해 주세요.");
        });
});

function deleteEvent(id) {
    if (!confirm("이 일정을 삭제할까요?")) return;
    db.collection("events").doc(id).delete()
        .then(function() { showToast("일정이 삭제되었어요."); });
}

document.getElementById("cal-prev").addEventListener("click", function() {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
});
document.getElementById("cal-next").addEventListener("click", function() {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
});

// ✨ 달력 틀은 데이터 도착을 기다리지 않고 즉시 그린다 (일정은 나중에 채워짐)
renderCalendar();
renderUpcoming();

// ✨ Firestore 실시간 동기화 — 로그인 확인이 끝난 뒤에만 구독 시작
whenAuthReady(function() {
    db.collection("events").orderBy("date").onSnapshot(function(snapshot) {
        allEvents = snapshot.docs.map(function(doc) {
            return Object.assign({ id: doc.id }, doc.data());
        });
        renderCalendar();
        renderUpcoming();
    }, function(err) {
        // 구독이 실패해도 조용히 넘어가지 않고 사용자에게 알림
        showToast("일정을 불러오지 못했어요. 앱을 새로고침해 주세요.");
        console.error("events 구독 실패:", err.message);
    });
});
