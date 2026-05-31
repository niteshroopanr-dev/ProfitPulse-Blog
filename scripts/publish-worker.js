// ---------------------------------------------------------------------------
// publish-worker.js  —  Cloudflare Worker  (updated: edit + published time)
//
// This is the only piece that holds a GitHub credential, and it lives on
// Cloudflare's servers, never in the browser. When you press Publish (or Save
// changes) in the app, the app sends this Worker the post object and, when
// there is one, the hero image. The Worker makes ONE commit to your repo. If
// anything fails partway, it commits nothing.
//
// What is new in this version:
//   * It records when a post was first published (publishedAt) and when it was
//     last edited (updatedAt), so the app can show those times.
//   * It UPSERTS by date: if a post with the same date already exists it is
//     replaced in place, never added a second time. This makes duplicates
//     impossible, whether you re-publish or edit.
//   * The image is optional. When you edit a post without dropping a new image,
//     the existing image is kept exactly as it was.
//
// HOW TO DEPLOY (each time this file changes):
//   1. Open your Worker in the Cloudflare dashboard and click "Edit code".
//   2. Select all the existing code and delete it, then paste this in.
//   3. Click Deploy. Your GITHUB_TOKEN secret stays as it is.
// ---------------------------------------------------------------------------

const OWNER = "niteshroopanr-dev";
const REPO = "ProfitPulse-Blog";
const BRANCH = "main";
const API = "https://api.github.com";

// Leave as "*" while testing, or set to your GitHub Pages URL to lock it down.
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

function slugify(title) {
  return (title || "post")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

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
    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });
    if (request.method !== "POST") return json({ error: "Use POST." }, 405);

    const token = env.GITHUB_TOKEN;
    if (!token) return json({ error: "Worker is missing its GITHUB_TOKEN secret." }, 500);

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Body was not valid JSON." }, 400);
    }

    const post = payload.post;
    const imageBase64 = payload.imageBase64 || null;       // optional now
    const originalTitle = payload.originalTitle || null;   // sent only when editing
    if (!post || !post.title || !post.date) {
      return json({ error: "Need a post object with a title and a date." }, 400);
    }

    try {
      // 1. Read the current posts.json.
      const current = await gh(token,
        `/repos/${OWNER}/${REPO}/contents/posts.json?ref=${BRANCH}`);
      const decoded = atob(current.content.replace(/\n/g, ""));
      const posts = JSON.parse(decoded);

      // 2. Does this post already exist?
      //    Editing: match the ORIGINAL title on the same date.
      //    Publishing or re-publishing: match the new title on the same date.
      const matchTitle = originalTitle || post.title;
      const idx = posts.findIndex(p => p.date === post.date && p.title === matchTitle);
      const isEdit = idx !== -1;

      // 3. Image handling.
      let rawUrl = null;
      let imagePath = null;
      if (imageBase64) {
        imagePath = `images/${slugify(post.title)}.png`;
        rawUrl = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${imagePath}`;
        if (post.content && post.content.includes("HERO_IMAGE_URL_PENDING")) {
          post.content = post.content.replace("HERO_IMAGE_URL_PENDING", rawUrl);
        } else if (post.content && /<img[^>]*>/i.test(post.content)) {
          // Editing with a replacement image: swap the first <img> tag.
          post.content = post.content.replace(/<img[^>]*>/i, `<img src="${rawUrl}" />`);
        } else {
          post.content = `<img src="${rawUrl}" />` + (post.content || "");
        }
      } else if (!isEdit) {
        // A brand-new post must have a hero image.
        return json({ error: "A new post needs a hero image." }, 400);
      }
      // Editing with no new image: post.content is kept exactly as supplied, so
      // the existing image URL is preserved untouched.

      // 4. Timestamps and upsert. This is what prevents duplicates.
      const nowIso = new Date().toISOString();
      if (isEdit) {
        const prev = posts[idx];
        post.publishedAt = prev.publishedAt || prev.date || nowIso;
        post.updatedAt = nowIso;
        posts[idx] = post;          // replace in place: same slot, no duplicate
      } else {
        post.publishedAt = nowIso;
        posts.unshift(post);        // newest first
      }
      const newPostsJson = JSON.stringify(posts, null, 2);

      // 5. One atomic commit: the image (if any) plus posts.json.
      const ref = await gh(token, `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
      const baseCommitSha = ref.object.sha;
      const baseCommit = await gh(token,
        `/repos/${OWNER}/${REPO}/git/commits/${baseCommitSha}`);
      const baseTreeSha = baseCommit.tree.sha;

      const tree = [];
      if (imageBase64) {
        const imageBlob = await gh(token, `/repos/${OWNER}/${REPO}/git/blobs`, {
          method: "POST",
          body: JSON.stringify({ content: imageBase64, encoding: "base64" }),
        });
        tree.push({ path: imagePath, mode: "100644", type: "blob", sha: imageBlob.sha });
      }
      const postsBlob = await gh(token, `/repos/${OWNER}/${REPO}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: newPostsJson, encoding: "utf-8" }),
      });
      tree.push({ path: "posts.json", mode: "100644", type: "blob", sha: postsBlob.sha });

      const newTree = await gh(token, `/repos/${OWNER}/${REPO}/git/trees`, {
        method: "POST",
        body: JSON.stringify({ base_tree: baseTreeSha, tree }),
      });
      const commit = await gh(token, `/repos/${OWNER}/${REPO}/git/commits`, {
        method: "POST",
        body: JSON.stringify({
          message: `${isEdit ? "Revise" : "Publish"}: ${post.title}`,
          tree: newTree.sha,
          parents: [baseCommitSha],
        }),
      });
      await gh(token, `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha }),
      });

      return json({
        ok: true,
        mode: isEdit ? "revised" : "published",
        imageUrl: rawUrl,
        publishedAt: post.publishedAt,
        updatedAt: post.updatedAt || null,
        message: isEdit
          ? `Revised. "${post.title}" updated in place. Site updates within five minutes.`
          : `Published. Post added to posts.json. Site updates within five minutes.`,
      });
    } catch (err) {
      return json({ error: String(err.message || err) }, 500);
    }
  },
};
