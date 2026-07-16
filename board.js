let allPosts = [];
let currentPostId = null;
let commentUnsub = null;

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
}

document.getElementById("back-to-list-btn").addEventListener("click", function() {
    document.getElementById("board-detail-view").style.display = "none";
    document.getElementById("board-list-view").style.display = "block";
    if (commentUnsub) { commentUnsub(); commentUnsub = null; }
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
        text: text,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function() {
        document.getElementById("comment-text").value = "";
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
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    db.collection("posts").add(data).then(function() {
        showToast("글이 등록되었어요 ✏️");
        closePostModal();
    });
});

// ✨ Firestore 실시간 동기화
db.collection("posts").orderBy("createdAt", "desc").onSnapshot(function(snapshot) {
    allPosts = snapshot.docs.map(function(doc) {
        return Object.assign({ id: doc.id }, doc.data());
    });
    renderBoardList();
});
