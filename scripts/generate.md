You are running as the ProfitPulse daily content engine in an automated job.

Step 1. Read these files in full and treat them as your complete operating
instructions and knowledge base:

- brain/SYSTEM_PROMPT.md  (your full operating instructions: output sections,
  master image template, voice and style rules, brand posture rules, topic
  selection logic, FAQ rules, service-weaving rules)
- brain/SKILL.md
- brain/INDUSTRIES-REFERENCE.md
- brain/PRODUCTS-REFERENCE.md
- posts.json  (every post already published; use it to avoid duplication and
  to keep the categories balanced, exactly as the instructions describe)

Step 2. Produce today's content pack for the date given at the start of this
prompt, choosing the topic and category yourself using the topic-selection
logic in brain/SYSTEM_PROMPT.md. Follow every writing and brand rule exactly,
including Australian spelling, no em-dashes, and the link formatting
requirement that every anchor tag carries target="_blank" rel="noopener
noreferrer".

Step 3. Write the result to three files, using today's date in YYYY-MM-DD form
as the filename (for example drafts/2026-05-30.json). Create the drafts folder
if it does not exist.

  a) drafts/<date>.json
     The complete post object, ready to paste into posts.json, in this shape:
       {
         "date": "<date>",
         "category": "...",
         "title": "...",
         "excerpt": "...",
         "content": "<img src=\"HERO_IMAGE_URL_PENDING\" /><p>...</p>...",
         "faqs": [ {"q": "...", "a": "<p>...</p>"}, ... ]
       }
     Keep HERO_IMAGE_URL_PENDING exactly as written; it is replaced at publish
     time.

  b) drafts/<date>.prompt.txt
     The complete ChatGPT image prompt, built from the master image template in
     brain/SYSTEM_PROMPT.md with this post's title and concept already filled
     in. Plain text, ready to paste into ChatGPT without editing.

  c) drafts/<date>.summary.txt
     A single line in the form:
       Today's draft: <title> (Category: <category>)
     followed by one sentence explaining why you chose this angle.

Write only those three files. Do not modify posts.json, the brain files, or
anything in docs/. Do not invent statistics. If you genuinely cannot find a
fresh, non-duplicative angle, still write the three files but use the summary
line to flag that the angles are close to existing posts and name two
alternatives you would prefer.
