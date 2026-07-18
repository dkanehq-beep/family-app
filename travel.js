let allTrips = [];
let mainMap, mainMarkersLayer;
let pickMap, pickMarker;
let pickedLat = null, pickedLng = null;

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

bindHybridPicker("trip-date", "trip-date-native", '[data-for="trip-date-native"]');

// ✨ 메인 지도 (전체 여행 핀)
function initMainMap() {
    mainMap = L.map("travel-map").setView([20, 30], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap"
    }).addTo(mainMap);
    mainMarkersLayer = L.layerGroup().addTo(mainMap);
}

function renderMainMapMarkers() {
    mainMarkersLayer.clearLayers();
    const bounds = [];
    allTrips.forEach(function(trip) {
        if (typeof trip.lat !== "number" || typeof trip.lng !== "number") return;
        const marker = L.marker([trip.lat, trip.lng]).addTo(mainMarkersLayer);
        marker.bindPopup(`<b>${escapeHtml(trip.title)}</b><br>${escapeHtml(trip.location)}`);
        marker.on("click", function() { openTripDetail(trip.id); });
        bounds.push([trip.lat, trip.lng]);
    });
    if (bounds.length > 0) {
        mainMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 6 });
    }
}

// ✨ 여행 카드 그리드
function renderTripGrid() {
    const grid = document.getElementById("trip-grid");
    if (allTrips.length === 0) {
        grid.innerHTML = '<p class="empty-hint">아직 등록된 여행이 없어요. 오른쪽 아래 + 버튼으로 첫 여행을 남겨보세요!</p>';
        return;
    }
    const sorted = allTrips.slice().sort(function(a, b) { return (b.date || "").localeCompare(a.date || ""); });
    grid.innerHTML = sorted.map(function(trip) {
        const thumb = (trip.photoUrls && trip.photoUrls[0])
            ? `<img class="trip-card-img" src="${trip.photoUrls[0]}" alt="${escapeHtml(trip.title)}">`
            : `<div class="trip-card-img"></div>`;
        return `
            <div class="trip-card" data-id="${trip.id}">
                ${thumb}
                <div class="trip-card-body">
                    <span>${escapeHtml(trip.location)}</span>
                    <h4>${escapeHtml(trip.title)}</h4>
                    <p>${trip.date || ""} · ${escapeHtml(trip.author)}</p>
                </div>
            </div>
        `;
    }).join("");
    grid.querySelectorAll(".trip-card").forEach(function(card) {
        card.addEventListener("click", function() { openTripDetail(card.dataset.id); });
    });
}

// ✨ 여행 상세 모달
const tripDetailModal = document.getElementById("trip-detail-modal");
let currentDetailTripId = null;

function openTripDetail(id) {
    const trip = allTrips.find(function(t) { return t.id === id; });
    if (!trip) return;
    currentDetailTripId = id;

    document.getElementById("detail-location").textContent = trip.location;
    document.getElementById("detail-title").textContent = trip.title;
    document.getElementById("detail-meta").textContent = `${trip.date || ""} · ${trip.author}`;
    document.getElementById("detail-memo").textContent = trip.memo || "";

    const photosEl = document.getElementById("detail-photos");
    if (trip.photoUrls && trip.photoUrls.length > 0) {
        photosEl.innerHTML = trip.photoUrls.map(function(url) {
            return `<img src="${url}" style="width:100%;border-radius:12px;">`;
        }).join("");
    } else {
        photosEl.innerHTML = "";
    }

    document.getElementById("trip-delete-btn").style.display = isOwner(trip) ? "block" : "none";

    tripDetailModal.classList.add("open");
}

document.getElementById("trip-detail-close").addEventListener("click", function() {
    tripDetailModal.classList.remove("open");
});
tripDetailModal.addEventListener("click", function(e) {
    if (e.target === tripDetailModal) tripDetailModal.classList.remove("open");
});
document.getElementById("trip-delete-btn").addEventListener("click", function() {
    if (!currentDetailTripId) return;
    if (!confirm("이 여행 기록을 삭제할까요? 사진도 함께 사라져요.")) return;
    db.collection("trips").doc(currentDetailTripId).delete()
        .then(function() {
            showToast("여행 기록이 삭제되었어요.");
            tripDetailModal.classList.remove("open");
        });
});

// ✨ 여행 추가 모달 + 지도 위치 선택
const tripModal = document.getElementById("trip-modal");
const tripForm = document.getElementById("trip-form");

function openTripModal() {
    tripModal.classList.add("open");
    pickedLat = null;
    pickedLng = null;
    setTimeout(function() {
        if (!pickMap) {
            pickMap = L.map("pick-map").setView([37.5665, 126.9780], 3);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: "© OpenStreetMap"
            }).addTo(pickMap);
            pickMap.on("click", function(e) {
                pickedLat = e.latlng.lat;
                pickedLng = e.latlng.lng;
                if (pickMarker) pickMap.removeLayer(pickMarker);
                pickMarker = L.marker(e.latlng).addTo(pickMap);
            });
        }
        pickMap.invalidateSize();
    }, 100);
}

function closeTripModal() {
    tripModal.classList.remove("open");
    tripForm.reset();
    if (pickMarker && pickMap) { pickMap.removeLayer(pickMarker); pickMarker = null; }
    pickedLat = null;
    pickedLng = null;
}

document.getElementById("add-trip-fab").addEventListener("click", openTripModal);
document.getElementById("trip-modal-close").addEventListener("click", closeTripModal);
document.getElementById("trip-cancel-btn").addEventListener("click", closeTripModal);
tripModal.addEventListener("click", function(e) {
    if (e.target === tripModal) closeTripModal();
});

tripForm.addEventListener("submit", function(e) {
    e.preventDefault();
    if (pickedLat === null) {
        showToast("지도를 클릭해서 위치를 표시해 주세요.");
        return;
    }

    const submitBtn = document.getElementById("trip-submit-btn");
    submitBtn.disabled = true;
    submitBtn.textContent = "등록 중...";

    const title = document.getElementById("trip-title").value.trim();
    const location = document.getElementById("trip-location").value.trim();
    const date = document.getElementById("trip-date").value;
    const memo = document.getElementById("trip-memo").value.trim();
    const author = currentUserName();
    const files = document.getElementById("trip-photos").files;

    const uploadPromises = [];
    if (storage) {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const path = `trips/${Date.now()}_${i}_${file.name}`;
            const ref = storage.ref(path);
            uploadPromises.push(ref.put(file).then(function(snap) { return snap.ref.getDownloadURL(); }));
        }
    }

    Promise.all(uploadPromises)
        .then(function(photoUrls) {
            return db.collection("trips").add({
                title: title,
                location: location,
                lat: pickedLat,
                lng: pickedLng,
                date: date,
                memo: memo,
                author: author,
                ownerUid: auth.currentUser.uid,
                photoUrls: photoUrls,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        })
        .then(function() {
            showToast("여행 추억이 등록되었어요 ✈️");
            closeTripModal();
        })
        .catch(function(err) {
            showToast("등록에 실패했어요: " + err.message);
        })
        .finally(function() {
            submitBtn.disabled = false;
            submitBtn.textContent = "등록하기";
        });
});

// ✨ Firestore 실시간 동기화
initMainMap();
db.collection("trips").onSnapshot(function(snapshot) {
    allTrips = snapshot.docs.map(function(doc) {
        return Object.assign({ id: doc.id }, doc.data());
    });
    renderTripGrid();
    renderMainMapMarkers();
});
