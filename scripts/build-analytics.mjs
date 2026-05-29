// ---------------------------------------------------------------------------
// build-analytics.mjs
//
// Reads every published post plus the two reference files, then writes a single
// docs/data/analytics.json that the dashboard charts. No external packages are
// used, so there is nothing to install. Run with:  node scripts/build-analytics.mjs
//
// Everything you might want to tune (the stopword list, how many repeated terms
// to keep, the minimum count to count as "repeated") is grouped near the top and
// labelled in plain English.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

// --- Settings you can adjust -------------------------------------------------

// The six categories your content rotates through. Used to show balance.
const CATEGORIES = [
  "Cash Flow",
  "Profitability",
  "Valuation & Exit",
  "Capital & Finance",
  "Fractional CFO",
  "Industry Focus",
];

// How many "most repeated" terms to surface, and the smallest count worth showing.
const TOP_TERMS = 25;
const MIN_TERM_COUNT = 3;

// Words ignored when counting repeated terms: ordinary filler plus the banned
// AI-buzzwords, so they never show up as "themes".
const STOPWORDS = new Set([
  "the","and","for","that","with","this","your","you","are","but","not","from",
  "have","has","had","was","were","will","would","can","could","should","our",
  "out","its","it's","they","them","their","these","those","then","than","when",
  "what","which","who","how","why","into","over","more","most","some","any","all",
  "one","two","three","about","also","just","like","get","got","make","makes",
  "made","need","needs","use","uses","used","very","much","many","such","each",
  "every","here","there","while","because","being","been","does","done","still",
  "business","businesses","owner","owners","profit","profitpulse","australian",
  // banned buzzwords, kept out of the themes view
  "delve","leverage","holistic","robust","navigate","journey","unlock",
  "harness","empower","seamless","comprehensive",
]);

// --- Helpers -----------------------------------------------------------------

function readText(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

// Strip HTML tags so we count words, not markup.
function stripHtml(html) {
  return (html || "").replace(/<[^>]+>/g, " ");
}

// Brisbane "today", used for the days-since-last-post numbers.
function brisbaneToday() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(new Date()); // YYYY-MM-DD
}

function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO + "T00:00:00Z");
  const b = new Date(toISO + "T00:00:00Z");
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

// ISO week label like 2026-W22, for the cadence chart.
function isoWeek(dateISO) {
  const d = new Date(dateISO + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(
    ((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
  );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// Pull the list of served industries out of INDUSTRIES-REFERENCE.md. They are
// the bullet lines that sit between "Industries served" and the awareness
// calendar. The "Commercial pressures" lines are skipped.
function parseIndustries(md) {
  const start = md.indexOf("Industries served");
  const end = md.indexOf("Awareness day calendar");
  const slice = md.slice(start, end > -1 ? end : undefined);
  const items = [];
  for (const line of slice.split("\n")) {
    const m = line.match(/^\s*-\s+(.+)$/);
    if (!m) continue;
    if (/^commercial pressures/i.test(m[1])) continue;
    // Keep the readable name, drop the parenthetical examples for matching.
    const name = m[1].replace(/\(.*?\)/g, "").trim();
    if (name) items.push(name);
  }
  return items;
}

// Pull the service names (the bold headings) and their link URLs out of
// PRODUCTS-REFERENCE.md.
function parseServices(md) {
  const services = [];
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\*\*(.+?)\*\*\s+—/);
    if (!m) continue;
    const name = m[1].trim();
    // The link usually follows within the next few lines.
    let link = "";
    for (let j = i; j < Math.min(i + 6, lines.length); j++) {
      const lm = lines[j].match(/Link:\s*(\S+)/);
      if (lm) { link = lm[1].trim(); break; }
    }
    services.push({ name, link });
  }
  return services;
}

// --- Load inputs -------------------------------------------------------------

const posts = JSON.parse(readText("posts.json") || "[]");
const industries = parseIndustries(readText("brain/INDUSTRIES-REFERENCE.md"));
const services = parseServices(readText("brain/PRODUCTS-REFERENCE.md"));
const today = brisbaneToday();

// One big lowercase blob of all post text, for coverage matching.
const allText = posts
  .map(p => `${p.title || ""} ${p.excerpt || ""} ${stripHtml(p.content)} ` +
            (p.faqs || []).map(f => `${f.q || ""} ${stripHtml(f.a)}`).join(" "))
  .join(" ")
  .toLowerCase();

// --- 1. Category balance -----------------------------------------------------

const categories = CATEGORIES.map(name => {
  const inCat = posts.filter(p => (p.category || "").trim() === name);
  const lastDate = inCat.map(p => p.date).sort().pop() || null;
  return {
    name,
    count: inCat.length,
    lastDate,
    daysSinceLast: lastDate ? daysBetween(lastDate, today) : null,
  };
});

// --- 2. Repeated terms (themes) ---------------------------------------------

const words = allText.match(/[a-z][a-z'-]{3,}/g) || [];
const unigram = new Map();
for (const w of words) {
  if (STOPWORDS.has(w)) continue;
  unigram.set(w, (unigram.get(w) || 0) + 1);
}
// Bigrams of consecutive non-stopwords, e.g. "cash flow".
const bigram = new Map();
for (let i = 0; i < words.length - 1; i++) {
  const a = words[i], b = words[i + 1];
  if (STOPWORDS.has(a) || STOPWORDS.has(b)) continue;
  const key = `${a} ${b}`;
  bigram.set(key, (bigram.get(key) || 0) + 1);
}
const repeatedTerms = [...unigram, ...bigram]
  .map(([term, count]) => ({ term, count }))
  .filter(t => t.count >= MIN_TERM_COUNT)
  .sort((a, b) => b.count - a.count)
  .slice(0, TOP_TERMS);

// --- 3. Industry coverage ----------------------------------------------------

const industryCoverage = industries.map(name => {
  // Match on the first few significant words of the industry name.
  const probe = name.toLowerCase().split(/\s+/).slice(0, 2).join(" ");
  const count = probe ? (allText.split(probe).length - 1) : 0;
  return { name, count };
});
const coveredIndustries = industryCoverage.filter(i => i.count > 0)
  .sort((a, b) => b.count - a.count);
const untouchedIndustries = industryCoverage.filter(i => i.count === 0)
  .map(i => i.name);

// --- 4. Service coverage -----------------------------------------------------

const serviceCoverage = services.map(s => {
  const byName = allText.split(s.name.toLowerCase()).length - 1;
  const byLink = s.link ? (allText.split(s.link.toLowerCase()).length - 1) : 0;
  return { name: s.name, count: byName + byLink };
});
const referencedServices = serviceCoverage.filter(s => s.count > 0)
  .sort((a, b) => b.count - a.count);
const untouchedServices = serviceCoverage.filter(s => s.count === 0)
  .map(s => s.name);

// --- 5. Internal link distribution ------------------------------------------

const linkCounts = new Map();
const hrefRe = /href="([^"]+)"/g;
for (const p of posts) {
  const blob = `${p.content || ""} ` + (p.faqs || []).map(f => f.a || "").join(" ");
  let m;
  while ((m = hrefRe.exec(blob)) !== null) {
    const url = m[1];
    if (!url.includes("profit-pulse.com.au") && !url.includes("outlook.office.com")) continue;
    linkCounts.set(url, (linkCounts.get(url) || 0) + 1);
  }
}
const linkTargets = [...linkCounts]
  .map(([url, count]) => ({ url, count }))
  .sort((a, b) => b.count - a.count);

// --- 6. Cadence (posts per week) --------------------------------------------

const weekCounts = new Map();
for (const p of posts) {
  if (!p.date) continue;
  const wk = isoWeek(p.date);
  weekCounts.set(wk, (weekCounts.get(wk) || 0) + 1);
}
const postsPerWeek = [...weekCounts]
  .map(([week, count]) => ({ week, count }))
  .sort((a, b) => a.week.localeCompare(b.week));

// --- Write the output --------------------------------------------------------

const analytics = {
  generatedAt: new Date().toISOString(),
  totalPosts: posts.length,
  categories,
  repeatedTerms,
  industries: { covered: coveredIndustries, untouched: untouchedIndustries },
  services: { referenced: referencedServices, untouched: untouchedServices },
  linkTargets,
  postsPerWeek,
};

mkdirSync("docs/data", { recursive: true });
writeFileSync("docs/data/analytics.json", JSON.stringify(analytics, null, 2));
console.log(`Wrote docs/data/analytics.json (${posts.length} posts analysed).`);
