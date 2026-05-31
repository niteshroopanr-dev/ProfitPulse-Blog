// ---------------------------------------------------------------------------
// app.js  —  the dashboard logic
//
// Plain JavaScript, no framework. Three jobs:
//   1. Load today's draft files and fill the Today panel.
//   2. Load analytics.json and draw the charts.
//   3. On Publish, send the edited post and the image to the Cloudflare Worker.
// ---------------------------------------------------------------------------

// ===== CONFIG: the only two lines you need to set =====
const WORKER_URL = "https://yellow-cloud-5dd8profitpulse-publish.nitesh-roopa-nr.workers.dev/";
const RAW_BASE =
  "https://raw.githubusercontent.com/niteshroopanr-dev/ProfitPulse-Blog/main";
// ======================================================

let selectedImageBase64 = null; // set when an image is dropped/chosen
let editing = false;            // true when the loaded date already has a published post
let originalTitle = "";         // title as it exists in posts.json, sent to Worker for upsert

// --- small helpers -----------------------------------------------------------

const $ = (id) => document.getElementById(id);

function brisbaneToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()); // YYYY-MM-DD
}

// Fetch a repo file, adding a timestamp so we never see a stale cached copy.
async function fetchRaw(path) {
  const res = await fetch(`${RAW_BASE}/${path}?t=${Date.now()}`);
  if (!res.ok) throw new Error(`${path} not found`);
  return res;
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
      const res = await fetch(WORKER_URL, {
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

function brisbaneTime(iso) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

async function loadDraft(date) {
  $("summaryLine").textContent = `Loading for ${date}…`;
  $("draftCard").classList.add("hidden");
  selectedImageBase64 = null;
  $("preview").classList.add("hidden");
  $("publishStatus").textContent = "";
  editing = false;
  originalTitle = "";

  // Reset UI state for every load
  $("publishedBadge").classList.add("hidden");
  $("publishedBadge").textContent = "";
  $("editBtn").classList.add("hidden");
  $("publishBtn").disabled = true;
  $("publishBtn").textContent = "Publish";
  setFieldsReadOnly(false);

  // Check whether this date already has a published post
  let publishedPost = null;
  try {
    const posts = await (await fetch(`${RAW_BASE}/posts.json?t=${Date.now()}`)).json();
    publishedPost = posts.find((p) => p.date === date) || null;
  } catch {}

  if (publishedPost) {
    // EDIT MODE — populate from the live post
    editing = true;
    originalTitle = publishedPost.title;

    $("title").value = publishedPost.title || "";
    $("category").value = publishedPost.category || "";
    $("excerpt").value = publishedPost.excerpt || "";
    $("content").value = publishedPost.content || "";
    $("prompt").value = "";

    $("draftCard").dataset.faqs = JSON.stringify(publishedPost.faqs || []);
    $("draftCard").dataset.date = publishedPost.date || date;

    let badge = "Published " + brisbaneTime(publishedPost.publishedAt || publishedPost.date);
    if (publishedPost.updatedAt) badge += "  ·  edited " + brisbaneTime(publishedPost.updatedAt);
    $("publishedBadge").textContent = badge;
    $("publishedBadge").classList.remove("hidden");

    setFieldsReadOnly(true);
    $("editBtn").classList.remove("hidden");
    // publishBtn stays disabled until Edit is clicked

    $("summaryLine").textContent =
      `Published: ${publishedPost.title} (Category: ${publishedPost.category})`;
    $("draftCard").classList.remove("hidden");
  } else {
    // DRAFT MODE — existing behaviour
    try {
      const post = await (await fetchRaw(`drafts/${date}.json`)).json();

      let prompt = "", summary = "";
      try { prompt = await (await fetchRaw(`drafts/${date}.prompt.txt`)).text(); } catch {}
      try { summary = await (await fetchRaw(`drafts/${date}.summary.txt`)).text(); } catch {}

      $("summaryLine").textContent =
        summary.trim() || `Today's draft: ${post.title} (Category: ${post.category})`;

      $("title").value = post.title || "";
      $("category").value = post.category || "";
      $("excerpt").value = post.excerpt || "";
      $("content").value = post.content || "";
      $("prompt").value = prompt.trim();

      $("draftCard").dataset.faqs = JSON.stringify(post.faqs || []);
      $("draftCard").dataset.date = post.date || date;

      $("draftCard").classList.remove("hidden");
    } catch {
      $("summaryLine").textContent =
        `No draft found for ${date}. The 3am job may not have run yet, ` +
        `or you can run it manually from the repo's Actions tab.`;
    }
  }
}

// Copy button for the image prompt (wired at page load; social copy buttons wired after publish)
$("draftCard").querySelectorAll(".copy").forEach((btn) => {
  btn.onclick = async () => {
    await navigator.clipboard.writeText($(btn.dataset.copy).value);
    const old = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = old), 1200);
  };
});

// Edit button — unlocks fields and enables Save
$("editBtn").onclick = () => {
  setFieldsReadOnly(false);
  $("editBtn").classList.add("hidden");
  $("publishBtn").textContent = "Save changes";
  $("publishBtn").disabled = false;
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
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    selectedImageBase64 = dataUrl.split(",")[1]; // strip "data:image/...;base64,"
    $("preview").src = dataUrl;
    $("preview").classList.remove("hidden");
    $("publishBtn").disabled = false;
  };
  reader.readAsDataURL(file);
}

// Publish / Save changes
$("publishBtn").onclick = async () => {
  if (!editing && !selectedImageBase64) return; // image required for new posts only
  if (WORKER_URL.includes("PASTE_YOUR")) {
    $("publishStatus").textContent = "Set WORKER_URL in app.js first.";
    return;
  }
  const btn = $("publishBtn");
  btn.disabled = true;
  $("publishStatus").textContent = editing ? "Saving…" : "Publishing…";

  const post = {
    date: $("draftCard").dataset.date,
    category: $("category").value.trim(),
    title: $("title").value.trim(),
    excerpt: $("excerpt").value.trim(),
    content: $("content").value,
    faqs: JSON.parse($("draftCard").dataset.faqs || "[]"),
  };

  const payload = editing
    ? { post, originalTitle, ...(selectedImageBase64 ? { imageBase64: selectedImageBase64 } : {}) }
    : { post, imageBase64: selectedImageBase64 };

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.ok) {
      $("publishStatus").textContent = data.message;
      const publishedTitle = post.title;
      $("socialPanel").classList.remove("hidden");
      $("socialStatus").textContent = "Drafting your social posts, this takes a minute or two...";
      let attempts = 0;
      const pollTimer = setInterval(async () => {
        attempts++;
        try {
          const sr = await fetch(`${RAW_BASE}/docs/data/social-latest.json?t=${Date.now()}`);
          if (sr.ok) {
            const s = await sr.json();
            if (s.title === publishedTitle) {
              clearInterval(pollTimer);
              $("socialStatus").textContent = "";
              $("li").value = s.linkedin || "";
              $("fb").value = s.facebook || "";
              $("gbp").value = s.google || "";
              $("socialPanel").querySelectorAll(".copy-social").forEach((btn) => {
                btn.onclick = async () => {
                  await navigator.clipboard.writeText($(btn.dataset.copy).value);
                  const old = btn.textContent;
                  btn.textContent = "Copied";
                  setTimeout(() => (btn.textContent = old), 1200);
                };
              });
              return;
            }
          }
          // 404 or title mismatch: continue polling
        } catch {}
        if (attempts >= 12) {
          clearInterval(pollTimer);
          $("socialStatus").textContent =
            "Your social posts are still being prepared. Reload the page in a minute to see them.";
        }
      }, 15000);
    } else {
      $("publishStatus").textContent = `Failed: ${data.error}`;
      btn.disabled = false;
    }
  } catch (e) {
    $("publishStatus").textContent = `Failed: ${e.message}`;
    btn.disabled = false;
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
