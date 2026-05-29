// ---------------------------------------------------------------------------
// publish-worker.js  —  Cloudflare Worker
//
// This is the only piece that holds a GitHub credential, and it lives on
// Cloudflare's servers, never in the browser. When you press Publish in the
// app, the app sends this Worker the (possibly edited) post object and the
// hero image. The Worker then makes ONE commit to your repo containing both
// the image and the updated posts.json. If anything fails partway, it commits
// nothing, so the repo is never left half-updated.
//
// HOW TO DEPLOY (one time):
//   1. Create a free Cloudflare account, go to Workers, "Create application",
//      "Create Worker", and replace the sample code with this file.
//   2. In the Worker's Settings > Variables, add a SECRET named GITHUB_TOKEN.
//      Its value is a GitHub fine-grained personal access token scoped to ONLY
//      the ProfitPulse-Blog repository, with Read and Write access to
//      "Contents". Nothing else.
//   3. Deploy. Copy the Worker's URL (looks like
//      https://profitpulse-publish.<your-subdomain>.workers.dev).
//   4. Paste that URL into docs/app.js where WORKER_URL is defined.
// ---------------------------------------------------------------------------

const OWNER = "niteshroopanr-dev";
const REPO = "ProfitPulse-Blog";
const BRANCH = "main";
const API = "https://api.github.com";

// Only allow your dashboard's origin to call this Worker. Replace with your
// GitHub Pages URL once you have it (or leave "*" while testing).
const ALLOWED_ORIGIN = "*";

function cors() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

// Turn a post title into a safe file name, e.g.
// "Cash flow forecasting for trades" -> "cash-flow-forecasting-for-trades".
function slugify(title) {
  return (title || "post")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Small wrapper around the GitHub API with the auth header attached.
async function gh(token, path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "profitpulse-publish-worker",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

export default {
  async fetch(request, env) {
    // Browser pre-flight check.
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }
    if (request.method !== "POST") {
      return json({ error: "Use POST." }, 405);
    }

    const token = env.GITHUB_TOKEN;
    if (!token) {
      return json({ error: "Worker is missing its GITHUB_TOKEN secret." }, 500);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Body was not valid JSON." }, 400);
    }

    const post = payload.post;
    const imageBase64 = payload.imageBase64; // raw base64, no data: prefix
    if (!post || !post.title || !imageBase64) {
      return json({ error: "Need a post object (with title) and an image." }, 400);
    }

    const slug = slugify(post.title);
    const imagePath = `images/${slug}.png`;
    const rawUrl =
      `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${imagePath}`;

    try {
      // 1. Put the real image URL into the post content.
      post.content = (post.content || "").replace("HERO_IMAGE_URL_PENDING", rawUrl);

      // 2. Read the current posts.json so we can prepend the new post.
      const current = await gh(token,
        `/repos/${OWNER}/${REPO}/contents/posts.json?ref=${BRANCH}`);
      const decoded = atob(current.content.replace(/\n/g, ""));
      const posts = JSON.parse(decoded);
      posts.unshift(post); // newest first
      const newPostsJson = JSON.stringify(posts, null, 2);

      // 3. Build ONE commit containing both files, using the Git Data API.
      //    This is what guarantees all-or-nothing: the commit either contains
      //    both files or is never created.

      // 3a. Where main currently points.
      const ref = await gh(token, `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
      const baseCommitSha = ref.object.sha;
      const baseCommit = await gh(token,
        `/repos/${OWNER}/${REPO}/git/commits/${baseCommitSha}`);
      const baseTreeSha = baseCommit.tree.sha;

      // 3b. Upload the two file contents as "blobs".
      const imageBlob = await gh(token, `/repos/${OWNER}/${REPO}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: imageBase64, encoding: "base64" }),
      });
      const postsBlob = await gh(token, `/repos/${OWNER}/${REPO}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: newPostsJson, encoding: "utf-8" }),
      });

      // 3c. Make a new tree that adds both files on top of the current one.
      const tree = await gh(token, `/repos/${OWNER}/${REPO}/git/trees`, {
        method: "POST",
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: [
            { path: imagePath, mode: "100644", type: "blob", sha: imageBlob.sha },
            { path: "posts.json", mode: "100644", type: "blob", sha: postsBlob.sha },
          ],
        }),
      });

      // 3d. Create the commit.
      const commit = await gh(token, `/repos/${OWNER}/${REPO}/git/commits`, {
        method: "POST",
        body: JSON.stringify({
          message: `Publish: ${post.title}`,
          tree: tree.sha,
          parents: [baseCommitSha],
        }),
      });

      // 3e. Move main to the new commit. Only now does anything become live.
      await gh(token, `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha }),
      });

      return json({
        ok: true,
        imageUrl: rawUrl,
        message: `Published. Image at ${rawUrl}, post added to posts.json. Site updates within five minutes.`,
      });
    } catch (err) {
      // Nothing was committed if we reach here before step 3e completed.
      return json({ error: String(err.message || err) }, 500);
    }
  },
};
