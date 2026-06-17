// ---------------------------------------------------------------------------
// sync-posts.mjs
//
// Rebuilds posts.json from the live WordPress site so it is always a true
// snapshot of what is actually published. WordPress is the single source of
// truth now. The generation prompts and the analytics script both read
// posts.json to avoid repeating topics, keep the categories balanced, and
// chart coverage, so keeping posts.json in step with WordPress is what makes
// all of that accurate again.
//
// It runs at the start of each generation job, before Claude writes anything.
// If WordPress cannot be reached, or returns no posts, it leaves the existing
// posts.json untouched rather than wiping your history. Run with:
//   node scripts/sync-posts.mjs
//
// AT DOMAIN CUTOVER: change WP_BASE below to https://profit-pulse.com.au
// ---------------------------------------------------------------------------

import { writeFileSync } from "node:fs";

// The live WordPress site. CHANGE THIS at domain cutover.
const WP_BASE = "https://magenta-raccoon-583639.hostingersite.com";

const PER_PAGE = 100;   // WordPress maximum per page
const MAX_PAGES = 20;   // safety cap, up to 2000 posts

// Turn the handful of HTML entities WordPress returns in titles and excerpts
// back into plain characters, so de-duplication compares clean text.
function decodeEntities(s) {
  return (s || "")
    .replace(/&#8217;|&#039;|&#39;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;|&#8221;|&quot;/g, '"')
    .replace(/&#8211;|&#8212;/g, "-")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "...")
    .trim();
}

function stripTags(html) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Remove the JSON-LD and any other script or style blocks the publisher
// injects, so they are not later counted as post wording.
function stripScripts(html) {
  return (html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "profitpulse-sync" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function main() {
  // 1. Category id to name, so each post carries its readable category.
  const catMap = new Map();
  try {
    const cats = await fetchJson(`${WP_BASE}/wp-json/wp/v2/categories?per_page=100&_fields=id,name`);
    for (const c of cats) catMap.set(c.id, c.name);
  } catch (err) {
    console.error(`Could not read categories: ${err.message}`);
  }

  // 2. All published posts, newest first, following pagination.
  const raw = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    let batch;
    try {
      batch = await fetchJson(
        `${WP_BASE}/wp-json/wp/v2/posts?per_page=${PER_PAGE}&page=${page}` +
        `&orderby=date&order=desc&_fields=id,date,slug,title,excerpt,content,categories`
      );
    } catch (err) {
      // A 400 here usually just means we asked for a page past the end.
      break;
    }
    if (!Array.isArray(batch) || batch.length === 0) break;
    raw.push(...batch);
    if (batch.length < PER_PAGE) break;
  }

  // 3. Safety: never wipe history on a bad fetch.
  if (raw.length === 0) {
    console.error("WordPress returned no posts. Leaving posts.json untouched.");
    process.exit(0);
  }

  // 4. Map each WordPress post into the shape the prompts and analytics expect.
  const posts = raw.map(p => {
    const firstCat = (p.categories || [])
      .map(id => catMap.get(id))
      .find(n => n && n !== "Uncategorized");
    return {
      date: (p.date || "").split("T")[0],
      category: firstCat || "",
      title: decodeEntities(p.title?.rendered || ""),
      excerpt: decodeEntities(stripTags(p.excerpt?.rendered || "")),
      content: stripScripts(p.content?.rendered || ""),
      faqs: [],   // the FAQ text is already inside content for published posts
    };
  });

  writeFileSync("posts.json", JSON.stringify(posts, null, 2));
  console.log(`Synced posts.json from WordPress (${posts.length} posts).`);
}

main().catch(err => {
  // Any unexpected error: leave posts.json alone and let generation proceed.
  console.error(`sync-posts failed: ${err.message}. Leaving posts.json untouched.`);
  process.exit(0);
});
