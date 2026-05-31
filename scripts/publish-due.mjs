// publish-due.mjs — runs in CI every 15 minutes.
// Moves any scheduled post whose time has arrived into posts.json.

import { readFileSync, writeFileSync } from "fs";

const SCHEDULE_PATH = "docs/data/schedule.json";
const POSTS_PATH    = "posts.json";

// --- load schedule -----------------------------------------------------------

let schedule;
try {
  schedule = JSON.parse(readFileSync(SCHEDULE_PATH, "utf8"));
} catch {
  // Missing or unreadable file — nothing to do.
  process.exit(0);
}

if (!Array.isArray(schedule) || schedule.length === 0) process.exit(0);

const now = new Date();
const due = schedule.filter(
  (e) => e.status === "scheduled" && new Date(e.scheduledFor) <= now
);

if (due.length === 0) process.exit(0);

// --- load posts --------------------------------------------------------------

const posts = JSON.parse(readFileSync(POSTS_PATH, "utf8"));

// --- upsert each due post ----------------------------------------------------

let lastPublishedTitle = null;

for (const entry of due) {
  const post = entry.post;
  post.publishedAt = entry.scheduledFor;

  const idx = posts.findIndex(
    (p) => p.date === post.date && p.title === post.title
  );
  if (idx !== -1) {
    posts[idx] = post;          // replace in place
  } else {
    posts.unshift(post);        // newest first
  }

  entry.status = "published";
  lastPublishedTitle = post.title;
  console.log(`Published: ${post.title} (scheduled for ${entry.scheduledFor})`);
}

// --- write output files ------------------------------------------------------

writeFileSync(POSTS_PATH,        JSON.stringify(posts,    null, 2));
writeFileSync(SCHEDULE_PATH,     JSON.stringify(schedule, null, 2));
// Signal to CI that something was published (used to trigger social generation).
writeFileSync("published-flag.txt", lastPublishedTitle);
