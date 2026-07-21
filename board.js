let allPosts = [];
let currentPostId = null;
let commentUnsub = null;
let reactionUnsub = null;
const REACTION_EMOJIS = ["❤️", "👍", "😂", "😮", "😢"];

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

function formatDateTime(ts) {
    if (!ts || !ts.toDate) return "";
    const d = ts.toDate();
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ✨ 게시글 목록
function renderBoardList() {
    const listEl = document.getElementById("board-list");
    if (allPosts.length === 0) {
        listEl.innerHTML = '<p class="empty-hint">아직 글이 없어요. 오른쪽 아래 + 버튼으로 첫 글을 남겨보세요!</p>';
        return;
    }
    listEl.innerHTML = allPosts.map(function(post) {
        return `
            <div class="board-item" data-id="${post.id}">
                <h4>${escapeHtml(post.title)}</h4>
                <div class="meta">${escapeHtml(post.author)} · ${formatDateTime(post.createdAt)}</div>
                <div class="preview">${escapeHtml((post.content || "").slice(0, 60))}${(post.content || "").length > 60 ? "..." : ""}</div>
            </div>
        `;
    }).join("");
    listEl.querySelectorAll(".board-item").forEach(function(item) {
        item.addEventListener("click", function() { openPostDetail(item.dataset.id); });
    });
}

// ✨ 게시글 상세
function openPostDetail(id) {
    const post = allPosts.find(function(p) { return p.id === id; });
    if (!post) return;
    currentPostId = id;

    document.getElementById("detail-post-title").textContent = post.title;
    document.getElementById("detail-post-meta").textContent = `${post.author} · ${formatDateTime(post.createdAt)}`;
    document.getElementById("detail-post-content").textContent = post.content;
    document.getElementById("delete-post-btn").style.display = isOwner(post) ? "block" : "none";

    document.getElementById("board-list-view").style.display = "none";
    document.getElementById("board-detail-view").style.display = "block";
    window.scrollTo(0, 0);

    if (commentUnsub) commentUnsub();
    commentUnsub = db.collection("posts").doc(id).collection("comments")
        .orderBy("createdAt")
        .onSnapshot(function(snapshot) {
            const comments = snapshot.docs.map(function(doc) { return doc.data(); });
            const listEl = document.getElementById("comment-list");
            if (comments.length === 0) {
                listEl.innerHTML = "";
                return;
            }
            listEl.innerHTML = comments.map(function(c) {
                return `
                    <div class="comment-item">
                        <div class="meta">${escapeHtml(c.author)} · ${formatDateTime(c.createdAt)}</div>
                        <p>${escapeHtml(c.text)}</p>
                    </div>
                `;
            }).join("");
        });

    if (reactionUnsub) reactionUnsub();
    reactionUnsub = db.collection("posts").doc(id).collection("reactions")
        .onSnapshot(function(snapshot) {
            renderReactionBar(snapshot.docs.map(function(doc) { return Object.assign({ uid: doc.id }, doc.data()); }));
        });
}

// ✨ 이모지 반응 (부담 없이 가볍게 참여하는 용도라 마일리지는 안 걸음)
function renderReactionBar(reactions) {
    const myUid = auth.currentUser && auth.currentUser.uid;
    const myReaction = reactions.find(function(r) { return r.uid === myUid; });

    const barEl = document.getElementById("reaction-bar");
    barEl.innerHTML = REACTION_EMOJIS.map(function(emoji) {
        const count = reactions.filter(function(r) { return r.emoji === emoji; }).length;
        const isMine = myReaction && myReaction.emoji === emoji;
        return `
            <button type="button" class="reaction-btn${isMine ? " mine" : ""}" data-emoji="${emoji}">
                <span class="reaction-emoji">${emoji}</span>
                ${count > 0 ? `<span class="reaction-count">${count}</span>` : ""}
            </button>
        `;
    }).join("");

    barEl.querySelectorAll(".reaction-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
            if (!currentPostId || !myUid) return;
            const emoji = btn.dataset.emoji;
            const myRef = db.collection("posts").doc(currentPostId).collection("reactions").doc(myUid);
            if (myReaction && myReaction.emoji === emoji) {
                myRef.delete();  // 같은 이모지를 다시 누르면 반응 취소
            } else {
                myRef.set({ emoji: emoji, author: currentUserName(), createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            }
        });
    });
}

document.getElementById("back-to-list-btn").addEventListener("click", function() {
    document.getElementById("board-detail-view").style.display = "none";
    document.getElementById("board-list-view").style.display = "block";
    if (commentUnsub) { commentUnsub(); commentUnsub = null; }
    if (reactionUnsub) { reactionUnsub(); reactionUnsub = null; }
});

document.getElementById("delete-post-btn").addEventListener("click", function() {
    if (!currentPostId) return;
    if (!confirm("이 글을 삭제할까요?")) return;
    db.collection("posts").doc(currentPostId).delete().then(function() {
        showToast("글이 삭제되었어요.");
        document.getElementById("back-to-list-btn").click();
    });
});

// ✨ 댓글 작성
document.getElementById("comment-form").addEventListener("submit", function(e) {
    e.preventDefault();
    if (!currentPostId) return;
    const text = document.getElementById("comment-text").value.trim();
    db.collection("posts").doc(currentPostId).collection("comments").add({
        author: currentUserName(),
        ownerUid: auth.currentUser.uid,
        text: text,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function() {
        document.getElementById("comment-text").value = "";
        awardMileage(5, "댓글 작성", "comment");
    }).catch(function(err) {
        showToast("댓글 등록에 실패했어요: " + err.message);
    });
});

// ✨ 글쓰기 모달
const postModal = document.getElementById("post-modal");
const postForm = document.getElementById("post-form");

document.getElementById("add-post-fab").addEventListener("click", function() {
    postModal.classList.add("open");
});
function closePostModal() {
    postModal.classList.remove("open");
    postForm.reset();
}
document.getElementById("post-modal-close").addEventListener("click", closePostModal);
document.getElementById("post-cancel-btn").addEventListener("click", closePostModal);
postModal.addEventListener("click", function(e) {
    if (e.target === postModal) closePostModal();
});

postForm.addEventListener("submit", function(e) {
    e.preventDefault();
    const data = {
        title: document.getElementById("post-title").value.trim(),
        content: document.getElementById("post-content").value.trim(),
        author: currentUserName(),
        ownerUid: auth.currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    db.collection("posts").add(data).then(function() {
        showToast("글이 등록되었어요 ✏️");
        closePostModal();
        awardMileage(15, "게시글 작성", "post");
    }).catch(function(err) {
        showToast("등록에 실패했어요: " + err.message);
    });
});

// ✨ Firestore 실시간 동기화 — 로그인 확인 후 구독 시작
renderBoardList();
whenAuthReady(function() {
    db.collection("posts").orderBy("createdAt", "desc").onSnapshot(function(snapshot) {
        allPosts = snapshot.docs.map(function(doc) {
            return Object.assign({ id: doc.id }, doc.data());
        });
        renderBoardList();
    });
});
