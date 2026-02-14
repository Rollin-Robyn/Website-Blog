/* ============================================
   testPage — Client-Side Logic
   Blog CRUD · Admin Auth · Star Animation
   ============================================ */

// ============ CONFIGURATION ============
const ADMIN_USERNAME_HASH =
  "575aad173fe88daee328513f7863c40938ac02bfda2c3e384d3c5c5a83d0e3cf";
const ADMIN_PASSWORD_HASH =
  "db7009bbc0ea420246146b8336df6f33f7e67d7f1389c1f58496d012a2f29e39";
const BLOG_STORAGE_KEY = "testpage_blog_posts";

// ============ SHA-256 HASHING ============
async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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

  // Occasional shooting star
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

    // Draw regular stars
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

    // Draw shooting star
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

      // Glow at head
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
      ctx.fill();

      if (s.life >= s.maxLife) {
        shootingStar = null;
      }
    }

    requestAnimationFrame(animate);
  }

  animate();
}

// ============ BLOG MANAGEMENT ============
function getDefaultPosts() {
  return [
    {
      id: "default-1",
      date: "14/02/26",
      content:
        "Welcome to my page! This is my first blog post. Still working on things but it's coming together nicely!",
    },
    {
      id: "default-2",
      date: "14/02/26",
      content:
        "Just finished setting up the layout. Pretty happy with how the retro aesthetic turned out. More updates coming soon...",
    },
  ];
}

function loadPosts() {
  const stored = localStorage.getItem(BLOG_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return getDefaultPosts();
    }
  }
  const defaults = getDefaultPosts();
  savePosts(defaults);
  return defaults;
}

function savePosts(posts) {
  localStorage.setItem(BLOG_STORAGE_KEY, JSON.stringify(posts));
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderPosts() {
  const container = document.getElementById("blog-posts");
  if (!container) return;

  const posts = loadPosts();
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

    // Preview: parse markdown but limit lines via CSS
    const previewContent = parseMarkdown(post.content);

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

    // Click to open detail (but not if clicking delete)
    postEl.addEventListener("click", (e) => {
      if (e.target.closest(".delete-post-btn")) return;
      openPostDetail(post);
    });

    container.appendChild(postEl);
  });

  // Attach delete handlers
  if (isAdmin) {
    container.querySelectorAll(".delete-post-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        if (confirm("Delete this post?")) {
          deletePost(id);
        }
      });
    });
  }
}

function addPost(title, content, color, imagesBase64 = [], titleColor = null) {
  const posts = loadPosts();
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
    images: imagesBase64,
  };

  posts.unshift(newPost);
  try {
    savePosts(posts);
    renderPosts();
    return true;
  } catch (e) {
    if (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED") {
      alert("Storage full! Image might be too big.");
    } else {
      console.error("Failed to save post:", e);
      alert("Error saving post!");
    }
    return false;
  }
}

function deletePost(id) {
  let posts = loadPosts();
  posts = posts.filter((p) => p.id !== id);
  savePosts(posts);
  renderPosts();
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

  // Add click listeners to images for lightbox
  const detailImages = detailContent.querySelectorAll(".post-detail-image");
  detailImages.forEach((img) => {
    img.addEventListener("click", () => openLightbox(img.src));
  });

  detailModal.classList.remove("hidden");
}

/* Lightbox Logic */
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
    if (e.target !== lightboxImg) {
      closeLightbox();
    }
  });
}

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

function parseMarkdown(text) {
  let md = escapeHtml(text);
  
  // Headers (Order matters: most hashes first)
  md = md.replace(/^###### (.*$)/gim, "<h6>$1</h6>");
  md = md.replace(/^##### (.*$)/gim, "<h5>$1</h5>");
  md = md.replace(/^#### (.*$)/gim, "<h4>$1</h4>");
  md = md.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  md = md.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  md = md.replace(/^# (.*$)/gim, "<h1>$1</h1>");

  // Bold, Italic
  md = md.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  md = md.replace(/\*(.*?)\*/g, "<em>$1</em>");
  
  // Color: {color:#hex}text{/color}
  // Add text-shadow to match color for glow effect
  md = md.replace(
    /\{color:(.*?)\}(.*?)\{\/color\}/g,
    '<span style="color:$1; text-shadow: 0 0 5px $1" class="preview-color-span">$2</span>'
  );

  // Newlines
  md = md.replace(/\n/g, "<br>");
  return md;
}

// Editor Toolbar Logic
let historyStack = [];
let historyIndex = -1;

function saveHistory() {
  const textarea = document.getElementById("post-content");
  if (!textarea) return;
  
  const val = textarea.value;
  // If no change, don't save
  if (historyIndex >= 0 && historyStack[historyIndex] === val) return;

  // Remove redo history if we typed new things
  if (historyIndex < historyStack.length - 1) {
    historyStack = historyStack.slice(0, historyIndex + 1);
  }
  
  historyStack.push(val);
  historyIndex++;
  
  // Cap history size
  if (historyStack.length > 50) {
    historyStack.shift();
    historyIndex--;
  }
}

function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    const val = historyStack[historyIndex];
    document.getElementById("post-content").value = val;
  }
}

function redo() {
  if (historyIndex < historyStack.length - 1) {
    historyIndex++;
    const val = historyStack[historyIndex];
    document.getElementById("post-content").value = val;
  }
}

function insertMarkdown(startTag, endTag) {
  const textarea = document.getElementById("post-content");
  if (!textarea) return;
  
  // Save state before modification
  saveHistory();

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selection = text.substring(start, end);

  const replacement = startTag + selection + endTag;
  textarea.setRangeText(replacement, start, end, "select");
  textarea.focus();
  
  // Save state after modification
  saveHistory();
}

function insertColor() {
  const colorPicker = document.getElementById("editor-color");
  const color = colorPicker ? colorPicker.value : "#ffffff";
  insertMarkdown(`{color:${color}}`, `{/color}`);
}

// Attach listener for toolbar
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
        // Save initial state
        saveHistory();
        textarea.addEventListener("input", () => {
             saveHistory();
        });
    }
});

// ============ AUTH ============
async function attemptLogin(username, password) {
  const usernameHash = await sha256(username);
  const passwordHash = await sha256(password);
  return (
    usernameHash === ADMIN_USERNAME_HASH && passwordHash === ADMIN_PASSWORD_HASH
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
  }

  if (loginBtn) loginBtn.classList.toggle("hidden", enabled);
  if (logoutBtn) logoutBtn.classList.toggle("hidden", !enabled);
  if (newPostBtn) newPostBtn.classList.toggle("hidden", !enabled);

  renderPosts();
}

// ============ INITIALIZATION ============
document.addEventListener("DOMContentLoaded", () => {
  initStars();
  renderPosts();

  // Restore admin session if active
  if (sessionStorage.getItem("testpage_admin") === "true") {
    setAdminMode(true);
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

  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      loginModal.classList.remove("hidden");
      usernameInput.value = "";
      passwordInput.value = "";
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

      if (!username || !password) {
        loginError.textContent = "FILL IN ALL FIELDS!";
        loginError.classList.remove("hidden");
        return;
      }

      loginSubmit.textContent = "CHECKING...";
      loginSubmit.disabled = true;

      const success = await attemptLogin(username, password);

      if (success) {
        loginModal.classList.add("hidden");
        setAdminMode(true);
      } else {
        loginError.textContent = "WRONG CREDENTIALS!";
        loginError.classList.remove("hidden");
      }

      loginSubmit.textContent = "LOGIN";
      loginSubmit.disabled = false;
    });
  }

  // Enter key in password field triggers login
  if (passwordInput) {
    passwordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") loginSubmit.click();
    });
  }

  // Logout
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      setAdminMode(false);
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
      const hasImages = imgInput && imgInput.files && imgInput.files.length > 0;

      if (content || hasImages) {
        postSubmit.textContent = "COMPRESSING...";
        postSubmit.disabled = true;

        const imagesBase64 = [];

        if (hasImages) {
          for (let i = 0; i < imgInput.files.length; i++) {
            try {
              const b64 = await compressImage(imgInput.files[i]);
              imagesBase64.push(b64);
            } catch (e) {
              console.error("Failed to process image:", e);
              alert("Failed to process image!");
            }
          }
        }

        if (addPost(title, content, color, imagesBase64, titleColor)) {
          newPostModal.classList.add("hidden");
          postContentInput.value = "";
          if (document.getElementById("post-title")) document.getElementById("post-title").value = "";
          if (document.getElementById("post-title-color")) document.getElementById("post-title-color").value = "#ff00de";
          imgInput.value = "";
          const preview = document.getElementById("image-preview");
          if (preview) {
             preview.innerHTML = "";
             preview.classList.remove("show");
          }
        }
        
        postSubmit.textContent = "POST";
        postSubmit.disabled = false;
      } else {
        alert("Enter text or select an image!");
      }
    });
  }

  // Ctrl+Enter in textarea to submit
  if (postContentInput) {
    postContentInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.ctrlKey) {
        postSubmit.click();
      }
    });
  }

  // Close modals on overlay click
  [loginModal, newPostModal].forEach((modal) => {
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.classList.add("hidden");
        }
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
      if (e.target === postDetailModal) {
        postDetailModal.classList.add("hidden");
      }
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
