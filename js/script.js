/* ============================================
   testPage — Main Page Logic
   Blog Preview · Admin Auth · Stars · Settings
============================================ */

const GITHUB_OWNER = "Rollin-Robyn";
const GITHUB_REPO = "Website-Blog";
const GITHUB_BRANCH = "main";
const POSTS_FILE_PATH = "posts.json";
const SETTINGS_KEY = "testpage_settings";
const DEBUG = true;

const ADMIN_USERNAME_HASH =
  "575aad173fe88daee328513f7863c40938ac02bfda2c3e384d3c5c5a83d0e3cf";
const ADMIN_PASSWORD_HASH =
  "db7009bbc0ea420246146b8336df6f33f7e67d7f1389c1f58496d012a2f29e39";

let cachedPosts = [];
let fileSha = null;
let githubToken = null;
let starsActive = true;
let starsAnimationId = null;

function log(...args) {
  if (DEBUG) console.log("[MAIN]", ...args);
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
        s.speed *= -1;
        s.alpha = Math.max(0.05, Math.min(s.alpha, s.maxAlpha));
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
      g.addColorStop(0, `rgba(255,255,255,${ss.alpha})`);
      g.addColorStop(1, `rgba(255,255,255,0)`);
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

function startStars() {
  starsActive = true;
  initStars();
}

// ============ BLOG PREVIEW ============
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

function renderPosts() {
  const container = document.getElementById("blog-posts");
  if (!container) return;
  container.innerHTML = "";

  const previewPosts = cachedPosts.slice(0, 3);

  if (previewPosts.length === 0) {
    const empty = document.createElement("p");
    empty.style.cssText = "font-size:0.7rem;color:var(--text-muted);text-align:center;padding:12px 0;";
    empty.textContent = "No posts yet...";
    container.appendChild(empty);
    return;
  }

  previewPosts.forEach((post) => {
    const el = document.createElement("div");
    el.className = "blog-post";

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

    el.innerHTML = `
      <div class="blog-post-date">${escapeHtml(post.date)}</div>
      <div class="blog-post-body">
        <div class="blog-post-text">
          <strong ${titleStyle}>${title}</strong><br>
          <span class="preview-text">${parseMarkdown(post.content)}</span>
        </div>
        <div class="blog-post-image">${imageContent}</div>
      </div>
    `;

    el.addEventListener("click", () => openPostDetail(post));
    container.appendChild(el);
  });
}

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

// ============ SETTINGS ============
const DEFAULT_SETTINGS = {
  fontSize: 10,
  lineHeight: 1.8,
  pageWidth: 560,
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

  const container = document.querySelector(".page-container");
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
async function attemptLogin(username, password) {
  const uh = await sha256(username);
  const ph = await sha256(password);
  return uh === ADMIN_USERNAME_HASH && ph === ADMIN_PASSWORD_HASH;
}

function setAdminMode(enabled) {
  const loginBtn = document.getElementById("admin-login-btn");
  const logoutBtn = document.getElementById("admin-logout-btn");

  if (enabled) sessionStorage.setItem("testpage_admin", "true");
  else { sessionStorage.removeItem("testpage_admin"); githubToken = null; }

  if (loginBtn) loginBtn.classList.toggle("hidden", enabled);
  if (logoutBtn) logoutBtn.classList.toggle("hidden", !enabled);

  renderPosts();
}

// ============ INIT ============
document.addEventListener("DOMContentLoaded", async () => {
  initSettings();

  const settings = loadSettings();
  if (settings.stars) initStars();
  else starsActive = false;

  const statusEl = showStatus("LOADING POSTS...", "saving");
  try { await fetchPostsFromGitHub(); statusEl.remove(); }
  catch { statusEl.remove(); showStatus("FAILED TO LOAD", "error"); }
  renderPosts();
  setAdminMode(false);

  // Login modal
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
  if (logoutBtn) logoutBtn.addEventListener("click", () => { setAdminMode(false); showStatus("LOGGED OUT", "success"); });

  // Close overlays
  const postDetailModal = document.getElementById("post-detail-modal");
  const postDetailClose = document.getElementById("post-detail-close");
  const settingsModal = document.getElementById("settings-modal");

  if (postDetailClose) postDetailClose.addEventListener("click", () => postDetailModal.classList.add("hidden"));
  if (postDetailModal) postDetailModal.addEventListener("click", (e) => { if (e.target === postDetailModal) postDetailModal.classList.add("hidden"); });

  [loginModal].forEach((m) => {
    if (m) m.addEventListener("click", (e) => { if (e.target === m) m.classList.add("hidden"); });
  });

  // Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (lightboxModal && !lightboxModal.classList.contains("hidden")) { closeLightbox(); return; }
      [loginModal, postDetailModal, settingsModal].forEach((m) => {
        if (m && !m.classList.contains("hidden")) m.classList.add("hidden");
      });
    }
  });
});