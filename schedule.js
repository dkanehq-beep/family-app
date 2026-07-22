function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

const DAY_NAMES = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];

let allKids = [];
let currentKidId = null;
let allSchedule = [];
let allHomework = [];
let allAcademies = [];  // 학원은 하루에 여러 곳 다닐 수 있어서 항목마다 별도 문서로 관리
let allSupplies = [];   // 준비물 체크리스트 (숙제와 같은 구조, 별도 컬렉션)
let currentMonday = getMonday(new Date());

function pad2(n) { return String(n).padStart(2, "0"); }
function formatDateKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay(); // 0=일 ... 6=토
    const diff = (day === 0 ? -6 : 1) - day;
    date.setDate(date.getDate() + diff);
    date.setHours(0, 0, 0, 0);
    return date;
}

// ✨ 아이 탭
function renderKidTabs() {
    const wrap = document.getElementById("kid-tabs");
    wrap.innerHTML = "";

    allKids.forEach(function(kid) {
        const tab = document.createElement("button");
        tab.className = "kid-tab" + (kid.id === currentKidId ? " active" : "");
        tab.textContent = kid.name;
        tab.addEventListener("click", function() {
            currentKidId = kid.id;
            renderKidTabs();
            renderProfileToggle();
            renderWeekDays();
        });
        wrap.appendChild(tab);
    });

    const addBtn = document.createElement("button");
    addBtn.className = "kid-tab kid-tab-add";
    addBtn.textContent = "+ 아이 추가";
    addBtn.addEventListener("click", function() {
        document.getElementById("kid-modal").classList.add("open");
    });
    wrap.appendChild(addBtn);

    document.getElementById("no-kid-hint").style.display = allKids.length === 0 ? "block" : "none";
    document.getElementById("week-days").style.display = allKids.length === 0 ? "none" : "block";
}

// ✨ 학기 중 / 방학 중 전환 (아이마다 따로 저장, 학원·하교시간만 구분되고 숙제·준비물은 날짜 기준이라 그대로)
function currentProfile() {
    const kid = allKids.find(function(k) { return k.id === currentKidId; });
    return (kid && kid.activeProfile) || "term";
}

function renderProfileToggle() {
    const wrap = document.getElementById("profile-toggle");
    if (!wrap) return;
    if (!currentKidId) { wrap.innerHTML = ""; return; }
    const active = currentProfile();
    wrap.innerHTML = `
        <button type="button" class="profile-toggle-btn${active === "term" ? " active" : ""}" data-profile="term">학기 중</button>
        <button type="button" class="profile-toggle-btn${active === "vacation" ? " active" : ""}" data-profile="vacation">방학 중</button>
    `;
    wrap.querySelectorAll(".profile-toggle-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
            if (!currentKidId) return;
            db.collection("kids").doc(currentKidId).update({ activeProfile: btn.dataset.profile });
        });
    });
}

const kidModal = document.getElementById("kid-modal");
const kidForm = document.getElementById("kid-form");
document.getElementById("kid-modal-close").addEventListener("click", function() { kidModal.classList.remove("open"); });
document.getElementById("kid-cancel-btn").addEventListener("click", function() { kidModal.classList.remove("open"); });
kidModal.addEventListener("click", function(e) { if (e.target === kidModal) kidModal.classList.remove("open"); });

kidForm.addEventListener("submit", function(e) {
    e.preventDefault();
    const name = document.getElementById("kid-name").value.trim();
    db.collection("kids").add({ name: name, createdAt: firebase.firestore.FieldValue.serverTimestamp() })
        .then(function() {
            showToast(`${name} 추가했어요`);
            kidModal.classList.remove("open");
            kidForm.reset();
        })
        .catch(function(err) {
            showToast("추가에 실패했어요: " + err.message);
        });
});

// ✨ 주간 네비게이션
function renderWeekLabel() {
    const sunday = new Date(currentMonday);
    sunday.setDate(sunday.getDate() + 6);
    const label = `${currentMonday.getMonth() + 1}/${currentMonday.getDate()} ~ ${sunday.getMonth() + 1}/${sunday.getDate()}`;
    document.getElementById("week-label").textContent = label;
}

document.getElementById("week-prev").addEventListener("click", function() {
    currentMonday.setDate(currentMonday.getDate() - 7);
    currentMonday = new Date(currentMonday);
    renderWeekLabel();
    renderWeekDays();
});
document.getElementById("week-next").addEventListener("click", function() {
    currentMonday.setDate(currentMonday.getDate() + 7);
    currentMonday = new Date(currentMonday);
    renderWeekLabel();
    renderWeekDays();
});

// ✨ 요일별 카드 렌더링
function renderWeekDays() {
    renderWeekLabel();
    const container = document.getElementById("week-days");
    if (!currentKidId) { container.innerHTML = ""; return; }

    const todayKey = formatDateKey(new Date());
    container.innerHTML = "";

    for (let i = 0; i < 7; i++) {
        const dateObj = new Date(currentMonday);
        dateObj.setDate(dateObj.getDate() + i);
        const dateKey = formatDateKey(dateObj);
        const profile = currentProfile();
        // 하교시간/학원은 학기중·방학중을 따로 저장하므로 profile이 일치하는 것만 (기존 데이터는 profile이 없어서 "term"으로 간주)
        const sched = allSchedule.find(function(s) { return s.kidId === currentKidId && s.day === i && (s.profile || "term") === profile; }) || {};
        const dayHomework = allHomework.filter(function(h) { return h.kidId === currentKidId && h.date === dateKey; });
        const dayAcademies = allAcademies.filter(function(a) { return a.kidId === currentKidId && a.day === i && (a.profile || "term") === profile; });
        const daySupplies = allSupplies.filter(function(s) { return s.kidId === currentKidId && s.date === dateKey; });

        const card = document.createElement("div");
        card.className = "day-card" + (dateKey === todayKey ? " is-today" : "");
        card.innerHTML = `
            <div class="day-card-header">
                <span class="day-card-name">${DAY_NAMES[i]}</span>
                <span class="day-card-date">${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일</span>
            </div>
            <div class="day-field">
                <label>하교</label>
                <input type="text" class="day-field-input" data-day="${i}" data-field="dismissal" value="${escapeHtml(sched.dismissal || "")}" placeholder="예: 14:30">
                <button type="button" class="day-field-save-btn" data-day="${i}" data-field="dismissal">저장</button>
            </div>
            <div class="academy-section">
                <div class="academy-header">
                    <span>학원</span>
                    <button type="button" class="academy-add-btn" data-day="${i}">+ 추가</button>
                </div>
                <div class="academy-items">
                    ${dayAcademies.length === 0
                        ? '<p class="academy-empty">등록된 학원이 없어요</p>'
                        : dayAcademies.map(function(a) {
                            const time = (a.start || a.end) ? `${a.start || "?"} ~ ${a.end || "?"}` : "시간 미등록";
                            return `
                                <div class="academy-item" data-id="${a.id}">
                                    <span class="academy-name">${escapeHtml(a.name)}</span>
                                    <span class="academy-time">${escapeHtml(time)}</span>
                                    ${isOwner(a) ? `<button type="button" class="academy-del" data-id="${a.id}">✕</button>` : ""}
                                </div>
                            `;
                        }).join("")}
                </div>
            </div>
            <div class="homework-section">
                <div class="homework-header">
                    <span>숙제</span>
                    <button type="button" class="homework-add-btn" data-date="${dateKey}">+ 추가</button>
                </div>
                <div class="homework-items">
                    ${dayHomework.length === 0
                        ? '<p class="homework-empty">등록된 숙제가 없어요</p>'
                        : dayHomework.map(function(h) {
                            return `
                                <div class="homework-item${h.done ? " done" : ""}" data-id="${h.id}">
                                    <label class="toggle-switch sm homework-toggle">
                                        <input type="checkbox" class="homework-toggle-input" data-id="${h.id}" ${h.done ? "checked" : ""}>
                                        <span class="toggle-track"></span>
                                    </label>
                                    <span class="homework-text">${escapeHtml(h.title)}</span>
                                    ${isOwner(h) ? `<button type="button" class="homework-del" data-id="${h.id}">✕</button>` : ""}
                                </div>
                            `;
                        }).join("")}
                </div>
            </div>
            <div class="supply-section">
                <div class="supply-header">
                    <span>준비물</span>
                    <button type="button" class="supply-add-btn" data-date="${dateKey}">+ 추가</button>
                </div>
                <div class="supply-items">
                    ${daySupplies.length === 0
                        ? '<p class="supply-empty">등록된 준비물이 없어요</p>'
                        : daySupplies.map(function(s) {
                            return `
                                <div class="supply-item${s.done ? " done" : ""}" data-id="${s.id}">
                                    <label class="toggle-switch sm supply-toggle">
                                        <input type="checkbox" class="supply-toggle-input" data-id="${s.id}" ${s.done ? "checked" : ""}>
                                        <span class="toggle-track"></span>
                                    </label>
                                    <span class="supply-text">${escapeHtml(s.title)}</span>
                                    ${isOwner(s) ? `<button type="button" class="supply-del" data-id="${s.id}">✕</button>` : ""}
                                </div>
                            `;
                        }).join("")}
                </div>
            </div>
        `;
        container.appendChild(card);
    }

    bindDayFieldEvents();
    bindAcademyEvents();
    bindHomeworkEvents();
    bindSupplyEvents();
}

// ✨ 하교/학원 입력 저장 (입력창을 벗어날 때 자동 저장 + "저장" 버튼으로 직접 저장 둘 다 지원)
function saveDayField(day, field, value) {
    const profile = currentProfile();
    // "학기 중"은 기존 문서 id를 그대로 써서 예전 데이터와 이어지게 하고, "방학 중"만 별도 문서로 분리
    const docId = profile === "vacation" ? `${currentKidId}_vacation_${day}` : `${currentKidId}_${day}`;
    const data = { kidId: currentKidId, day: day, profile: profile };
    data[field] = value.trim();
    return db.collection("weekly_schedule").doc(docId).set(data, { merge: true })
        .then(function() { showToast("저장했어요"); })
        .catch(function(err) { showToast("저장에 실패했어요: " + err.message); });
}

function bindDayFieldEvents() {
    document.querySelectorAll(".day-field-input").forEach(function(input) {
        input.addEventListener("change", function() {
            saveDayField(Number(input.dataset.day), input.dataset.field, input.value);
        });
    });
    document.querySelectorAll(".day-field-save-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
            const day = btn.dataset.day;
            const field = btn.dataset.field;
            const input = document.querySelector(`.day-field-input[data-day="${day}"][data-field="${field}"]`);
            if (input) saveDayField(Number(day), field, input.value);
        });
    });
}

// ✨ 학원 추가/삭제 (하루에 여러 곳 등록 가능)
let academyTargetDay = null;
const academyModal = document.getElementById("academy-modal");
const academyForm = document.getElementById("academy-form");

function bindAcademyEvents() {
    document.querySelectorAll(".academy-add-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
            academyTargetDay = Number(btn.dataset.day);
            document.getElementById("academy-modal-title").textContent =
                `${DAY_NAMES[academyTargetDay]} 학원 추가`;
            academyModal.classList.add("open");
        });
    });
    document.querySelectorAll(".academy-del").forEach(function(btn) {
        btn.addEventListener("click", function() {
            db.collection("academies").doc(btn.dataset.id).delete();
        });
    });
}

document.getElementById("academy-modal-close").addEventListener("click", function() { academyModal.classList.remove("open"); });
document.getElementById("academy-cancel-btn").addEventListener("click", function() { academyModal.classList.remove("open"); });
academyModal.addEventListener("click", function(e) { if (e.target === academyModal) academyModal.classList.remove("open"); });

academyForm.addEventListener("submit", function(e) {
    e.preventDefault();
    const name = document.getElementById("academy-name").value.trim();
    const start = document.getElementById("academy-start").value.trim();
    const end = document.getElementById("academy-end").value.trim();
    db.collection("academies").add({
        kidId: currentKidId,
        day: academyTargetDay,
        profile: currentProfile(),
        name: name,
        start: start,
        end: end,
        ownerUid: auth.currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function() {
        showToast("학원을 추가했어요");
        academyModal.classList.remove("open");
        academyForm.reset();
        awardMileage(5, "학원 등록: " + name);
    }).catch(function(err) {
        showToast("추가에 실패했어요: " + err.message);
    });
});

// ✨ 숙제 추가/토글/삭제
let homeworkTargetDate = null;
const homeworkModal = document.getElementById("homework-modal");
const homeworkForm = document.getElementById("homework-form");

function bindHomeworkEvents() {
    document.querySelectorAll(".homework-add-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
            homeworkTargetDate = btn.dataset.date;
            const d = new Date(homeworkTargetDate);
            document.getElementById("homework-modal-title").textContent =
                `${d.getMonth() + 1}월 ${d.getDate()}일 숙제 추가`;
            homeworkModal.classList.add("open");
        });
    });
    function toggleHomework(id, newDone) {
        const hw = allHomework.find(function(h) { return h.id === id; });
        if (!hw) return;
        db.collection("homework").doc(id).update({ done: newDone });
        awardMileage(newDone ? 10 : -10, `숙제 완료: ${hw.title}`);
    }
    // 스위치를 직접 눌렀을 때
    document.querySelectorAll(".homework-toggle-input").forEach(function(input) {
        input.addEventListener("change", function() {
            toggleHomework(input.dataset.id, input.checked);
        });
    });
    // 옆의 글자를 눌러도 스위치가 같이 움직이도록
    document.querySelectorAll(".homework-text").forEach(function(el) {
        el.addEventListener("click", function() {
            const item = el.closest(".homework-item");
            const input = item.querySelector(".homework-toggle-input");
            input.checked = !input.checked;
            input.dispatchEvent(new Event("change"));
        });
    });
    document.querySelectorAll(".homework-del").forEach(function(btn) {
        btn.addEventListener("click", function() {
            db.collection("homework").doc(btn.dataset.id).delete();
        });
    });
}

document.getElementById("homework-modal-close").addEventListener("click", function() { homeworkModal.classList.remove("open"); });
document.getElementById("homework-cancel-btn").addEventListener("click", function() { homeworkModal.classList.remove("open"); });
homeworkModal.addEventListener("click", function(e) { if (e.target === homeworkModal) homeworkModal.classList.remove("open"); });

homeworkForm.addEventListener("submit", function(e) {
    e.preventDefault();
    const title = document.getElementById("homework-title").value.trim();
    db.collection("homework").add({
        kidId: currentKidId,
        date: homeworkTargetDate,
        title: title,
        done: false,
        ownerUid: auth.currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function() {
        showToast("숙제를 추가했어요");
        homeworkModal.classList.remove("open");
        homeworkForm.reset();
        awardMileage(5, "숙제 등록: " + title);
    }).catch(function(err) {
        showToast("추가에 실패했어요: " + err.message);
    });
});

// ✨ 준비물 체크리스트 추가/토글/삭제 (숙제와 같은 구조, 마일리지는 안 걸음)
let supplyTargetDate = null;
const supplyModal = document.getElementById("supply-modal");
const supplyForm = document.getElementById("supply-form");

function bindSupplyEvents() {
    document.querySelectorAll(".supply-add-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
            supplyTargetDate = btn.dataset.date;
            const d = new Date(supplyTargetDate);
            document.getElementById("supply-modal-title").textContent =
                `${d.getMonth() + 1}월 ${d.getDate()}일 준비물 추가`;
            supplyModal.classList.add("open");
        });
    });
    document.querySelectorAll(".supply-toggle-input").forEach(function(input) {
        input.addEventListener("change", function() {
            db.collection("supplies").doc(input.dataset.id).update({ done: input.checked });
        });
    });
    document.querySelectorAll(".supply-text").forEach(function(el) {
        el.addEventListener("click", function() {
            const item = el.closest(".supply-item");
            const input = item.querySelector(".supply-toggle-input");
            input.checked = !input.checked;
            input.dispatchEvent(new Event("change"));
        });
    });
    document.querySelectorAll(".supply-del").forEach(function(btn) {
        btn.addEventListener("click", function() {
            db.collection("supplies").doc(btn.dataset.id).delete();
        });
    });
}

document.getElementById("supply-modal-close").addEventListener("click", function() { supplyModal.classList.remove("open"); });
document.getElementById("supply-cancel-btn").addEventListener("click", function() { supplyModal.classList.remove("open"); });
supplyModal.addEventListener("click", function(e) { if (e.target === supplyModal) supplyModal.classList.remove("open"); });

supplyForm.addEventListener("submit", function(e) {
    e.preventDefault();
    const title = document.getElementById("supply-title").value.trim();
    db.collection("supplies").add({
        kidId: currentKidId,
        date: supplyTargetDate,
        title: title,
        done: false,
        ownerUid: auth.currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function() {
        showToast("준비물을 추가했어요");
        supplyModal.classList.remove("open");
        supplyForm.reset();
    }).catch(function(err) {
        showToast("추가에 실패했어요: " + err.message);
    });
});

// ✨ 화면 틀(아이 탭 + 주간 라벨)은 데이터 도착 전에 즉시 그린다
renderWeekLabel();
renderKidTabs();
renderProfileToggle();

// ✨ Firestore 실시간 동기화 — 로그인 확인이 끝난 뒤에만 구독 시작
whenAuthReady(function() {
    function onSubError(name) {
        return function(err) {
            showToast("데이터를 불러오지 못했어요. 앱을 새로고침해 주세요.");
            console.error(name + " 구독 실패:", err.message);
        };
    }

    db.collection("kids").orderBy("createdAt").onSnapshot(function(snapshot) {
        allKids = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
        if (!currentKidId && allKids.length > 0) currentKidId = allKids[0].id;
        if (currentKidId && !allKids.find(function(k) { return k.id === currentKidId; })) {
            currentKidId = allKids.length > 0 ? allKids[0].id : null;
        }
        renderKidTabs();
        renderProfileToggle();
        renderWeekDays();
    }, onSubError("kids"));

    db.collection("weekly_schedule").onSnapshot(function(snapshot) {
        allSchedule = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
        renderWeekDays();
    }, onSubError("weekly_schedule"));

    db.collection("homework").onSnapshot(function(snapshot) {
        allHomework = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
        renderWeekDays();
    }, onSubError("homework"));

    db.collection("academies").onSnapshot(function(snapshot) {
        allAcademies = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
        renderWeekDays();
    }, onSubError("academies"));

    db.collection("supplies").onSnapshot(function(snapshot) {
        allSupplies = snapshot.docs.map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); });
        renderWeekDays();
    }, onSubError("supplies"));
});
