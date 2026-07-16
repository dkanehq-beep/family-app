// ✨ 로그인 안 되어 있으면 로그인 페이지로 돌려보내기
auth.onAuthStateChanged(function(user) {
    if (!user) {
        window.location.href = "index.html";
        return;
    }
    const greetEl = document.getElementById("home-greeting");
    if (greetEl) {
        const name = user.displayName || "가족";
        greetEl.textContent = `${name}님, 오늘도 좋은 하루예요 ☀️`;
    }
});

// ✨ 현재 로그인한 사람 이름 (없으면 "가족"으로 표시)
function currentUserName() {
    return (auth.currentUser && auth.currentUser.displayName) ? auth.currentUser.displayName : "가족";
}

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
