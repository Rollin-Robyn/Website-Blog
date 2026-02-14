/* ============================================
   testPage — Blog Page Logic
   With post queue system for batch publishing
============================================ */

const GITHUB_OWNER = "Rollin-Robyn";
const GITHUB_REPO = "Website-Blog";
const GITHUB_BRANCH = "main";
const POSTS_FILE_PATH = "posts.json";
const POSTS_PER_PAGE = 10;
const SETTINGS_KEY = "testpage_settings";
const DEBUG = true;

const ADMIN_USERNAME_HASH =
  "575aad173fe88daee328513f7863c40938ac02bfda2c3e384d3c5c5a83d0e3cf";
const ADMIN_PASSWORD_HASH =
  "db7009bbc0ea420246146b8336df6f33f7e67d7f1389c1f58496d012a2f29e39";

let cachedPosts = [];
let fileSha = null;
let githubToken = null;
let currentSort = "newest";
let currentSearch = "";
let displayedCount = 0;
let starsActive = true;
let starsAnimationId = null;

// ============ POST QUEUE ============
let pendingQueue = [];

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

// ============ STATUS ============
function showStatus(message, type = "saving") {
  const existing = document.querySelector(".save-status");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.className = `save-status ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  if (type === "success" || type === "error") {
    setTimeout(() => { if (el.parentNode) el.remove(); }, 4000);
  }
  return el;
}

// ============ GITHUB API ============
async function fetchPostsFromGitHub() {
  try {
    log("Fetching posts...");
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${POSTS_FILE_PATH}?ref=${GITHUB_BRANCH}`;
    const headers = { Accept: "application/vnd.github.v3+json" };
    if (githubToken) headers["Authorization"] = `Bearer ${githubToken}`;

    const response = await fetch(url, { headers });
    if (!response.ok) {
      if (response.status === 404) { cachedPosts = []; fileSha = null; return []; }
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    fileSha = data.sha;
    const decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ""))));
    cachedPosts = JSON.parse(decoded);
    log("Loaded", cachedPosts.length, "posts");
    return cachedPosts;
  } catch (err) {
    console.error("Fetch failed:", err);
    return cachedPosts;
  }
}

async function savePostsToGitHub(posts) {
  if (!githubToken) { alert("Not authenticated!"); return false; }
  const statusEl = showStatus("SAVING...", "saving");
  try {
    const shaUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${POSTS_FILE_PATH}?ref=${GITHUB_BRANCH}`;
    const shaResp = await fetch(shaUrl, {
      headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github.v3+json" },
    });
    if (shaResp.ok) fileSha = (await shaResp.json()).sha;
    else if (shaResp.status === 404) fileSha = null;
    else throw new Error(`SHA failed: ${shaResp.status}`);

    const content = JSON.stringify(posts, null, 2);
    const encoded = btoa(unescape(encodeURIComponent(content)));
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${POSTS_FILE_PATH}`;
    const body = { message: `Update blog — ${new Date().toISOString()}`, content: encoded, branch: GITHUB_BRANCH };
    if (fileSha) body.sha = fileSha;

    const resp = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const respData = await resp.json();
    if (!resp.ok) throw new Error(`API error ${resp.status}: ${respData.message || ""}`);

    fileSha = respData.content.sha;
    cachedPosts = posts;
    statusEl.remove();
    showStatus("SAVED!", "success");
    return true;
  } catch (err) {
    console.error("Save failed:", err);
    statusEl.remove();
    showStatus("SAVE FAILED!", "error");
    alert(`Save failed: ${err.message}`);
    return false;
  }
}

async function uploadImageToGitHub(base64Data, filename) {
  if (!githubToken) return null;
  try {
    const pureBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const path = `blog-images/${filename}`;
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

    let existingSha = null;
    try {
      const check = await fetch(url, {
        headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github.v3+json" },
      });
      if (check.ok) existingSha = (await check.json()).sha;
    } catch {}

    const body = { message: `Add image: ${filename}`, content: pureBase64, branch: GITHUB_BRANCH };
    if (existingSha) body.sha = existingSha;

    const resp = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);

    return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`;
  } catch (err) {
    console.error("Image upload failed:", err);
    return null;
  }
}

// ============ STARS ============
function initStars() {
  const canvas = document.getElementById("stars-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize();
  window.addEventListener("resize", resize);

  const stars = [];
  for (let i = 0; i < 180; i++) {
    stars.push({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      radius: Math.random() * 1.5 + 0.3, alpha: Math.random(),
      speed: Math.random() * 0.015 + 0.003, maxAlpha: Math.random() * 0.5 + 0.5,
    });
  }

  let shootingStar = null;

  function animate() {
    if (!starsActive) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const s of stars) {
      s.alpha += s.speed;
      if (s.alpha >= s.maxAlpha || s.alpha <= 0.05) {
        s.speed *= -1; s.alpha = Math.max(0.05, Math.min(s.alpha, s.maxAlpha));
      }
      ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220,210,255,${s.alpha})`; ctx.fill();
    }

    if (Math.random() < 0.003 && !shootingStar) {
      shootingStar = {
        x: Math.random() * canvas.width * 0.6, y: Math.random() * canvas.height * 0.4,
        length: 40 + Math.random() * 60, speed: 4 + Math.random() * 4,
        angle: Math.PI / 4 + (Math.random() - 0.5) * 0.3, alpha: 1, life: 0, maxLife: 30 + Math.random() * 20,
      };
    }

    if (shootingStar) {
      const ss = shootingStar;
      ss.life++; ss.x += Math.cos(ss.angle) * ss.speed; ss.y += Math.sin(ss.angle) * ss.speed;
      ss.alpha = 1 - ss.life / ss.maxLife;
      const tx = ss.x - Math.cos(ss.angle) * ss.length;
      const ty = ss.y - Math.sin(ss.angle) * ss.length;
      const g = ctx.createLinearGradient(ss.x, ss.y, tx, ty);
      g.addColorStop(0, `rgba(255,255,255,${ss.alpha})`); g.addColorStop(1, `rgba(255,255,255,0)`);
      ctx.beginPath(); ctx.strokeStyle = g; ctx.lineWidth = 1.5;
      ctx.moveTo(ss.x, ss.y); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.beginPath(); ctx.arc(ss.x, ss.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${ss.alpha})`; ctx.fill();
      if (ss.life >= ss.maxLife) shootingStar = null;
    }
    starsAnimationId = requestAnimationFrame(animate);
  }
  animate();
}

function stopStars() {
  starsActive = false;
  const canvas = document.getElementById("stars-canvas");
  if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  if (starsAnimationId) { cancelAnimationFrame(starsAnimationId); starsAnimationId = null; }
}

function startStars() { starsActive = true; initStars(); }

// ============ HELPERS ============
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
    '<span style="color:$1;text-shadow:0 0 5px $1" class="preview-color-span">$2</span>'
  );
  md = md.replace(/\n/g, "<br>");
  return md;
}

function stripMarkdown(text) {
  if (!text) return "";
  let clean = text;
  clean = clean.replace(/^#{1,6}\s/gm, "");
  clean = clean.replace(/\*\*(.+?)\*\*/g, "$1");
  clean = clean.replace(/\*(.+?)\*/g, "$1");
  clean = clean.replace(/\{color:.+?\}(.+?)\{\/color\}/g, "$1");
  return clean;
}

function parseDate(dateStr) {
  if (!dateStr) return 0;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return 0;
  const [dd, mm, yy] = parts;
  return new Date(2000 + parseInt(yy), parseInt(mm) - 1, parseInt(dd)).getTime();
}

function formatDate() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

// ============ FILTERING & SORTING ============
function getFilteredPosts() {
  let posts = [...cachedPosts];

  if (currentSearch) {
    const query = currentSearch.toLowerCase();
    posts = posts.filter((p) => {
      const title = (p.title || "").toLowerCase();
      const content = stripMarkdown(p.content || "").toLowerCase();
      const date = (p.date || "").toLowerCase();
      return title.includes(query) || content.includes(query) || date.includes(query);
    });
  }

  if (currentSort === "oldest") posts.sort((a, b) => parseDate(a.date) - parseDate(b.date));
  else posts.sort((a, b) => parseDate(b.date) - parseDate(a.date));

  return posts;
}

// ============ RENDERING ============
function renderBlogPage() {
  const grid = document.getElementById("blog-posts-grid");
  const countText = document.getElementById("post-count-text");
  if (!grid) return;

  const isAdmin = sessionStorage.getItem("testpage_admin") === "true";
  const filtered = getFilteredPosts();

  if (countText) {
    if (currentSearch) {
      countText.textContent = `${filtered.length} RESULT${filtered.length !== 1 ? "S" : ""} FOR "${currentSearch.toUpperCase()}"`;
    } else {
      countText.textContent = `${filtered.length} POST${filtered.length !== 1 ? "S" : ""}`;
    }
  }

  grid.innerHTML = "";

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="no-results">
        <span class="no-results-icon">&#128301;</span>
        <p>${currentSearch ? "NO POSTS MATCH YOUR SEARCH..." : "NO POSTS YET..."}</p>
        <p>${currentSearch ? "TRY A DIFFERENT QUERY" : "CHECK BACK LATER!"}</p>
      </div>
    `;
    return;
  }

  const toShow = filtered.slice(0, displayedCount);

  toShow.forEach((post, index) => {
    const card = document.createElement("div");
    card.className = "blog-card";
    card.style.animationDelay = `${index * 0.05}s`;

    let deleteBtn = "";
    if (isAdmin) {
      deleteBtn = `<button class="delete-post-btn" data-id="${post.id}" title="Delete">&#10005;</button>`;
    }

    const images = post.images || (post.image ? [post.image] : []);
    let imageHtml = `<span class="heart-mini">&#10084;</span>`;
    if (images.length > 0) imageHtml = `<img src="${images[0]}" alt="Post image">`;

    let imageCountHtml = "";
    if (images.length > 1) imageCountHtml = `<span class="blog-card-image-count">&#128247; ${images.length} IMAGES</span>`;

    const title = post.title ? escapeHtml(post.title) : "UNTITLED POST";
    const titleStyle = post.titleColor
      ? `style="color:${post.titleColor};text-shadow:0 0 5px ${post.titleColor}"`
      : `style="color:var(--neon-pink);text-shadow:0 0 5px var(--neon-pink)"`;

    const preview = stripMarkdown(post.content || "");

    card.innerHTML = `
      <div class="blog-card-inner">
        <div class="blog-card-image">${imageHtml}</div>
        <div class="blog-card-content">
          <div class="blog-card-date">${escapeHtml(post.date)}</div>
          <div class="blog-card-title" ${titleStyle}>${title}</div>
          <div class="blog-card-preview">${escapeHtml(preview)}</div>
          <div class="blog-card-footer">
            <span class="blog-card-read-more">READ MORE &#10095;</span>
            ${imageCountHtml}
          </div>
        </div>
      </div>
      ${deleteBtn}
    `;

    card.addEventListener("click", (e) => {
      if (e.target.closest(".delete-post-btn")) return;
      openPostDetail(post);
    });

    grid.appendChild(card);
  });

  if (isAdmin) {
    grid.querySelectorAll(".delete-post-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (confirm("Delete this post?")) await deletePost(btn.dataset.id);
      });
    });
  }

  if (displayedCount < filtered.length) {
    const remaining = filtered.length - displayedCount;
    const loadMoreBtn = document.createElement("button");
    loadMoreBtn.className = "load-more-btn";
    loadMoreBtn.textContent = `LOAD MORE (${remaining} LEFT)`;
    loadMoreBtn.addEventListener("click", () => { displayedCount += POSTS_PER_PAGE; renderBlogPage(); });
    grid.appendChild(loadMoreBtn);
  }
}

function resetAndRender() {
  displayedCount = POSTS_PER_PAGE;
  renderBlogPage();
}

// ============ POST DETAIL ============
function openPostDetail(post) {
  const modal = document.getElementById("post-detail-modal");
  const content = document.getElementById("post-detail-content");
  if (!modal || !content) return;

  const images = post.images || (post.image ? [post.image] : []);
  let imagesHtml = "";
  if (images.length > 0) {
    imagesHtml = `<div class="blog-divider"></div><div class="post-images-stack">`;
    images.forEach((img, i) => {
      imagesHtml += `<img class="post-detail-image" src="${img}" alt="Post image" data-index="${i}">`;
    });
    imagesHtml += `</div>`;
  }

  const titleStyle = post.titleColor
    ? `style="color:${post.titleColor};text-shadow:0 0 5px ${post.titleColor}"`
    : "";

  content.innerHTML = `
    <h2 ${titleStyle}>${escapeHtml(post.title || "BLOG POST")}</h2>
    <div class="post-detail-date">${escapeHtml(post.date)}</div>
    <div class="post-detail-content" style="color:${post.color || "inherit"}">${parseMarkdown(post.content)}</div>
    ${imagesHtml}
  `;

  content.querySelectorAll(".post-detail-image").forEach((img) => {
    img.addEventListener("click", () => openLightbox(img.src));
  });

  modal.classList.remove("hidden");
}

// ============ QUEUE SYSTEM ============
function addToQueue(postData) {
  pendingQueue.push(postData);
  log("Added to queue. Queue size:", pendingQueue.length);
  renderQueue();
  showStatus(`ADDED TO QUEUE (${pendingQueue.length} PENDING)`, "success");
}

function removeFromQueue(index) {
  if (index >= 0 && index < pendingQueue.length) {
    const removed = pendingQueue.splice(index, 1)[0];
    log("Removed from queue:", removed.title);
    renderQueue();
    showStatus("REMOVED FROM QUEUE", "success");
  }
}

function clearQueue() {
  pendingQueue = [];
  log("Queue cleared");
  renderQueue();
  showStatus("QUEUE CLEARED", "success");
}

function renderQueue() {
  const panel = document.getElementById("pending-queue-panel");
  const list = document.getElementById("pending-posts-list");
  const countEl = document.getElementById("pending-count");
  const publishBtn = document.getElementById("publish-all-btn");

  if (!panel || !list) return;

  const isAdmin = sessionStorage.getItem("testpage_admin") === "true";

  if (pendingQueue.length === 0 || !isAdmin) {
    panel.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");
  if (countEl) countEl.textContent = pendingQueue.length;
  if (publishBtn) publishBtn.disabled = pendingQueue.length === 0;

  list.innerHTML = "";

  pendingQueue.forEach((post, index) => {
    const item = document.createElement("div");
    item.className = "pending-post-item";

    const images = post.localImages || [];
    let thumbHtml = `<span class="heart-mini">&#10084;</span>`;
    if (images.length > 0) {
      thumbHtml = `<img src="${images[0]}" alt="thumb">`;
    }

    const title = post.title ? escapeHtml(post.title) : "UNTITLED POST";
    const contentPreview = stripMarkdown(post.content || "").substring(0, 60);
    const imageCount = images.length > 0 ? `${images.length} IMG` : "NO IMG";

    item.innerHTML = `
      <span class="pending-post-number">#${index + 1}</span>
      <div class="pending-post-thumb">${thumbHtml}</div>
      <div class="pending-post-info">
        <div class="pending-post-title">${title}</div>
        <div class="pending-post-meta">${escapeHtml(post.date)} · ${imageCount}${contentPreview ? " · " + escapeHtml(contentPreview) + "..." : ""}</div>
      </div>
      <button class="pending-post-remove" data-index="${index}" title="Remove from queue">&#10005;</button>
    `;

    list.appendChild(item);
  });

  list.querySelectorAll(".pending-post-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index);
      removeFromQueue(idx);
    });
  });
}

async function publishAll() {
  if (pendingQueue.length === 0) return;
  if (!githubToken) { alert("Not authenticated!"); return; }

  const publishBtn = document.getElementById("publish-all-btn");
  if (publishBtn) {
    publishBtn.disabled = true;
    publishBtn.textContent = "PUBLISHING...";
    publishBtn.classList.add("publishing");
  }

  try {
    showStatus("FETCHING LATEST POSTS...", "saving");
    await fetchPostsFromGitHub();

    const totalImages = pendingQueue.reduce((sum, p) => sum + (p.localImageFiles || []).length, 0);
    let uploadedCount = 0;

    for (let i = 0; i < pendingQueue.length; i++) {
      const post = pendingQueue[i];
      const imageUrls = [];

      if (post.localImageFiles && post.localImageFiles.length > 0) {
        for (let j = 0; j < post.localImageFiles.length; j++) {
          uploadedCount++;
          showStatus(`UPLOADING IMAGE ${uploadedCount}/${totalImages}...`, "saving");

          try {
            const compressed = await compressImage(post.localImageFiles[j]);
            const url = await uploadImageToGitHub(compressed, `img-${Date.now()}-${i}-${j}.jpg`);
            if (url) imageUrls.push(url);
          } catch (e) {
            console.error("Image upload failed:", e);
          }
        }
      }

      post.images = imageUrls;
      delete post.localImages;
      delete post.localImageFiles;
    }

    showStatus(`SAVING ${pendingQueue.length} POSTS...`, "saving");
    const newPosts = pendingQueue.map((p) => ({
      id: p.id,
      date: p.date,
      title: p.title,
      titleColor: p.titleColor,
      content: p.content,
      color: p.color,
      images: p.images,
    }));

    cachedPosts = [...newPosts, ...cachedPosts];

    const saved = await savePostsToGitHub(cachedPosts);

    if (saved) {
      const count = pendingQueue.length;
      pendingQueue = [];
      renderQueue();
      resetAndRender();
      showStatus(`PUBLISHED ${count} POST${count !== 1 ? "S" : ""}!`, "success");
      log("Published", count, "posts successfully");
    } else {
      cachedPosts = cachedPosts.filter(
        (p) => !newPosts.some((np) => np.id === p.id)
      );
      showStatus("PUBLISH FAILED!", "error");
    }
  } catch (err) {
    console.error("Publish failed:", err);
    showStatus("PUBLISH FAILED!", "error");
  }

  if (publishBtn) {
    publishBtn.disabled = pendingQueue.length === 0;
    publishBtn.textContent = "▲ PUBLISH ALL";
    publishBtn.classList.remove("publishing");
  }
}

// ============ POST CRUD ============
async function deletePost(id) {
  await fetchPostsFromGitHub();
  cachedPosts = cachedPosts.filter((p) => p.id !== id);
  const saved = await savePostsToGitHub(cachedPosts);
  if (saved) resetAndRender();
  else { await fetchPostsFromGitHub(); resetAndRender(); }
}

// ============ LIGHTBOX ============
const lightboxModal = document.getElementById("lightbox-modal");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxClose = document.querySelector(".lightbox-close-btn");

function openLightbox(src) {
  if (lightboxModal && lightboxImg) { lightboxImg.src = src; lightboxModal.classList.remove("hidden"); }
}

function closeLightbox() {
  if (lightboxModal) { lightboxModal.classList.add("hidden"); setTimeout(() => { if (lightboxImg) lightboxImg.src = ""; }, 200); }
}

if (lightboxClose) lightboxClose.addEventListener("click", closeLightbox);
if (lightboxModal) lightboxModal.addEventListener("click", (e) => { if (e.target !== lightboxImg) closeLightbox(); });

// ============ IMAGE COMPRESS ============
function compressImage(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    if (typeof file === "string" && file.startsWith("data:")) {
      const img = new Image();
      img.src = file;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

// ============ EDITOR ============
let historyStack = [];
let historyIndex = -1;

function saveHistory() {
  const ta = document.getElementById("post-content");
  if (!ta) return;
  const val = ta.value;
  if (historyIndex >= 0 && historyStack[historyIndex] === val) return;
  if (historyIndex < historyStack.length - 1) historyStack = historyStack.slice(0, historyIndex + 1);
  historyStack.push(val); historyIndex++;
  if (historyStack.length > 50) { historyStack.shift(); historyIndex--; }
}

function undo() { if (historyIndex > 0) { historyIndex--; document.getElementById("post-content").value = historyStack[historyIndex]; } }
function redo() { if (historyIndex < historyStack.length - 1) { historyIndex++; document.getElementById("post-content").value = historyStack[historyIndex]; } }

function insertMarkdown(s, e) {
  const ta = document.getElementById("post-content");
  if (!ta) return;
  saveHistory();
  const start = ta.selectionStart, end = ta.selectionEnd;
  ta.setRangeText(s + ta.value.substring(start, end) + e, start, end, "select");
  ta.focus(); saveHistory();
}

function insertColor() {
  const p = document.getElementById("editor-color");
  insertMarkdown(`{color:${p ? p.value : "#ffffff"}}`, `{/color}`);
}

document.addEventListener("DOMContentLoaded", () => {
  const bb = document.getElementById("btn-bold"); if (bb) bb.addEventListener("click", () => insertMarkdown("**", "**"));
  const bi = document.getElementById("btn-italic"); if (bi) bi.addEventListener("click", () => insertMarkdown("*", "*"));
  const bh = document.getElementById("btn-header"); if (bh) bh.addEventListener("click", () => insertMarkdown("### ", ""));
  const bc = document.getElementById("btn-color-apply"); if (bc) bc.addEventListener("click", insertColor);
  const bu = document.getElementById("btn-undo"); if (bu) bu.addEventListener("click", undo);
  const br = document.getElementById("btn-redo"); if (br) br.addEventListener("click", redo);
  const ta = document.getElementById("post-content"); if (ta) { saveHistory(); ta.addEventListener("input", saveHistory); }
});

// ============ SETTINGS ============
const DEFAULT_SETTINGS = {
  fontSize: 10,
  lineHeight: 1.8,
  pageWidth: 700,
  glow: true,
  scanlines: true,
  stars: true,
};

function loadSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applySettings(settings) {
  document.documentElement.style.fontSize = settings.fontSize + "px";
  document.body.style.lineHeight = settings.lineHeight;

  const container = document.querySelector(".blog-page-container");
  if (container) container.style.maxWidth = settings.pageWidth + "px";

  if (settings.glow) document.body.classList.remove("no-glow");
  else document.body.classList.add("no-glow");

  if (settings.scanlines) document.body.classList.remove("no-scanlines");
  else document.body.classList.add("no-scanlines");

  if (settings.stars) { if (!starsActive) startStars(); }
  else { if (starsActive) stopStars(); }

  updateSettingsUI(settings);
  saveSettings(settings);
}

function updateSettingsUI(settings) {
  const fs = document.getElementById("setting-font-size");
  const fsv = document.getElementById("font-size-value");
  const lh = document.getElementById("setting-line-height");
  const lhv = document.getElementById("line-height-value");
  const pw = document.getElementById("setting-page-width");
  const pwv = document.getElementById("page-width-value");

  if (fs) fs.value = settings.fontSize;
  if (fsv) fsv.textContent = settings.fontSize + "px";
  if (lh) lh.value = settings.lineHeight;
  if (lhv) lhv.textContent = settings.lineHeight.toFixed(1);
  if (pw) pw.value = settings.pageWidth;
  if (pwv) pwv.textContent = settings.pageWidth + "px";

  const glowOn = document.getElementById("setting-glow");
  const glowOff = document.getElementById("setting-glow-off");
  if (glowOn && glowOff) { glowOn.classList.toggle("active", settings.glow); glowOff.classList.toggle("active", !settings.glow); }

  const scanOn = document.getElementById("setting-scanlines");
  const scanOff = document.getElementById("setting-scanlines-off");
  if (scanOn && scanOff) { scanOn.classList.toggle("active", settings.scanlines); scanOff.classList.toggle("active", !settings.scanlines); }

  const starsOn = document.getElementById("setting-stars");
  const starsOff = document.getElementById("setting-stars-off");
  if (starsOn && starsOff) { starsOn.classList.toggle("active", settings.stars); starsOff.classList.toggle("active", !settings.stars); }
}

function initSettings() {
  const settings = loadSettings();
  applySettings(settings);

  const fs = document.getElementById("setting-font-size");
  if (fs) fs.addEventListener("input", () => { const s = loadSettings(); s.fontSize = parseInt(fs.value); applySettings(s); });

  const lh = document.getElementById("setting-line-height");
  if (lh) lh.addEventListener("input", () => { const s = loadSettings(); s.lineHeight = parseFloat(lh.value); applySettings(s); });

  const pw = document.getElementById("setting-page-width");
  if (pw) pw.addEventListener("input", () => { const s = loadSettings(); s.pageWidth = parseInt(pw.value); applySettings(s); });

  const glowOn = document.getElementById("setting-glow");
  const glowOff = document.getElementById("setting-glow-off");
  if (glowOn) glowOn.addEventListener("click", () => { const s = loadSettings(); s.glow = true; applySettings(s); });
  if (glowOff) glowOff.addEventListener("click", () => { const s = loadSettings(); s.glow = false; applySettings(s); });

  const scanOn = document.getElementById("setting-scanlines");
  const scanOff = document.getElementById("setting-scanlines-off");
  if (scanOn) scanOn.addEventListener("click", () => { const s = loadSettings(); s.scanlines = true; applySettings(s); });
  if (scanOff) scanOff.addEventListener("click", () => { const s = loadSettings(); s.scanlines = false; applySettings(s); });

  const starsOnBtn = document.getElementById("setting-stars");
  const starsOffBtn = document.getElementById("setting-stars-off");
  if (starsOnBtn) starsOnBtn.addEventListener("click", () => { const s = loadSettings(); s.stars = true; applySettings(s); });
  if (starsOffBtn) starsOffBtn.addEventListener("click", () => { const s = loadSettings(); s.stars = false; applySettings(s); });

  const resetBtn = document.getElementById("settings-reset-btn");
  if (resetBtn) resetBtn.addEventListener("click", () => { applySettings({ ...DEFAULT_SETTINGS }); showStatus("SETTINGS RESET!", "success"); });

  const settingsBtn = document.getElementById("settings-btn");
  const settingsModal = document.getElementById("settings-modal");
  const settingsClose = document.getElementById("settings-close-btn");

  if (settingsBtn) settingsBtn.addEventListener("click", () => settingsModal.classList.remove("hidden"));
  if (settingsClose) settingsClose.addEventListener("click", () => settingsModal.classList.add("hidden"));
  if (settingsModal) settingsModal.addEventListener("click", (e) => { if (e.target === settingsModal) settingsModal.classList.add("hidden"); });
}

// ============ AUTH ============
async function attemptLogin(u, p) {
  return (await sha256(u)) === ADMIN_USERNAME_HASH && (await sha256(p)) === ADMIN_PASSWORD_HASH;
}

function setAdminMode(enabled) {
  const loginBtn = document.getElementById("admin-login-btn");
  const logoutBtn = document.getElementById("admin-logout-btn");
  const newPostBtn = document.getElementById("new-post-btn");

  if (enabled) sessionStorage.setItem("testpage_admin", "true");
  else {
    sessionStorage.removeItem("testpage_admin");
    githubToken = null;
    pendingQueue = [];
  }

  if (loginBtn) loginBtn.classList.toggle("hidden", enabled);
  if (logoutBtn) logoutBtn.classList.toggle("hidden", !enabled);
  if (newPostBtn) newPostBtn.classList.toggle("hidden", !enabled);

  renderQueue();
  resetAndRender();
}

// ============ MAIN INIT ============
document.addEventListener("DOMContentLoaded", async () => {
  initSettings();

  const settings = loadSettings();
  if (settings.stars) initStars();
  else starsActive = false;

  const statusEl = showStatus("LOADING POSTS...", "saving");
  try { await fetchPostsFromGitHub(); statusEl.remove(); }
  catch { statusEl.remove(); showStatus("FAILED TO LOAD", "error"); }

  displayedCount = POSTS_PER_PAGE;
  renderBlogPage();
  setAdminMode(false);

  // Search
  const searchInput = document.getElementById("blog-search");
  let searchTimeout;
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => { currentSearch = searchInput.value.trim(); resetAndRender(); }, 300);
    });
  }

  // Sort
  const sortNewest = document.getElementById("sort-newest");
  const sortOldest = document.getElementById("sort-oldest");
  if (sortNewest) {
    sortNewest.addEventListener("click", () => {
      currentSort = "newest";
      sortNewest.classList.add("active");
      if (sortOldest) sortOldest.classList.remove("active");
      resetAndRender();
    });
  }
  if (sortOldest) {
    sortOldest.addEventListener("click", () => {
      currentSort = "oldest";
      sortOldest.classList.add("active");
      if (sortNewest) sortNewest.classList.remove("active");
      resetAndRender();
    });
  }

  // Login
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
      usernameInput.value = ""; passwordInput.value = ""; tokenInput.value = "";
      loginError.classList.add("hidden");
      setTimeout(() => usernameInput.focus(), 100);
    });
  }

  if (loginCancel) loginCancel.addEventListener("click", () => loginModal.classList.add("hidden"));

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

      loginSubmit.textContent = "CHECKING..."; loginSubmit.disabled = true;

      if (!(await attemptLogin(username, password))) {
        loginError.textContent = "WRONG CREDENTIALS!";
        loginError.classList.remove("hidden");
        loginSubmit.textContent = "LOGIN"; loginSubmit.disabled = false;
        return;
      }

      try {
        const testResp = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`,
          { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" } }
        );
        if (!testResp.ok) {
          loginError.textContent = "INVALID GITHUB TOKEN!";
          loginError.classList.remove("hidden");
          loginSubmit.textContent = "LOGIN"; loginSubmit.disabled = false;
          return;
        }
        const repoData = await testResp.json();
        if (!repoData.permissions || !repoData.permissions.push) {
          loginError.textContent = "TOKEN LACKS WRITE ACCESS!";
          loginError.classList.remove("hidden");
          loginSubmit.textContent = "LOGIN"; loginSubmit.disabled = false;
          return;
        }
      } catch {
        loginError.textContent = "TOKEN CHECK FAILED!";
        loginError.classList.remove("hidden");
        loginSubmit.textContent = "LOGIN"; loginSubmit.disabled = false;
        return;
      }

      githubToken = token;
      loginModal.classList.add("hidden");
      setAdminMode(true);
      showStatus("LOGGED IN!", "success");
      loginSubmit.textContent = "LOGIN"; loginSubmit.disabled = false;
    });
  }

  if (passwordInput) passwordInput.addEventListener("keydown", (e) => { if (e.key === "Enter") tokenInput.focus(); });
  if (tokenInput) tokenInput.addEventListener("keydown", (e) => { if (e.key === "Enter") loginSubmit.click(); });

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      if (pendingQueue.length > 0) {
        if (!confirm(`You have ${pendingQueue.length} unpublished post(s). Logout anyway? They will be lost.`)) {
          return;
        }
      }
      setAdminMode(false);
      showStatus("LOGGED OUT", "success");
    });
  }

  // New post — adds to queue instead of publishing
  const newPostModal = document.getElementById("new-post-modal");
  const newPostBtn = document.getElementById("new-post-btn");
  const postSubmit = document.getElementById("post-submit-btn");
  const postCancel = document.getElementById("post-cancel-btn");
  const postContentInput = document.getElementById("post-content");

  if (newPostBtn) {
    newPostBtn.addEventListener("click", () => {
      newPostModal.classList.remove("hidden");
      postContentInput.value = "";
      const ti = document.getElementById("post-title"); if (ti) ti.value = "";
      const tc = document.getElementById("post-title-color"); if (tc) tc.value = "#ff00de";
      const pc = document.getElementById("post-color"); if (pc) pc.value = "#ffffff";
      const ii = document.getElementById("post-image"); if (ii) ii.value = "";
      const pv = document.getElementById("image-preview"); if (pv) { pv.innerHTML = ""; pv.classList.remove("show"); }
      historyStack = []; historyIndex = -1; saveHistory();
      setTimeout(() => {
        const ti2 = document.getElementById("post-title");
        if (ti2) ti2.focus();
        else postContentInput.focus();
      }, 100);
    });
  }

  if (postCancel) postCancel.addEventListener("click", () => newPostModal.classList.add("hidden"));

  if (postSubmit) {
    postSubmit.addEventListener("click", async () => {
      const content = postContentInput.value.trim();
      const title = document.getElementById("post-title").value.trim();
      const titleColor = document.getElementById("post-title-color").value;
      const color = document.getElementById("post-color").value;
      const imgInput = document.getElementById("post-image");
      const hasImages = imgInput && imgInput.files && imgInput.files.length > 0;

      if (!content && !hasImages) { alert("Enter text or select an image!"); return; }

      const localImages = [];
      const localImageFiles = [];

      if (hasImages) {
        postSubmit.textContent = "READING..."; postSubmit.disabled = true;

        for (let i = 0; i < imgInput.files.length; i++) {
          const file = imgInput.files[i];
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          localImages.push(base64);
          localImageFiles.push(base64);
        }
      }

      const queueItem = {
        id: "post-" + Date.now(),
        date: formatDate(),
        title: title || "UNTITLED POST",
        titleColor: titleColor,
        content: content,
        color: color || "#ffffff",
        images: [],
        localImages: localImages,
        localImageFiles: localImageFiles,
      };

      addToQueue(queueItem);

      newPostModal.classList.add("hidden");
      postContentInput.value = "";
      const ti = document.getElementById("post-title"); if (ti) ti.value = "";
      const tc = document.getElementById("post-title-color"); if (tc) tc.value = "#ff00de";
      imgInput.value = "";
      const pv = document.getElementById("image-preview"); if (pv) { pv.innerHTML = ""; pv.classList.remove("show"); }

      postSubmit.textContent = "ADD TO QUEUE"; postSubmit.disabled = false;
    });
  }

  if (postContentInput) postContentInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.ctrlKey) postSubmit.click(); });

  // Publish all
  const publishAllBtn = document.getElementById("publish-all-btn");
  if (publishAllBtn) {
    publishAllBtn.addEventListener("click", async () => {
      if (pendingQueue.length === 0) return;
      const count = pendingQueue.length;
      if (!confirm(`Publish ${count} post${count !== 1 ? "s" : ""} now?`)) return;
      await publishAll();
    });
  }

  // Clear queue
  const clearQueueBtn = document.getElementById("clear-queue-btn");
  if (clearQueueBtn) {
    clearQueueBtn.addEventListener("click", () => {
      if (pendingQueue.length === 0) return;
      if (confirm(`Remove all ${pendingQueue.length} pending posts from queue?`)) {
        clearQueue();
      }
    });
  }

  // Close overlays
  [loginModal, newPostModal].forEach((m) => {
    if (m) m.addEventListener("click", (e) => { if (e.target === m) m.classList.add("hidden"); });
  });

  const postDetailModal = document.getElementById("post-detail-modal");
  const postDetailClose = document.getElementById("post-detail-close");
  const settingsModal = document.getElementById("settings-modal");

  if (postDetailClose) postDetailClose.addEventListener("click", () => postDetailModal.classList.add("hidden"));
  if (postDetailModal) postDetailModal.addEventListener("click", (e) => { if (e.target === postDetailModal) postDetailModal.classList.add("hidden"); });

  // Image preview
  const postImageInput = document.getElementById("post-image");
  const imagePreview = document.getElementById("image-preview");
  if (postImageInput && imagePreview) {
    postImageInput.addEventListener("change", () => {
      imagePreview.innerHTML = "";
      const files = Array.from(postImageInput.files);
      if (files.length > 0) {
        imagePreview.classList.add("show");
        files.forEach((f) => {
          const reader = new FileReader();
          reader.onload = (e) => { const img = document.createElement("img"); img.src = e.target.result; imagePreview.appendChild(img); };
          reader.readAsDataURL(f);
        });
      } else { imagePreview.classList.remove("show"); }
    });
  }

  // Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (lightboxModal && !lightboxModal.classList.contains("hidden")) { closeLightbox(); return; }
      [loginModal, newPostModal, postDetailModal, settingsModal].forEach((m) => {
        if (m && !m.classList.contains("hidden")) m.classList.add("hidden");
      });
    }
  });
});