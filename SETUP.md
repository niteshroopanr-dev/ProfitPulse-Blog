# SETUP — ProfitPulse Daily Engine

One-time setup, in order. Each step is plain copy/paste or clicking in a web
interface. You only do this once; after that the system runs itself.

---

## Before you start

You need:
- A GitHub account that owns the `niteshroopanr-dev/ProfitPulse-Blog` repo.
- A Claude **Pro or Max** subscription (the free tier cannot generate the login
  token used by the 3am job).
- Node.js installed on your Mac (needed once, to install Claude Code). If you do
  not have it, install it from https://nodejs.org (the "LTS" version).

---

## Step 1 — Put the files into the repo

Copy the folders from this package into your repo so the layout is:

```
ProfitPulse-Blog/
  posts.json                      (already there)
  images/                         (already there)
  brain/
    SYSTEM_PROMPT.md              <- paste your Claude Project instructions here
    SKILL.md                      <- your existing knowledge file
    INDUSTRIES-REFERENCE.md       <- your existing knowledge file
    PRODUCTS-REFERENCE.md         <- your existing knowledge file
  scripts/
    generate.md
    build-analytics.mjs
    publish-worker.js
  docs/
    index.html
    app.js
    styles.css
    manifest.webmanifest
    service-worker.js
    icons/
      icon-192.png                <- see Step 6
      icon-512.png                <- see Step 6
    data/                         (created automatically by the 3am job)
  .github/
    workflows/
      daily.yml
```

`SYSTEM_PROMPT.md` is your current Claude Project instruction text, pasted in
unchanged. The three reference files are the ones you already have.

---

## Step 2 — Connect the 3am job to your Claude subscription

On your Mac, open the Terminal app and run:

```
npm install -g @anthropic-ai/claude-code
claude setup-token
```

Follow the prompt to sign in. It prints a token. Copy it.

In GitHub: open the repo, then Settings > Secrets and variables > Actions > New
repository secret. Name it exactly `CLAUDE_CODE_OAUTH_TOKEN` and paste the token
as the value.

---

## Step 3 — Turn on the app (GitHub Pages)

In GitHub: repo Settings > Pages. Under "Build and deployment", set Source to
"Deploy from a branch", branch `main`, folder `/docs`. Save.

After a minute GitHub shows the address, like
`https://niteshroopanr-dev.github.io/ProfitPulse-Blog/`. That is your app.

---

## Step 4 — Set up the publish helper (Cloudflare Worker)

1. Create a free account at https://cloudflare.com and open Workers.
2. Create a Worker, delete the sample code, and paste in
   `scripts/publish-worker.js`.
3. Make a GitHub token for it: GitHub > your profile Settings > Developer
   settings > Personal access tokens > Fine-grained tokens > Generate new token.
   - Repository access: Only select repositories > `ProfitPulse-Blog`.
   - Permissions: Contents > Read and write. Nothing else.
   - Generate it and copy the value.
4. In the Worker's Settings > Variables and Secrets, add a **secret** named
   `GITHUB_TOKEN` with that token as the value. Deploy.
5. Copy the Worker's URL (like
   `https://profitpulse-publish.<subdomain>.workers.dev`).

---

## Step 5 — Point the app at the Worker

Open `docs/app.js` and change the first config line:

```
const WORKER_URL = "https://profitpulse-publish.<subdomain>.workers.dev";
```

Commit the change. (Optional: in `scripts/publish-worker.js` you can set
`ALLOWED_ORIGIN` to your GitHub Pages address instead of `"*"` so only your app
can call the Worker.)

---

## Step 6 — App icons

The app needs two icons: `docs/icons/icon-192.png` (192x192 pixels) and
`docs/icons/icon-512.png` (512x512 pixels). Export them from your ProfitPulse
logo, or any square version of it. Until you add them the app still works; it
just uses a default icon when installed.

---

## Step 7 — Test it once by hand

In GitHub: repo Actions tab > "Daily ProfitPulse draft" > Run workflow. Wait a
minute, then check that new files appeared under `drafts/`. Open your app
address, and today's draft should load.

---

## Step 8 — Install the app

- On Mac: open the app address in Safari, then File menu (or the address-bar
  icon) > "Add to Dock" / "Install". It now opens as its own app.
- On iPhone: open the address in Safari, tap the Share button, then "Add to Home
  Screen".

---

## Daily routine after setup

The 3am job writes the draft and refreshes the analytics overnight. In the
morning you open the app, read the draft, tweak wording if you want, copy the
image prompt into ChatGPT, drop the generated image into the app, and press
Publish. The blog updates within a few minutes.

---

## If something goes wrong

- **No draft in the app:** check the Actions tab for a failed run. The most
  common cause is an expired login token; re-run `claude setup-token` and update
  the `CLAUDE_CODE_OAUTH_TOKEN` secret.
- **Publish fails:** the error message in the app comes straight from GitHub.
  Usually it means the Worker's `GITHUB_TOKEN` is missing, expired, or not
  scoped to the repo with Contents write.
- **Charts empty:** the analytics file is built by the 3am job; run the workflow
  once by hand (Step 7) to create it.
