// ---------------------------------------------------------------------------
// app.js  —  the dashboard logic
//
// Plain JavaScript, no framework. Three jobs:
//   1. Load a date's draft files (post, prompt, summary, social) and fill the Today panel.
//   2. Load analytics.json and draw the charts.
//   3. On Publish, send the edited post and the image to the WordPress publisher Worker.
// ---------------------------------------------------------------------------

// ===== CONFIG: set these for your environment =====
// Draft generation still runs on the original generation worker.
const GEN_URL = "https://yellow-cloud-5dd8profitpulse-publish.nitesh-roopa-nr.workers.dev/";
// Publishing now creates real WordPress posts via the publisher worker.
const PUBLISH_URL = "https://profitpulse-blog-publisher.nitesh-roopa-nr.workers.dev/";
// The live WordPress site. Used to detect already-published posts and to open the editor.
// CHANGE THIS to https://profit-pulse.com.au when the site moves to the real domain.
const WP_BASE = "https://magenta-raccoon-583639.hostingersite.com";
// The GitHub repo that holds the generated drafts.
const RAW_BASE =
  "https://raw.githubusercontent.com/niteshroopanr-dev/ProfitPulse-Blog/main";
// ==================================================

let selectedImageFile = null;   // the chosen hero File, sent to the worker as raw binary
let publishedPostId = null;     // WordPress post id, if this date is already live

// --- small helpers -----------------------------------------------------------

const $ = (id) => document.getElementById(id);

function brisbaneToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()); // YYYY-MM-DD
}

// Mirror of the Worker's slug rule, so the tool can find a post in WordPress by title.
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Fetch a repo file, adding a timestamp so we never see a stale cached copy.
async function fetchRaw(path) {
  const res = await fetch(`${RAW_BASE}/${path}?t=${Date.now()}`);
  if (!res.ok) throw new Error(`${path} not found`);
  return res;
}

// Ask WordPress whether a post with this slug is already published.
async function findPublished(slug) {
  try {
    const res = await fetch(
      `${WP_BASE}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_fields=id,link`
    );
    if (!res.ok) return null;
    const arr = await res.json();
    return Array.isArray(arr) && arr[0] ? arr[0] : null;
  } catch {
    return null;
  }
}

// --- tab switching -----------------------------------------------------------

$("tab-today").onclick = () => switchTab("today");
$("tab-analytics").onclick = () => switchTab("analytics");

function switchTab(which) {
  const today = which === "today";
  $("view-today").classList.toggle("hidden", !today);
  $("view-analytics").classList.toggle("hidden", today);
  $("tab-today").classList.toggle("active", today);
  $("tab-analytics").classList.toggle("active", !today);
  if (!today) loadAnalytics();
}

// --- Generate buttons --------------------------------------------------------

document.querySelectorAll("[data-days]").forEach((btn) => {
  btn.onclick = async () => {
    const days = btn.dataset.days;
    $("genStatus").textContent = `Generating ${days} days of drafts. They will appear in a couple of minutes.`;
    try {
      const res = await fetch(GEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", days: Number(days) }),
      });
      const data = await res.json();
      $("genStatus").textContent = data.ok ? data.message : `Error: ${data.error}`;
    } catch (e) {
      $("genStatus").textContent = `Error: ${e.message}`;
    }
  };
});

// --- TODAY panel -------------------------------------------------------------

function setFieldsReadOnly(readonly) {
  ["title", "category", "excerpt", "content"].forEach((id) => {
    $(id).readOnly = readonly;
  });
}

// Load and show the social drafts for this post.
// Each post is now generated with its own dated file at drafts/<date>.social.json,
// which is the same on every device and is never overwritten by a later post.
// The single docs/data/social-latest.json file (written by the manual social
// workflow) and a copy kept in this browser are used as fallbacks.
async function loadSocial(date, postTitle) {
  $("li").value = "";
  $("fb").value = "";
  $("gbp").value = "";
  $("socialPanel").classList.add("hidden");
  $("socialStatus").textContent = "";
  if (!date) return;

  const key = "pp-social-" + date;

  function save(s) {
    try {
      localStorage.setItem(key, JSON.stringify({
        title: s.title || postTitle || "",
        linkedin: s.linkedin || "",
        facebook: s.facebook || "",
        google: s.google || "",
      }));
    } catch { /* storage may be unavailable */ }
  }

  function show(s, saved) {
    $("li").value = s.linkedin || "";
    $("fb").value = s.facebook || "";
    $("gbp").value = s.google || s.gbp || "";
    $("socialStatus").textContent = saved ? "Saved on this device." : "";
    $("socialPanel").classList.remove("hidden");
  }

  // 1. The durable per-date file written when the post was generated.
  try {
    const s = await (await fetch(`${RAW_BASE}/drafts/${date}.social.json?t=${Date.now()}`)).json();
    if (s && (s.linkedin || s.facebook || s.google)) {
      save(s);
      show(s, false);
      return;
    }
  } catch { /* no per-date file */ }

  // 2. The single latest file, if it is still about this post.
  if (postTitle) {
    try {
      const s = await (await fetch(`${RAW_BASE}/docs/data/social-latest.json?t=${Date.now()}`)).json();
      if (s && s.title === postTitle) {
        save(s);
        show(s, false);
        return;
      }
    } catch { /* latest file not reachable */ }
  }

  // 3. A copy saved in this browser earlier.
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (saved && (saved.linkedin || saved.facebook || saved.google)) {
      show(saved, true);
      return;
    }
  } catch { /* storage unavailable */ }

  // 4. Nothing for this post yet.
  $("socialStatus").textContent =
    "Social drafts for this post are not ready yet. They are written when the post is generated. If you just generated it, reload in a minute.";
  $("socialPanel").classList.remove("hidden");
}

async function loadDraft(date) {
  $("summaryLine").textContent = `Loading for ${date}…`;
  $("draftCard").classList.add("hidden");
  selectedImageFile = null;
  publishedPostId = null;
  $("preview").classList.add("hidden");
  $("publishStatus").textContent = "";

  // Reset UI state for every load
  $("publishedBadge").classList.add("hidden");
  $("publishedBadge").innerHTML = "";
  $("editBtn").classList.add("hidden");
  $("publishBtn").classList.remove("hidden");
  $("publishBtn").disabled = true;
  $("publishBtn").textContent = "Publish";
  if ($("imageAlt")) $("imageAlt").value = "";
  setFieldsReadOnly(false);

  // Load the generated draft for this date.
  let post = null, prompt = "", summary = "";
  try {
    post = await (await fetchRaw(`drafts/${date}.json`)).json();
    try { prompt = await (await fetchRaw(`drafts/${date}.prompt.txt`)).text(); } catch {}
    try { summary = await (await fetchRaw(`drafts/${date}.summary.txt`)).text(); } catch {}
  } catch {
    $("summaryLine").textContent =
      `No draft found for ${date}. The 3am job may not have run yet, ` +
      `or you can generate from the buttons above.`;
    return;
  }

  // Fill the fields from the draft.
  $("title").value = post.title || "";
  $("category").value = post.category || "";
  $("excerpt").value = post.excerpt || "";
  $("content").value = post.content || "";
  $("prompt").value = prompt.trim();
  $("draftCard").dataset.faqs = JSON.stringify(post.faqs || []);
  $("draftCard").dataset.date = post.date || date;
  $("draftCard").classList.remove("hidden");

  await loadSocial(date, post.title);

  // Is this post already live in WordPress?
  const live = await findPublished(slugify(post.title));
  if (live) {
    // PUBLISHED — show as read only, point edits to WordPress, no re-publish.
    publishedPostId = live.id;
    setFieldsReadOnly(true);
    $("publishBtn").classList.add("hidden");
    $("publishedBadge").innerHTML =
      `Published. <a href="${live.link}" target="_blank" rel="noopener">View live post</a>`;
    $("publishedBadge").classList.remove("hidden");
    $("editBtn").textContent = "Edit in WordPress";
    $("editBtn").classList.remove("hidden");
    $("summaryLine").textContent =
      `Published: ${post.title} (Category: ${post.category})`;
  } else {
    // NOT YET PUBLISHED — draft mode. Publish unlocks once a hero image is added.
    $("summaryLine").textContent =
      summary.trim() || `Today's draft: ${post.title} (Category: ${post.category})`;
  }
}

// Copy buttons — wired once at page load for both the prompt field and the social panel.
$("draftCard").querySelectorAll(".copy").forEach((btn) => {
  btn.onclick = async () => {
    await navigator.clipboard.writeText($(btn.dataset.copy).value);
    const old = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = old), 1200);
  };
});
document.querySelectorAll(".copy-social").forEach((btn) => {
  btn.onclick = async () => {
    await navigator.clipboard.writeText($(btn.dataset.copy).value);
    const old = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = old), 1200);
  };
});

// Edit button — for an already-published post, opens it in the WordPress editor.
$("editBtn").onclick = () => {
  if (publishedPostId) {
    window.open(
      `${WP_BASE}/wp-admin/post.php?post=${publishedPostId}&action=edit`,
      "_blank",
      "noopener"
    );
  }
};

// Image drop zone
const dz = $("dropzone");
dz.onclick = () => $("imageInput").click();
$("imageInput").onchange = (e) => handleImage(e.target.files[0]);
["dragover", "dragenter"].forEach((ev) =>
  dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) =>
  dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("over"); }));
dz.addEventListener("drop", (e) => {
  if (e.dataTransfer.files[0]) handleImage(e.dataTransfer.files[0]);
});

function handleImage(file) {
  if (!file) return;
  selectedImageFile = file; // kept as-is and sent to the worker as raw binary (no base64)
  const reader = new FileReader();
  reader.onload = () => {
    $("preview").src = reader.result; // data URL used only for the on-page preview
    $("preview").classList.remove("hidden");
    if (!publishedPostId) $("publishBtn").disabled = false;
  };
  reader.readAsDataURL(file);
}

// Build the post object from the editable fields.
function collectPost() {
  return {
    date: $("draftCard").dataset.date,
    category: $("category").value.trim(),
    title: $("title").value.trim(),
    excerpt: $("excerpt").value.trim(),
    content: $("content").value,
    faqs: JSON.parse($("draftCard").dataset.faqs || "[]"),
  };
}

function imageAltValue() {
  return ($("imageAlt") && $("imageAlt").value.trim()) || "";
}

// Publish
$("publishBtn").onclick = async () => {
  if (!selectedImageFile) {
    $("publishStatus").textContent = "Add a hero image first.";
    return;
  }
  const btn = $("publishBtn");
  btn.disabled = true;
  $("publishStatus").textContent = "Publishing…";

  // Send the post fields as JSON and the hero image as raw binary in one
  // multipart request. The browser never base64-encodes and the worker never
  // base64-decodes, so the worker stays under Cloudflare's CPU limit.
  const fd = new FormData();
  fd.append("payload", JSON.stringify({ post: collectPost(), imageAlt: imageAltValue() }));
  fd.append("image", selectedImageFile, selectedImageFile.name || "hero.png");

  try {
    // No Content-Type header: the browser sets multipart/form-data with its boundary.
    const res = await fetch(PUBLISH_URL, { method: "POST", body: fd });
    const data = await res.json();
    if (data.ok) {
      $("publishStatus").innerHTML =
        `${data.message}. <a href="${data.url}" target="_blank" rel="noopener">View live post</a>. ` +
        `Your social drafts are below. Paste the live link into the first LinkedIn comment.`;
      // Flip to published state without needing a reload.
      setFieldsReadOnly(true);
      $("publishBtn").classList.add("hidden");
    } else {
      $("publishStatus").textContent = `Failed: ${data.error}`;
      btn.disabled = false;
    }
  } catch (e) {
    $("publishStatus").textContent = `Failed: ${e.message}`;
    btn.disabled = false;
  }
};

// Schedule
$("scheduleBtn").onclick = async () => {
  if (!selectedImageFile) {
    $("publishStatus").textContent = "Scheduling needs a hero image.";
    return;
  }
  const scheduleAtValue = $("scheduleAt").value;
  if (!scheduleAtValue) {
    $("publishStatus").textContent = "Pick a date and time first.";
    return;
  }
  const scheduledFor = new Date(scheduleAtValue).toISOString();
  $("publishStatus").textContent = "Scheduling…";
  // Same multipart approach as Publish: post fields as JSON, image as raw binary.
  const fd = new FormData();
  fd.append("payload", JSON.stringify({ action: "schedule", post: collectPost(), scheduledFor, imageAlt: imageAltValue() }));
  fd.append("image", selectedImageFile, selectedImageFile.name || "hero.png");
  try {
    const res = await fetch(PUBLISH_URL, { method: "POST", body: fd });
    const data = await res.json();
    $("publishStatus").textContent = data.ok ? data.message : `Failed: ${data.error}`;
  } catch (e) {
    $("publishStatus").textContent = `Failed: ${e.message}`;
  }
};

// --- ANALYTICS panel ---------------------------------------------------------

let analyticsLoaded = false;

async function loadAnalytics() {
  if (analyticsLoaded) return;
  let a;
  try {
    a = await (await fetch(`data/analytics.json?t=${Date.now()}`)).json();
  } catch {
    $("analyticsMeta").textContent = "Analytics not available yet.";
    return;
  }
  analyticsLoaded = true;

  // Category bar chart
  new Chart($("catChart"), {
    type: "bar",
    data: {
      labels: a.categories.map((c) => c.name),
      datasets: [{ label: "Posts", data: a.categories.map((c) => c.count),
        backgroundColor: "#1a2940" }],
    },
    options: { plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });

  // Gap readout under the chart
  $("catGaps").innerHTML = a.categories.map((c) => {
    const gap = c.daysSinceLast == null ? "never posted"
      : `${c.daysSinceLast} day${c.daysSinceLast === 1 ? "" : "s"} ago`;
    const warn = (c.daysSinceLast == null || c.daysSinceLast > 21) ? " warn" : "";
    return `<div class="gap${warn}"><span>${c.name}</span><span>${gap}</span></div>`;
  }).join("");

  // Cadence line chart
  new Chart($("weekChart"), {
    type: "line",
    data: {
      labels: a.postsPerWeek.map((w) => w.week),
      datasets: [{ label: "Posts/week", data: a.postsPerWeek.map((w) => w.count),
        borderColor: "#c9a96e", backgroundColor: "#c9a96e", tension: 0.3 }],
    },
    options: { plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });

  // Repeated themes as chips
  $("terms").innerHTML = a.repeatedTerms.map((t) =>
    `<span class="chip">${t.term} <b>${t.count}</b></span>`).join("");

  // Untouched lists
  $("untouchedIndustries").innerHTML =
    (a.industries.untouched.length
      ? a.industries.untouched.map((n) => `<li>${n}</li>`).join("")
      : "<li class='ok'>All industries covered.</li>");
  $("untouchedServices").innerHTML =
    (a.services.untouched.length
      ? a.services.untouched.map((n) => `<li>${n}</li>`).join("")
      : "<li class='ok'>All services referenced.</li>");

  // Link distribution
  $("linkTargets").innerHTML = a.linkTargets.map((l) =>
    `<li><span class="muted">${l.url.replace("https://", "")}</span> <b>${l.count}</b></li>`).join("");

  const when = new Date(a.generatedAt).toLocaleString("en-AU",
    { timeZone: "Australia/Brisbane" });
  $("analyticsMeta").textContent =
    `${a.totalPosts} posts analysed. Last updated ${when} (Brisbane).`;
}

// --- start up ----------------------------------------------------------------

const today = brisbaneToday();
$("datePicker").value = today;
$("reloadBtn").onclick = () => loadDraft($("datePicker").value);
loadDraft(today);

// Register the service worker so the app can be installed.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
