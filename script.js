/* ============================================
   testPage — Client-Side Logic
   Batch Publish Blog via GitHub API
============================================ */

// ============ CONFIGURATION ============
const GITHUB_OWNER = "YOUR_GITHUB_USERNAME";
const GITHUB_REPO = "YOUR_REPO_NAME";
const GITHUB_BRANCH = "main";
const POSTS_FILE_PATH = "posts.json";
const DEBUG = true;

const ADMIN_USERNAME_HASH =
  "575aad173fe88daee328513f7863c40938ac02bfda2c3e384d3c5c5a83d0e3cf";
const ADMIN_PASSWORD_HASH =
  "db7009bbc0ea420246146b8336df6f33f7e67d7f1389c1f58496d012a2f29e39";

// State
let serverPosts = [];       // What's currently on GitHub
let localPosts = [];        // What admin sees (with pending changes)
let pendingAdds = [];       // IDs of posts added locally but not published
let pendingDeletes = [];    // IDs of posts marked for deletion
let fileSha = null;
let githubToken = null;

function log(...args) {
  if (DEBUG) console.log("[BLOG]", ...args);
}

// ============ SHA-256 ============
async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============ STATUS INDICATOR ============
function showStatus(message, type = "saving") {
  const existing = document.querySelector(".save-status");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.className = `save-status ${type}`;
  el.textContent = message;
  document.body.appendChild(el);

  if (type === "success" || type === "error") {
    setTimeout(() => {
      if (el.parentNode) el.remove();
    }, 4000);
  }

  return el;
}

// ============ PENDING CHANGES ============
function hasPendingChanges() {
  return pendingAdds.length > 0 || pendingDeletes.length > 0;
}

function updatePublishButton() {
  const btn = document.getElementById("publish-btn");
  if (!btn) return;

  const hasChanges = hasPendingChanges();
  btn.disabled = !hasChanges;

  if (hasChanges) {
    btn.classList.add("has-changes");
    const total = pendingAdds.length + pendingDeletes.length;

    // Remove old badge
    const oldBadge = btn.querySelector(".change-badge");
    if (oldBadge) oldBadge.remove();

    const badge = document.createElement("span");
    badge.className = "change-badge";
    badge.textContent = total;
    btn.appendChild(badge);
  } else {
    btn.classList.remove("has-changes");
    const oldBadge = btn.querySelector(".change-badge");
    if (oldBadge) oldBadge.remove();
  }
}

// ============ GITHUB API ============
async function fetchPostsFromGitHub() {
  try {
    log("Fetching posts from GitHub...");

    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${POSTS_FILE_PATH}?ref=${GITHUB_BRANCH}`;

    const headers = {
      Accept: "application/vnd.github.v3+json",
    };

    if (githubToken) {
      headers["Authorization"] = `Bearer ${githubToken}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        log("posts.json not found, starting fresh");
        serverPosts = [];
        fileSha = null;
        return [];
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    fileSha = data.sha;

    const decoded = decodeURIComponent(
      escape(atob(data.content.replace(/\n/g, "")))
    );
    const posts = JSON.parse(decoded);

    serverPosts = JSON.parse(JSON.stringify(posts));
    log("Loaded", posts.length, "posts from GitHub");
    return posts;
  } catch (err) {
    console.error("Failed to fetch posts:", err);
    return serverPosts;
  }
}

async function savePostsToGitHub(posts) {
  if (!githubToken) {
    alert("Not authenticated!");
    return false;
  }

  const statusEl = showStatus("SAVING TO GITHUB...", "saving");

  try {
    // Get fresh SHA
    const shaUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${POSTS_FILE_PATH}?ref=${GITHUB_BRANCH}`;
    const shaResponse = await fetch(shaUrl, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (shaResponse.ok) {
      const shaData = await shaResponse.json();
      fileSha = shaData.sha;
    } else if (shaResponse.status === 404) {
      fileSha = null;
    } else {
      throw new Error(`Failed to get SHA: ${shaResponse.status}`);
    }

    const content = JSON.stringify(posts, null, 2);
    const encodedContent = btoa(unescape(encodeURIComponent(content)));

    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${POSTS_FILE_PATH}`;

    const body = {
      message: `Update blog posts — ${new Date().toISOString()}`,
      content: encodedContent,
      branch: GITHUB_BRANCH,
    };

    if (fileSha) {
      body.sha = fileSha;
    }

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(
        `GitHub API error ${response.status}: ${responseData.message || ""}`
      );
    }

    fileSha = responseData.content.sha;
    log("Save successful! New SHA:", fileSha);

    statusEl.remove();
    showStatus("PUBLISHED!", "success");
    return true;
  } catch (err) {
    console.error("Failed to save:", err);
    statusEl.remove();
    showStatus("PUBLISH FAILED!", "error");
    alert(`Failed to publish: ${err.message}`);
    return false;
  }
}

async function uploadImageToGitHub(base64Data, filename) {
  if (!githubToken) return null;

  try {
    log("Uploading image:", filename);

    const pureBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const path = `blog-images/${filename}`;
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

    let existingSha = null;
    try {
      const checkResponse = await fetch(url, {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });
      if (checkResponse.ok) {
        const checkData = await checkResponse.json();
        existingSha = checkData.sha;
      }
    } catch {
      // doesn't exist
    }

    const body = {
      message: `Add blog image: ${filename}`,
      content: pureBase64,
      branch: GITHUB_BRANCH,
    };

    if (existingSha) body.sha = existingSha;

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);

    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`;
    log("Image uploaded:", rawUrl);
    return rawUrl;
  } catch (err) {
    console.error("Image upload failed:", err);
    return null;
  }
}

// ============ STAR BACKGROUND ============
function initStars() {
  const canvas = document.getElementById("stars-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  const stars = [];
  for (let i = 0; i < 180; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 1.5 + 0.3,
      alpha: Math.random(),
      speed: Math.random() * 0.015 + 0.003,
      maxAlpha: Math.random() * 0.5 + 0.5,
    });
  }

  let shootingStar = null;

  function maybeSpawnShootingStar() {
    if (Math.random() < 0.003 && !shootingStar) {
      shootingStar = {
        x: Math.random() * canvas.width * 0.6,
        y: Math.random() * canvas.height * 0.4,
        length: 40 + Math.random() * 60,
        speed: 4 + Math.random() * 4,
        angle: Math.PI / 4 + (Math.random() - 0.5) * 0.3,
        alpha: 1,
        life: 0,
        maxLife: 30 + Math.random() * 20,
      };
    }
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const star of stars) {
      star.alpha += star.speed;
      if (star.alpha >= star.maxAlpha || star.alpha <= 0.05) {
        star.speed *= -1;
        star.alpha = Math.max(0.05, Math.min(star.alpha, star.maxAlpha));
      }
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220, 210, 255, ${star.alpha})`;
      ctx.fill();
    }

    maybeSpawnShootingStar();
    if (shootingStar) {
      const s = shootingStar;
      s.life++;
      s.x += Math.cos(s.angle) * s.speed;
      s.y += Math.sin(s.angle) * s.speed;
      s.alpha = 1 - s.life / s.maxLife;

      const tailX = s.x - Math.cos(s.angle) * s.length;
      const tailY = s.y - Math.sin(s.angle) * s.length;

      const gradient = ctx.createLinearGradient(s.x, s.y, tailX, tailY);
      gradient.addColorStop(0, `rgba(255, 255, 255, ${s.alpha})`);
      gradient.addColorStop(1, `rgba(255, 255, 255, 0)`);

      ctx.beginPath();
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.5;
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
      ctx.fill();

      if (s.life >= s.maxLife) shootingStar = null;
    }

    requestAnimationFrame(animate);
  }

  animate();
}

// ============ RENDERING ============
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function parseMarkdown(text) {
  if (!text) return "";
  let md = escapeHtml(text);

  md = md.replace(/^###### (.*)$/gm, "<h6>$1</h6>");
  md = md.replace(/^##### (.*)$/gm, "<h5>$1</h5>");
  md = md.replace(/^#### (.*)$/gm, "<h4>$1</h4>");
  md = md.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  md = md.replace(/^## (.*)$/gm, "<h2>$1</h2>");
  md = md.replace(/^# (.*)$/gm, "<h1>$1</h1>");

  md = md.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  md = md.replace(/\*(.+?)\*/g, "<em>$1</em>");

  md = md.replace(
    /\{color:(.+?)\}(.+?)\{\/color\}/g,
    '<span style="color:$1; text-shadow: 0 0 5px $1" class="preview-color-span">$2</span>'
  );

  md = md.replace(/\n/g, "<br>");
  return md;
}

function getVisiblePosts() {
  const isAdmin = sessionStorage.getItem("testpage_admin") === "true";

  if (isAdmin) {
    // Admin sees everything: local posts (including pending adds)
    // but posts pending deletion are shown as faded
    return localPosts;
  } else {
    // Visitors only see what's on the server
    return serverPosts;
  }
}

function renderPosts() {
  const container = document.getElementById("blog-posts");
  if (!container) return;

  const isAdmin = sessionStorage.getItem("testpage_admin") === "true";
  const posts = getVisiblePosts();

  container.innerHTML = "";

  if (posts.length === 0) {
    const empty = document.createElement("p");
    empty.style.cssText =
      "font-size:0.7rem;color:var(--text-muted);text-align:center;padding:12px 0;";
    empty.textContent = "No posts yet...";
    container.appendChild(empty);
    return;
  }

  posts.forEach((post) => {
    const postEl = document.createElement("div");
    postEl.className = "blog-post";

    const isNew = pendingAdds.includes(post.id);
    const isDeleted = pendingDeletes.includes(post.id);

    if (isNew) postEl.classList.add("unpublished");
    if (isDeleted) postEl.classList.add("deleted-pending");

    let deleteBtn = "";
    if (isAdmin && !isDeleted) {
      deleteBtn = `<button class="delete-post-btn" data-id="${post.id}" title="Delete post">&#10005;</button>`;
    }

    // Undo delete button for pending deletes
    let undoBtn = "";
    if (isAdmin && isDeleted) {
      undoBtn = `<button class="delete-post-btn" data-id="${post.id}" title="Undo delete" style="background:var(--accent-green);">&#8634;</button>`;
    }

    let imageContent = `<span class="heart-mini">&#10084;</span>`;
    if (post.images && post.images.length > 0) {
      imageContent = `<img src="${post.images[0]}" alt="Post image">`;
    } else if (post.image) {
      imageContent = `<img src="${post.image}" alt="Post image">`;
    }

    const title = post.title ? escapeHtml(post.title) : "UNTITLED POST";
    const titleStyle = post.titleColor
      ? `style="color:${post.titleColor};text-shadow:0 0 5px ${post.titleColor}"`
      : "";

    const previewContent = parseMarkdown(post.content);

    const unpublishedTag = isNew
      ? `<span class="unpublished-tag">DRAFT</span>`
      : "";

    const deletedTag = isDeleted
      ? `<span class="unpublished-tag" style="color:var(--accent-red);text-shadow:0 0 5px var(--accent-red);">PENDING DELETE</span>`
      : "";

    postEl.innerHTML = `
      <div class="blog-post-date">
        ${escapeHtml(post.date)}${unpublishedTag}${deletedTag}
      </div>
      <div class="blog-post-body">
        <div class="blog-post-text">
          <strong ${titleStyle}>${title}</strong><br>
          <span class="preview-text">${previewContent}</span>
        </div>
        <div class="blog-post-image">
          ${imageContent}
        </div>
      </div>
      ${deleteBtn}${undoBtn}
    `;

    if (!isDeleted) {
      postEl.addEventListener("click", (e) => {
        if (e.target.closest(".delete-post-btn")) return;
        openPostDetail(post);
      });
    }

    container.appendChild(postEl);
  });

  // Delete handlers
  if (isAdmin) {
    container.querySelectorAll(".delete-post-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const isCurrentlyDeleted = pendingDeletes.includes(id);

        if (isCurrentlyDeleted) {
          // Undo the delete
          pendingDeletes = pendingDeletes.filter((d) => d !== id);
          log("Undo delete:", id);
        } else {
          // Check if this is a pending add — if so, just remove it entirely
          if (pendingAdds.includes(id)) {
            localPosts = localPosts.filter((p) => p.id !== id);
            pendingAdds = pendingAdds.filter((a) => a !== id);
            log("Removed draft:", id);
          } else {
            // Mark existing post for deletion
            pendingDeletes.push(id);
            log("Marked for deletion:", id);
          }
        }

        updatePublishButton();
        renderPosts();
      });
    });
  }

  updatePublishButton();
}

function addPostLocally(title, content, color, imageUrls = [], titleColor = null) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);

  const newPost = {
    id: "post-" + Date.now(),
    date: `${dd}/${mm}/${yy}`,
    title: title || "UNTITLED POST",
    titleColor: titleColor,
    content: content,
    color: color || "#ffffff",
    images: imageUrls,
  };

  localPosts.unshift(newPost);
  pendingAdds.push(newPost.id);

  log("Added draft post:", newPost.id, newPost.title);
  log("Pending adds:", pendingAdds.length, "Pending deletes:", pendingDeletes.length);

  updatePublishButton();
  renderPosts();

  return true;
}

async function publishChanges() {
  if (!hasPendingChanges()) return;

  log("Publishing changes...");
  log("Adds:", pendingAdds.length, "Deletes:", pendingDeletes.length);

  // Start from fresh server state
  await fetchPostsFromGitHub();

  // Build final post list
  let finalPosts = JSON.parse(JSON.stringify(serverPosts));

  // Remove deleted posts
  finalPosts = finalPosts.filter((p) => !pendingDeletes.includes(p.id));

  // Add new posts at the top
  const newPosts = localPosts.filter((p) => pendingAdds.includes(p.id));
  finalPosts = [...newPosts, ...finalPosts];

  log("Final post count:", finalPosts.length);

  // Save to GitHub
  const success = await savePostsToGitHub(finalPosts);

  if (success) {
    // Update all state
    serverPosts = JSON.parse(JSON.stringify(finalPosts));
    localPosts = JSON.parse(JSON.stringify(finalPosts));
    pendingAdds = [];
    pendingDeletes = [];

    updatePublishButton();
    renderPosts();
    log("Publish complete!");
  } else {
    // Restore local state from server
    log("Publish failed, keeping local changes");
  }
}

function openPostDetail(post) {
  const detailModal = document.getElementById("post-detail-modal");
  const detailContent = document.getElementById("post-detail-content");
  if (!detailModal || !detailContent) return;

  const images = post.images || (post.image ? [post.image] : []);
  let imagesHtml = "";

  if (images.length > 0) {
    imagesHtml = `<div class="blog-divider"></div><div class="post-images-stack">`;
    images.forEach((img, index) => {
      imagesHtml += `<img class="post-detail-image" src="${img}" alt="Post image" data-index="${index}">`;
    });
    imagesHtml += `</div>`;
  }

  const titleStyle = post.titleColor
    ? `style="color:${post.titleColor};text-shadow:0 0 5px ${post.titleColor}"`
    : "";

  detailContent.innerHTML = `
    <h2 ${titleStyle}>${escapeHtml(post.title || "BLOG POST")}</h2>
    <div class="post-detail-date">${escapeHtml(post.date)}</div>
    <div class="post-detail-content" style="color: ${post.color || "inherit"}">${parseMarkdown(post.content)}</div>
    ${imagesHtml}
  `;

  detailContent.querySelectorAll(".post-detail-image").forEach((img) => {
    img.addEventListener("click", () => openLightbox(img.src));
  });

  detailModal.classList.remove("hidden");
}

function showPublishModal() {
  const modal = document.getElementById("publish-modal");
  const summary = document.getElementById("publish-summary");
  if (!modal || !summary) return;

  let html = "";

  if (pendingAdds.length > 0) {
    html += `<p><span class="summary-add">+ ${pendingAdds.length} NEW POST${pendingAdds.length > 1 ? "S" : ""}</span></p>`;
    pendingAdds.forEach((id) => {
      const post = localPosts.find((p) => p.id === id);
      if (post) {
        html += `<p style="font-size:0.55rem;color:var(--text-muted);">  "${escapeHtml(post.title || "UNTITLED")}"</p>`;
      }
    });
  }

  if (pendingDeletes.length > 0) {
    html += `<p style="margin-top:8px;"><span class="summary-delete">- ${pendingDeletes.length} DELETED POST${pendingDeletes.length > 1 ? "S" : ""}</span></p>`;
    pendingDeletes.forEach((id) => {
      const post = localPosts.find((p) => p.id === id);
      if (post) {
        html += `<p style="font-size:0.55rem;color:var(--text-muted);">  "${escapeHtml(post.title || "UNTITLED")}"</p>`;
      }
    });
  }

  summary.innerHTML = html;
  modal.classList.remove("hidden");
}

// ============ LIGHTBOX ============
const lightboxModal = document.getElementById("lightbox-modal");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxClose = document.querySelector(".lightbox-close-btn");

function openLightbox(src) {
  if (lightboxModal && lightboxImg) {
    lightboxImg.src = src;
    lightboxModal.classList.remove("hidden");
  }
}

function closeLightbox() {
  if (lightboxModal) {
    lightboxModal.classList.add("hidden");
    setTimeout(() => {
      if (lightboxImg) lightboxImg.src = "";
    }, 200);
  }
}

if (lightboxClose) lightboxClose.addEventListener("click", closeLightbox);
if (lightboxModal) {
  lightboxModal.addEventListener("click", (e) => {
    if (e.target !== lightboxImg) closeLightbox();
  });
}

// ============ IMAGE COMPRESSION ============
function compressImage(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

// ============ EDITOR TOOLBAR ============
let historyStack = [];
let historyIndex = -1;

function saveHistory() {
  const textarea = document.getElementById("post-content");
  if (!textarea) return;
  const val = textarea.value;
  if (historyIndex >= 0 && historyStack[historyIndex] === val) return;
  if (historyIndex < historyStack.length - 1) {
    historyStack = historyStack.slice(0, historyIndex + 1);
  }
  historyStack.push(val);
  historyIndex++;
  if (historyStack.length > 50) {
    historyStack.shift();
    historyIndex--;
  }
}

function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    document.getElementById("post-content").value = historyStack[historyIndex];
  }
}

function redo() {
  if (historyIndex < historyStack.length - 1) {
    historyIndex++;
    document.getElementById("post-content").value = historyStack[historyIndex];
  }
}

function insertMarkdown(startTag, endTag) {
  const textarea = document.getElementById("post-content");
  if (!textarea) return;
  saveHistory();
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selection = textarea.value.substring(start, end);
  textarea.setRangeText(startTag + selection + endTag, start, end, "select");
  textarea.focus();
  saveHistory();
}

function insertColor() {
  const colorPicker = document.getElementById("editor-color");
  const color = colorPicker ? colorPicker.value : "#ffffff";
  insertMarkdown(`{color:${color}}`, `{/color}`);
}

document.addEventListener("DOMContentLoaded", () => {
  const btnBold = document.getElementById("btn-bold");
  if (btnBold) btnBold.addEventListener("click", () => insertMarkdown("**", "**"));

  const btnItalic = document.getElementById("btn-italic");
  if (btnItalic) btnItalic.addEventListener("click", () => insertMarkdown("*", "*"));

  const btnHeader = document.getElementById("btn-header");
  if (btnHeader) btnHeader.addEventListener("click", () => insertMarkdown("### ", ""));

  const btnColorApply = document.getElementById("btn-color-apply");
  if (btnColorApply) btnColorApply.addEventListener("click", insertColor);

  const btnUndo = document.getElementById("btn-undo");
  if (btnUndo) btnUndo.addEventListener("click", undo);

  const btnRedo = document.getElementById("btn-redo");
  if (btnRedo) btnRedo.addEventListener("click", redo);

  const textarea = document.getElementById("post-content");
  if (textarea) {
    saveHistory();
    textarea.addEventListener("input", () => saveHistory());
  }
});

// ============ AUTH ============
async function attemptLogin(username, password) {
  const usernameHash = await sha256(username);
  const passwordHash = await sha256(password);
  return (
    usernameHash === ADMIN_USERNAME_HASH &&
    passwordHash === ADMIN_PASSWORD_HASH
  );
}

function setAdminMode(enabled) {
  const loginBtn = document.getElementById("admin-login-btn");
  const logoutBtn = document.getElementById("admin-logout-btn");
  const adminActions = document.getElementById("admin-blog-actions");

  if (enabled) {
    sessionStorage.setItem("testpage_admin", "true");
    // Sync local posts with server
    localPosts = JSON.parse(JSON.stringify(serverPosts));
    pendingAdds = [];
    pendingDeletes = [];
  } else {
    sessionStorage.removeItem("testpage_admin");
    githubToken = null;
    pendingAdds = [];
    pendingDeletes = [];
  }

  if (loginBtn) loginBtn.classList.toggle("hidden", enabled);
  if (logoutBtn) logoutBtn.classList.toggle("hidden", !enabled);
  if (adminActions) adminActions.classList.toggle("hidden", !enabled);

  updatePublishButton();
  renderPosts();
}

// ============ MAIN INIT ============
document.addEventListener("DOMContentLoaded", async () => {
  initStars();

  // Load from GitHub
  const statusEl = showStatus("LOADING POSTS...", "saving");
  try {
    await fetchPostsFromGitHub();
    localPosts = JSON.parse(JSON.stringify(serverPosts));
    statusEl.remove();
  } catch {
    statusEl.remove();
    showStatus("FAILED TO LOAD", "error");
  }
  renderPosts();

  setAdminMode(false);

  // --- Login Modal ---
  const loginModal = document.getElementById("login-modal");
  const loginBtn = document.getElementById("admin-login-btn");
  const logoutBtn = document.getElementById("admin-logout-btn");
  const loginSubmit = document.getElementById("login-submit-btn");
  const loginCancel = document.getElementById("login-cancel-btn");
  const loginError = document.getElementById("login-error");
  const usernameInput = document.getElementById("login-username");
  const passwordInput = document.getElementById("login-password");
  const tokenInput = document.getElementById("login-token");

  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      loginModal.classList.remove("hidden");
      usernameInput.value = "";
      passwordInput.value = "";
      tokenInput.value = "";
      loginError.classList.add("hidden");
      setTimeout(() => usernameInput.focus(), 100);
    });
  }

  if (loginCancel) {
    loginCancel.addEventListener("click", () => loginModal.classList.add("hidden"));
  }

  if (loginSubmit) {
    loginSubmit.addEventListener("click", async () => {
      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      const token = tokenInput.value.trim();

      if (!username || !password || !token) {
        loginError.textContent = "FILL IN ALL FIELDS!";
        loginError.classList.remove("hidden");
        return;
      }

      loginSubmit.textContent = "CHECKING...";
      loginSubmit.disabled = true;

      const credentialsOk = await attemptLogin(username, password);
      if (!credentialsOk) {
        loginError.textContent = "WRONG CREDENTIALS!";
        loginError.classList.remove("hidden");
        loginSubmit.textContent = "LOGIN";
        loginSubmit.disabled = false;
        return;
      }

      // Verify token
      try {
        const testResponse = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github.v3+json",
            },
          }
        );

        if (!testResponse.ok) {
          loginError.textContent = "INVALID GITHUB TOKEN!";
          loginError.classList.remove("hidden");
          loginSubmit.textContent = "LOGIN";
          loginSubmit.disabled = false;
          return;
        }

        const repoData = await testResponse.json();
        if (!repoData.permissions || !repoData.permissions.push) {
          loginError.textContent = "TOKEN LACKS WRITE ACCESS!";
          loginError.classList.remove("hidden");
          loginSubmit.textContent = "LOGIN";
          loginSubmit.disabled = false;
          return;
        }
      } catch {
        loginError.textContent = "TOKEN CHECK FAILED!";
        loginError.classList.remove("hidden");
        loginSubmit.textContent = "LOGIN";
        loginSubmit.disabled = false;
        return;
      }

      githubToken = token;
      loginModal.classList.add("hidden");
      setAdminMode(true);
      showStatus("LOGGED IN!", "success");

      loginSubmit.textContent = "LOGIN";
      loginSubmit.disabled = false;
    });
  }

  if (passwordInput) {
    passwordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") tokenInput.focus();
    });
  }

  if (tokenInput) {
    tokenInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") loginSubmit.click();
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      if (hasPendingChanges()) {
        if (!confirm("You have unpublished changes! They will be lost. Logout anyway?")) {
          return;
        }
      }
      setAdminMode(false);
      showStatus("LOGGED OUT", "success");
    });
  }

  // --- New Post Modal ---
  const newPostModal = document.getElementById("new-post-modal");
  const newPostBtn = document.getElementById("new-post-btn");
  const postSubmit = document.getElementById("post-submit-btn");
  const postCancel = document.getElementById("post-cancel-btn");
  const postContentInput = document.getElementById("post-content");

  if (newPostBtn) {
    newPostBtn.addEventListener("click", () => {
      newPostModal.classList.remove("hidden");
      postContentInput.value = "";

      const titleInput = document.getElementById("post-title");
      if (titleInput) titleInput.value = "";

      const titleColorInput = document.getElementById("post-title-color");
      if (titleColorInput) titleColorInput.value = "#ff00de";

      const colorInput = document.getElementById("post-color");
      if (colorInput) colorInput.value = "#ffffff";

      const imgInput = document.getElementById("post-image");
      if (imgInput) imgInput.value = "";

      const preview = document.getElementById("image-preview");
      if (preview) {
        preview.innerHTML = "";
        preview.classList.remove("show");
      }

      historyStack = [];
      historyIndex = -1;
      saveHistory();

      setTimeout(() => postContentInput.focus(), 100);
    });
  }

  if (postCancel) {
    postCancel.addEventListener("click", () => newPostModal.classList.add("hidden"));
  }

  if (postSubmit) {
    postSubmit.addEventListener("click", async () => {
      const content = postContentInput.value.trim();
      const title = document.getElementById("post-title").value.trim();
      const titleColor = document.getElementById("post-title-color").value;
      const color = document.getElementById("post-color").value;
      const imgInput = document.getElementById("post-image");
      const hasImages = imgInput && imgInput.files && imgInput.files.length > 0;

      if (!content && !hasImages) {
        alert("Enter text or select an image!");
        return;
      }

      postSubmit.textContent = "PROCESSING...";
      postSubmit.disabled = true;

      const imageUrls = [];

      if (hasImages) {
        for (let i = 0; i < imgInput.files.length; i++) {
          try {
            showStatus(`COMPRESSING IMAGE ${i + 1}...`, "saving");
            const compressed = await compressImage(imgInput.files[i]);

            showStatus(`UPLOADING IMAGE ${i + 1}...`, "saving");
            const timestamp = Date.now();
            const filename = `img-${timestamp}-${i}.jpg`;
            const url = await uploadImageToGitHub(compressed, filename);

            if (url) {
              imageUrls.push(url);
            }
          } catch (e) {
            console.error("Image failed:", e);
          }
        }
        showStatus("IMAGES UPLOADED!", "success");
      }

      addPostLocally(title, content, color, imageUrls, titleColor);

      newPostModal.classList.add("hidden");
      postContentInput.value = "";

      const titleEl = document.getElementById("post-title");
      if (titleEl) titleEl.value = "";
      const titleColorEl = document.getElementById("post-title-color");
      if (titleColorEl) titleColorEl.value = "#ff00de";
      imgInput.value = "";
      const preview = document.getElementById("image-preview");
      if (preview) {
        preview.innerHTML = "";
        preview.classList.remove("show");
      }

      postSubmit.textContent = "ADD POST";
      postSubmit.disabled = false;
    });
  }

  if (postContentInput) {
    postContentInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.ctrlKey) postSubmit.click();
    });
  }

  // --- Publish Button ---
  const publishBtn = document.getElementById("publish-btn");
  if (publishBtn) {
    publishBtn.addEventListener("click", () => {
      if (hasPendingChanges()) {
        showPublishModal();
      }
    });
  }

  // --- Publish Modal ---
  const publishModal = document.getElementById("publish-modal");
  const publishConfirm = document.getElementById("publish-confirm-btn");
  const publishCancel = document.getElementById("publish-cancel-btn");

  if (publishConfirm) {
    publishConfirm.addEventListener("click", async () => {
      publishConfirm.textContent = "PUBLISHING...";
      publishConfirm.disabled = true;

      await publishChanges();

      publishConfirm.textContent = "PUBLISH";
      publishConfirm.disabled = false;
      publishModal.classList.add("hidden");
    });
  }

  if (publishCancel) {
    publishCancel.addEventListener("click", () => {
      publishModal.classList.add("hidden");
    });
  }

  if (publishModal) {
    publishModal.addEventListener("click", (e) => {
      if (e.target === publishModal) publishModal.classList.add("hidden");
    });
  }

  // Close modals on overlay click
  [loginModal, newPostModal].forEach((modal) => {
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.add("hidden");
      });
    }
  });

  // Post detail modal
  const postDetailModal = document.getElementById("post-detail-modal");
  const postDetailClose = document.getElementById("post-detail-close");

  if (postDetailClose) {
    postDetailClose.addEventListener("click", () => postDetailModal.classList.add("hidden"));
  }

  if (postDetailModal) {
    postDetailModal.addEventListener("click", (e) => {
      if (e.target === postDetailModal) postDetailModal.classList.add("hidden");
    });
  }

  // Image preview
  const postImageInput = document.getElementById("post-image");
  const imagePreview = document.getElementById("image-preview");

  if (postImageInput && imagePreview) {
    postImageInput.addEventListener("change", () => {
      imagePreview.innerHTML = "";
      const files = Array.from(postImageInput.files);
      if (files.length > 0) {
        imagePreview.classList.add("show");
        files.forEach((file) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = document.createElement("img");
            img.src = e.target.result;
            imagePreview.appendChild(img);
          };
          reader.readAsDataURL(file);
        });
      } else {
        imagePreview.classList.remove("show");
      }
    });
  }

  // Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (lightboxModal && !lightboxModal.classList.contains("hidden")) {
        closeLightbox();
        return;
      }
      [loginModal, newPostModal, postDetailModal, publishModal].forEach((m) => {
        if (m && !m.classList.contains("hidden")) m.classList.add("hidden");
      });
    }
  });

  // Warn before leaving with unsaved changes
  window.addEventListener("beforeunload", (e) => {
    if (hasPendingChanges()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
});