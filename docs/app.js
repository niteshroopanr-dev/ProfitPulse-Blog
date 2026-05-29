// ---------------------------------------------------------------------------
// app.js  —  the dashboard logic
//
// Plain JavaScript, no framework. Three jobs:
//   1. Load today's draft files and fill the Today panel.
//   2. Load analytics.json and draw the charts.
//   3. On Publish, send the edited post and the image to the Cloudflare Worker.
// ---------------------------------------------------------------------------

// ===== CONFIG: the only two lines you need to set =====
const WORKER_URL = "PASTE_YOUR_CLOUDFLARE_WORKER_URL_HERE";
const RAW_BASE =
  "https://raw.githubusercontent.com/niteshroopanr-dev/ProfitPulse-Blog/main";
// ======================================================

let selectedImageBase64 = null; // set when an image is dropped/chosen

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

// --- TODAY panel -------------------------------------------------------------

async function loadDraft(date) {
  $("summaryLine").textContent = `Loading draft for ${date}…`;
  $("draftCard").classList.add("hidden");
  selectedImageBase64 = null;
  $("preview").classList.add("hidden");
  $("publishBtn").disabled = true;
  $("publishStatus").textContent = "";

  try {
    const post = await (await fetchRaw(`drafts/${date}.json`)).json();

    // Optional companion files; ignore if missing.
    let prompt = "", social = {}, summary = "";
    try { prompt = await (await fetchRaw(`drafts/${date}.prompt.txt`)).text(); } catch {}
    try { social = await (await fetchRaw(`drafts/${date}.social.json`)).json(); } catch {}
    try { summary = await (await fetchRaw(`drafts/${date}.summary.txt`)).text(); } catch {}

    $("summaryLine").textContent =
      summary.trim() || `Today's draft: ${post.title} (Category: ${post.category})`;

    $("title").value = post.title || "";
    $("category").value = post.category || "";
    $("excerpt").value = post.excerpt || "";
    $("content").value = post.content || "";
    $("prompt").value = prompt.trim();
    $("linkedin").value = social.linkedin || "";
    $("facebook").value = social.facebook || "";
    $("xpost").value = social.x || "";

    // Keep the original faqs and date so they survive publishing.
    $("draftCard").dataset.faqs = JSON.stringify(post.faqs || []);
    $("draftCard").dataset.date = post.date || date;

    $("draftCard").classList.remove("hidden");
  } catch (e) {
    $("summaryLine").textContent =
      `No draft found for ${date}. The 3am job may not have run yet, ` +
      `or you can run it manually from the repo's Actions tab.`;
  }
}

// Copy buttons
document.querySelectorAll(".copy").forEach((btn) => {
  btn.onclick = async () => {
    const el = $(btn.dataset.copy === "xpost" ? "xpost" : btn.dataset.copy);
    await navigator.clipboard.writeText(el.value);
    const old = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = old), 1200);
  };
});

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

// Publish
$("publishBtn").onclick = async () => {
  if (!selectedImageBase64) return;
  if (WORKER_URL.includes("PASTE_YOUR")) {
    $("publishStatus").textContent = "Set WORKER_URL in app.js first.";
    return;
  }
  const btn = $("publishBtn");
  btn.disabled = true;
  $("publishStatus").textContent = "Publishing…";

  const post = {
    date: $("draftCard").dataset.date,
    category: $("category").value.trim(),
    title: $("title").value.trim(),
    excerpt: $("excerpt").value.trim(),
    content: $("content").value,
    faqs: JSON.parse($("draftCard").dataset.faqs || "[]"),
  };

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post, imageBase64: selectedImageBase64 }),
    });
    const data = await res.json();
    if (data.ok) {
      $("publishStatus").textContent = data.message;
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
