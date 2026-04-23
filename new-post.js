import "dotenv/config";
import readline from "readline";
import fs from "fs";
import path from "path";

const GITHUB_OWNER = "Rollin-Robyn";
const GITHUB_REPO = "Website-Blog";
const GITHUB_BRANCH = "main";
const POSTS_FILE_PATH = "posts.json";
const IMAGES_FOLDER = "blog-images";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("ERROR: GITHUB_TOKEN not found. Create a .env file with GITHUB_TOKEN=your_token");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github.v3+json",
  "Content-Type": "application/json",
};

// ── helpers ──────────────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

async function fetchPosts() {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${POSTS_FILE_PATH}?ref=${GITHUB_BRANCH}&_t=${Date.now()}`;
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch posts.json: ${res.status}`);
  const data = await res.json();
  const decoded = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
  return { posts: JSON.parse(decoded), sha: data.sha };
}

async function savePosts(posts, sha) {
  const content = Buffer.from(JSON.stringify(posts, null, 2)).toString("base64");
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${POSTS_FILE_PATH}`;
  const body = {
    message: `Add new post — ${new Date().toISOString()}`,
    content,
    branch: GITHUB_BRANCH,
    sha,
  };
  const res = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Save failed ${res.status}: ${err.message}`);
  }
  return (await res.json()).content.sha;
}

async function uploadImage(filePath, filename) {
  const raw = fs.readFileSync(filePath);
  const content = raw.toString("base64");
  const apiPath = `${IMAGES_FOLDER}/${filename}`;
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${apiPath}`;

  // Check if file already exists (get sha)
  let existingSha;
  const check = await fetch(url, { headers });
  if (check.ok) existingSha = (await check.json()).sha;

  const body = { message: `Add image: ${filename}`, content, branch: GITHUB_BRANCH };
  if (existingSha) body.sha = existingSha;

  const res = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Image upload failed ${res.status}: ${err.message}`);
  }
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${apiPath}`;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== New Blog Post ===\n");

  const title = (await ask("Title: ")).trim();
  if (!title) { console.error("Title is required."); process.exit(1); }

  const dateInput = (await ask("Date (DD/MM/YY) [leave blank for today]: ")).trim();
  let date = dateInput;
  if (!date) {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(-2);
    date = `${dd}/${mm}/${yy}`;
  }

  console.log("Content (paste your text, then type END on a new line and press Enter):");
  const contentLines = [];
  while (true) {
    const line = await ask("");
    if (line.trim() === "END") break;
    contentLines.push(line);
  }
  const content = contentLines.join("\n");

  // Images
  const imageUrls = [];
  const imagesInput = (await ask("\nImage file paths (comma-separated, or leave blank): ")).trim();
  if (imagesInput) {
    const imagePaths = imagesInput.split(",").map((p) => p.trim()).filter(Boolean);
    const postId = `post-${Date.now()}`;
    for (let i = 0; i < imagePaths.length; i++) {
      const filePath = imagePaths[i];
      if (!fs.existsSync(filePath)) {
        console.warn(`  SKIP: file not found: ${filePath}`);
        continue;
      }
      const ext = path.extname(filePath);
      const filename = `img-${Date.now()}-${i}${ext}`;
      process.stdout.write(`  Uploading ${filename}... `);
      const url = await uploadImage(filePath, filename);
      imageUrls.push(url);
      console.log("done");
    }
  }

  // Build post object
  const post = {
    id: `post-${Date.now()}`,
    date,
    title,
    titleColor: "#ffffff",
    content,
    color: "#ffffff",
    images: imageUrls,
  };

  console.log("\nFetching current posts...");
  const { posts, sha } = await fetchPosts();

  posts.unshift(post); // newest first

  console.log("Saving to GitHub...");
  await savePosts(posts, sha);

  console.log(`\nDone! Post "${title}" published successfully.\n`);
  rl.close();
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  rl.close();
  process.exit(1);
});
