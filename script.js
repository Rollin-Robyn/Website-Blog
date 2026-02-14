/* ============================================
   testPage — Client-Side Logic
   Blog CRUD via GitHub API · Admin Auth · Stars
============================================ */

// ============ CONFIGURATION ============
// !!! CHANGE THESE TO YOUR REPO DETAILS !!!
const GITHUB_OWNER = "Rollin-Robyn";
const GITHUB_REPO = "Website-Blog";
const GITHUB_BRANCH = "main";
const POSTS_FILE_PATH = "posts.json";

const ADMIN_USERNAME_HASH =
  "575aad173fe88daee328513f7863c40938ac02bfda2c3e384d3c5c5a83d0e3cf";
const ADMIN_PASSWORD_HASH =
  "db7009bbc0ea420246146b8336df6f33f7e67d7f1389c1f58496d012a2f29e39";

// In-memory state
let cachedPosts = [];
let fileSha = null;
let githubToken = null;

// ============ SHA-256 HASHING ============
async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============ STATUS INDICATOR ============
function showStatus(message, type = "saving") {
  // Remove existing
  const existing = document.querySelector(".save-status");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.className = `save-status ${type}`;
  el.textContent = message;
  document.body.appendChild(el);

  if (type === "success" || type === "error") {
    setTimeout(() => {
      if (el.parentNode) el.remove();
    }, 3000);
  }

  return el;
}

// ============ GITHUB API ============

/**
 * Fetch posts.json from GitHub (public read — no token needed)
 */
async function fetchPostsFromGitHub() {
  try {
    // Use raw content URL for public repos (no auth needed, no rate limit issues)
    const url = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${POSTS_FILE_PATH}?t=${Date.now()}`;

    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        console.log("posts.json not found, starting fresh");
        cachedPosts = [];
        return [];
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const posts = await response.json();
    cachedPosts = posts;
    return posts;
  } catch (err) {
    console.error("Failed to fetch posts:", err);
    // Return cached if available
    return cachedPosts;
  }
}

/**
 * Get the current SHA of posts.json (needed for updates via API)
 * This requires the API endpoint, not raw content
 */
async function getFileSha() {
  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${POSTS_FILE_PATH}?ref=${GITHUB_BRANCH}`;

    const headers = {
      Accept: "application/vnd.github.v3+json",
    };

    // Use token if available (helps with rate limits)
    if (githubToken) {
      headers["Authorization"] = `Bearer ${githubToken}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // File doesn't exist yet
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    fileSha = data.sha;
    return data.sha;
  } catch (err) {
    console.error("Failed to get file SHA:", err);
    return null;
  }
}

/**
 * Save posts.json to GitHub (requires token)
 */
async function savePostsToGitHub(posts) {
  if (!githubToken) {
    alert("Not authenticated! Please log in first.");
    return false;
  }

  const statusEl = showStatus("SAVING TO GITHUB...", "saving");

  try {
    // Get current SHA first
    const currentSha = await getFileSha();

    const content = JSON.stringify(posts, null, 2);
    const encodedContent = btoa(unescape(encodeURIComponent(content)));

    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${POSTS_FILE_PATH}`;

    const body = {
      message: `Update blog posts - ${new Date().toISOString()}`,
      content: encodedContent,
      branch: GITHUB_BRANCH,
    };

    // Include SHA if file already exists (required for updates)
    if (currentSha) {
      body.sha = currentSha;
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

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("GitHub API error:", errorData);

      if (response.status === 409) {
        // Conflict — SHA mismatch, refetch and retry
        statusEl.remove();
        showStatus("CONFLICT — RETRYING...", "error");
        await getFileSha();
        return await savePostsToGitHub(posts);
      }

      throw new Error(
        `GitHub API error: ${response.status} ${errorData.message || ""}`
      );
    }

    const result = await response.json();
    fileSha = result.content.sha;
    cachedPosts = posts;

    statusEl.remove();
    showStatus("SAVED!", "success");
    return true;
  } catch (err) {
    console.error("Failed to save posts:", err);
    statusEl.remove();
    showStatus("SAVE FAILED!", "error");
    alert(`Failed to save: ${err.message}`);
    return false;
  }
}

/**
 * Upload an image to the repo and return its raw URL
 * Images stored in /blog-images/ folder
 */
async function uploadImageToGitHub(base64Data, filename) {
  if (!githubToken) return null;

  try {
    // Strip the data URL prefix to get pure base64
    const pureBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");

    const path = `blog-images/${filename}`;
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

    // Check if file already exists
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
      // File doesn't exist, that's fine
    }

    const body = {
      message: `Add blog image: ${filename}`,
      content: pureBase64,
      branch: GITHUB_BRANCH,
    };

    if (existingSha) {
      body.sha = existingSha;
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

    if (!response.ok) {
      throw new Error(`Image upload failed: ${response.status}`);
    }

    // Return the raw GitHub URL for the image
    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`;
    return rawUrl;
  } catch (err) {
    console.error("Failed to upload image:", err);
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
  const STAR_COUNT = 180;

  for (let i = 0; i < STAR_COUNT; i++) {
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

// ============ BLOG RENDERING ============
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function parseMarkdown(text) {
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

function renderPosts() {
  const container = document.getElementById("blog-posts");
  if (!container) return;

  const posts = cachedPosts;
  const isAdmin = sessionStorage.getItem("testpage_admin") === "true";

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

    let deleteBtn = "";
    if (isAdmin) {
      deleteBtn = `<button class="delete-post-btn" data-id="${post.id}" title="Delete post">&#10005;</button>`;
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

    const previewContent = parseMarkdown(post.content || "");

    postEl.innerHTML = `
      <div class="blog-post-date">${escapeHtml(post.date)}</div>
      <div class="blog-post-body">
        <div class="blog-post-text">
          <strong ${titleStyle}>${title}</strong><br>
          <span class="preview-text">${previewContent}</span>
        </div>
        <div class="blog-post-image">
          ${imageContent}
        </div>
      </div>
      ${deleteBtn}
    `;

    postEl.addEventListener("click", (e) => {
      if (e.target.closest(".delete-post-btn")) return;
      openPostDetail(post);
    });

    container.appendChild(postEl);
  });

  if (isAdmin) {
    container.querySelectorAll(".delete-post-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        if (confirm("Delete this post?")) {
          await deletePost(id);
        }
      });
    });
  }
}

async function addPost(
  title,
  content,
  color,
  imageUrls = [],
  titleColor = null
) {
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

  // Refetch to avoid conflicts
  await fetchPostsFromGitHub();
  cachedPosts.unshift(newPost);

  const saved = await savePostsToGitHub(cachedPosts);
  if (saved) {
    renderPosts();
    return true;
  } else {
    // Remove the post we just added since save failed
    cachedPosts.shift();
    return false;
  }
}

async function deletePost(id) {
  // Refetch to avoid conflicts
  await fetchPostsFromGitHub();
  cachedPosts = cachedPosts.filter((p) => p.id !== id);

  const saved = await savePostsToGitHub(cachedPosts);
  if (saved) {
    renderPosts();
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
    <div class="post-detail-content" style="color: ${post.color || "inherit"}">${parseMarkdown(post.content || "")}</div>
    ${imagesHtml}
  `;

  detailContent.querySelectorAll(".post-detail-image").forEach((img) => {
    img.addEventListener("click", () => openLightbox(img.src));
  });

  detailModal.classList.remove("hidden");
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

if (lightboxClose) {
  lightboxClose.addEventListener("click", closeLightbox);
}

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
  const text = textarea.value;
  const selection = text.substring(start, end);
  const replacement = startTag + selection + endTag;
  textarea.setRangeText(replacement, start, end, "select");
  textarea.focus();

  saveHistory();
}

function insertColor() {
  const colorPicker = document.getElementById("editor-color");
  const color = colorPicker ? colorPicker.value : "#ffffff";
  insertMarkdown(`{color:${color}}`, `{/color}`);
}

// Toolbar button listeners
document.addEventListener("DOMContentLoaded", () => {
  const btnBold = document.getElementById("btn-bold");
  if (btnBold)
    btnBold.addEventListener("click", () => insertMarkdown("**", "**"));

  const btnItalic = document.getElementById("btn-italic");
  if (btnItalic)
    btnItalic.addEventListener("click", () => insertMarkdown("*", "*"));

  const btnHeader = document.getElementById("btn-header");
  if (btnHeader)
    btnHeader.addEventListener("click", () => insertMarkdown("### ", ""));

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
  const newPostBtn = document.getElementById("new-post-btn");

  if (enabled) {
    sessionStorage.setItem("testpage_admin", "true");
  } else {
    sessionStorage.removeItem("testpage_admin");
    githubToken = null;
  }

  if (loginBtn) loginBtn.classList.toggle("hidden", enabled);
  if (logoutBtn) logoutBtn.classList.toggle("hidden", !enabled);
  if (newPostBtn) newPostBtn.classList.toggle("hidden", !enabled);

  renderPosts();
}

// ============ MAIN INITIALIZATION ============
document.addEventListener("DOMContentLoaded", async () => {
  initStars();

  // Load posts from GitHub on page load
  const statusEl = showStatus("LOADING POSTS...", "saving");
  try {
    await fetchPostsFromGitHub();
    statusEl.remove();
  } catch {
    statusEl.remove();
    showStatus("FAILED TO LOAD POSTS", "error");
  }
  renderPosts();

  // Restore admin session
  if (sessionStorage.getItem("testpage_admin") === "true") {
    // Token is lost on refresh (sessionStorage doesn't store it)
    // Admin will need to re-login to make changes
    setAdminMode(false);
  }

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
    loginCancel.addEventListener("click", () => {
      loginModal.classList.add("hidden");
    });
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

      // Verify the GitHub token works
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

        // Check if token has push permission
        const repoData = await testResponse.json();
        if (!repoData.permissions || !repoData.permissions.push) {
          loginError.textContent = "TOKEN LACKS WRITE ACCESS!";
          loginError.classList.remove("hidden");
          loginSubmit.textContent = "LOGIN";
          loginSubmit.disabled = false;
          return;
        }
      } catch (err) {
        loginError.textContent = "TOKEN VERIFICATION FAILED!";
        loginError.classList.remove("hidden");
        loginSubmit.textContent = "LOGIN";
        loginSubmit.disabled = false;
        return;
      }

      // All good — store token in memory and enable admin
      githubToken = token;
      loginModal.classList.add("hidden");
      setAdminMode(true);
      showStatus("LOGGED IN!", "success");

      loginSubmit.textContent = "LOGIN";
      loginSubmit.disabled = false;
    });
  }

  // Enter in token field triggers login
  if (tokenInput) {
    tokenInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") loginSubmit.click();
    });
  }

  if (passwordInput) {
    passwordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") tokenInput.focus();
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
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
    postCancel.addEventListener("click", () => {
      newPostModal.classList.add("hidden");
    });
  }

  if (postSubmit) {
    postSubmit.addEventListener("click", async () => {
      const content = postContentInput.value.trim();
      const title = document.getElementById("post-title").value.trim();
      const titleColor = document.getElementById("post-title-color").value;
      const color = document.getElementById("post-color").value;
      const imgInput = document.getElementById("post-image");
      const hasImages =
        imgInput && imgInput.files && imgInput.files.length > 0;

      if (!content && !hasImages) {
        alert("Enter text or select an image!");
        return;
      }

      postSubmit.textContent = "UPLOADING...";
      postSubmit.disabled = true;

      const imageUrls = [];

      if (hasImages) {
        for (let i = 0; i < imgInput.files.length; i++) {
          try {
            // Compress the image first
            const compressed = await compressImage(imgInput.files[i]);

            // Generate unique filename
            const timestamp = Date.now();
            const filename = `img-${timestamp}-${i}.jpg`;

            // Upload to GitHub repo
            const url = await uploadImageToGitHub(compressed, filename);
            if (url) {
              imageUrls.push(url);
            } else {
              console.error("Failed to upload image", i);
            }
          } catch (e) {
            console.error("Failed to process image:", e);
          }
        }
      }

      const success = await addPost(
        title,
        content,
        color,
        imageUrls,
        titleColor
      );

      if (success) {
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
      }

      postSubmit.textContent = "POST";
      postSubmit.disabled = false;
    });
  }

  if (postContentInput) {
    postContentInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.ctrlKey) postSubmit.click();
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
    postDetailClose.addEventListener("click", () => {
      postDetailModal.classList.add("hidden");
    });
  }

  if (postDetailModal) {
    postDetailModal.addEventListener("click", (e) => {
      if (e.target === postDetailModal) postDetailModal.classList.add("hidden");
    });
  }

  // Image upload preview
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

  // Escape key closes modals
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (lightboxModal && !lightboxModal.classList.contains("hidden")) {
        closeLightbox();
        return;
      }
      if (loginModal && !loginModal.classList.contains("hidden")) {
        loginModal.classList.add("hidden");
      }
      if (newPostModal && !newPostModal.classList.contains("hidden")) {
        newPostModal.classList.add("hidden");
      }
      if (postDetailModal && !postDetailModal.classList.contains("hidden")) {
        postDetailModal.classList.add("hidden");
      }
    }
  });
});