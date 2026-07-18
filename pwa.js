// 📲 PWA 설치 지원: 서비스워커 등록 + 홈 화면 추가 배너
(function () {
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", function () {
            navigator.serviceWorker.register("sw.js").catch(function () {});
        });
    }

    const DISMISS_KEY = "pwaInstallDismissedAt";
    const DISMISS_DAYS = 14;

    function isStandalone() {
        return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    }

    function isDismissedRecently() {
        const raw = localStorage.getItem(DISMISS_KEY);
        if (!raw) return false;
        const elapsedDays = (Date.now() - Number(raw)) / (1000 * 60 * 60 * 24);
        return elapsedDays < DISMISS_DAYS;
    }

    if (isStandalone() || isDismissedRecently()) return;

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    let deferredPrompt = null;

    function buildBanner(onInstallClick) {
        const banner = document.createElement("div");
        banner.className = "pwa-install-banner";
        banner.innerHTML =
            '<img class="pwa-icon" src="icon-180.png" alt="우리 가족">' +
            '<div class="pwa-text"><strong>홈 화면에 추가</strong>' +
            (isIOS
                ? "Safari 하단 공유 버튼 → '홈 화면에 추가'를 눌러주세요"
                : "앱처럼 빠르게 접속할 수 있어요") +
            "</div>" +
            '<div class="pwa-actions">' +
            (isIOS ? "" : '<button type="button" class="pwa-install-btn">설치하기</button>') +
            '<button type="button" class="pwa-close-btn" aria-label="닫기">&times;</button>' +
            "</div>";

        document.body.appendChild(banner);
        requestAnimationFrame(function () {
            requestAnimationFrame(function () { banner.classList.add("show"); });
        });

        banner.querySelector(".pwa-close-btn").addEventListener("click", function () {
            banner.classList.remove("show");
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
            setTimeout(function () { banner.remove(); }, 400);
        });

        const installBtn = banner.querySelector(".pwa-install-btn");
        if (installBtn) {
            installBtn.addEventListener("click", function () {
                onInstallClick(banner);
            });
        }

        return banner;
    }

    if (isIOS) {
        setTimeout(function () { buildBanner(function () {}); }, 1500);
        return;
    }

    window.addEventListener("beforeinstallprompt", function (event) {
        event.preventDefault();
        deferredPrompt = event;
        const banner = buildBanner(function (bannerEl) {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            deferredPrompt.userChoice.finally(function () {
                deferredPrompt = null;
                bannerEl.classList.remove("show");
                setTimeout(function () { bannerEl.remove(); }, 400);
            });
        });
        window.addEventListener("appinstalled", function () {
            banner.classList.remove("show");
            setTimeout(function () { banner.remove(); }, 400);
        });
    });
})();
