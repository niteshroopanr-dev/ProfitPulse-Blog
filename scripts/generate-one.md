You are running as the ProfitPulse daily content engine in an automated batch job.

The date you must write content for is given in the environment variable DRAFT_DATE
(format YYYY-MM-DD). Read that variable now and use it as the target date for all
file names and for the date field in the post object.

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

Step 2. Read every file currently present in the drafts/ folder. These are
drafts already written for other dates in this same batch run. Treat the
topics, categories, and industry angles in those draft files as already used,
exactly as you treat posts in posts.json. Do not produce a draft that repeats
a topic, category focus, or specific industry angle found in any draft file,
even if that draft has not yet been published.

Step 3. Choose the topic and category for $DRAFT_DATE using the topic-selection
logic in brain/SYSTEM_PROMPT.md, taking into account both the published posts in
posts.json and the drafts read in Step 2. Follow every writing and brand rule
exactly, including Australian spelling, no em-dashes, and the link formatting
requirement that every anchor tag carries target="_blank" rel="noopener
noreferrer".

Step 4. Write the result to three files, using $DRAFT_DATE as the filename
(for example drafts/2026-06-01.json). Create the drafts folder if it does not
exist.

  a) drafts/<DRAFT_DATE>.json
     The complete post object, ready to paste into posts.json, in this shape:
       {
         "date": "<DRAFT_DATE>",
         "category": "...",
         "title": "...",
         "excerpt": "...",
         "content": "<img src=\"HERO_IMAGE_URL_PENDING\" /><p>...</p>...",
         "faqs": [ {"q": "...", "a": "<p>...</p>"}, ... ]
       }
     Keep HERO_IMAGE_URL_PENDING exactly as written; it is replaced at publish
     time.

  b) drafts/<DRAFT_DATE>.prompt.txt
     The complete ChatGPT image prompt, built from the master image template in
     brain/SYSTEM_PROMPT.md with this post's title and concept already filled
     in. Plain text, ready to paste into ChatGPT without editing.

  c) drafts/<DRAFT_DATE>.summary.txt
     A single line in the form:
       Today's draft: <title> (Category: <category>)
     followed by one sentence explaining why you chose this angle and why it is
     distinct from both the published posts and any drafts already written in
     this batch.

  d) drafts/<DRAFT_DATE>.social.json
     The social drafts for this post, drawn from the post you just wrote, in
     this shape:
       {
         "date": "<DRAFT_DATE>",
         "title": "<the post title, copied exactly>",
         "generatedAt": "<current date and time in ISO form>",
         "linkedin": "...",
         "facebook": "...",
         "google": "..."
       }
     Draw on a real, specific insight from the post, not generic filler. Keep
     every channel link free in the body. The live post link is added by hand
     after publishing, in the first comment on LinkedIn, at the end of the
     Facebook post, and on the button of the Google update.

     LinkedIn, 1200 to 1700 characters: a hook in the first two lines that
     lands before the "see more" cut off, then one specific insight from the
     post, with a line break every two or three sentences. End with the line
     "Full piece on the ProfitPulse blog." and three relevant hashtags chosen
     from #FractionalCFO #BusinessValuation #CashFlow #ProfitabilityAdvice
     #AustralianBusiness #BrisbaneSME #SMEFinance #BusinessOwners
     #FinancialStrategy.

     Facebook, 500 to 800 characters: lighter and more conversational than
     LinkedIn but still on brand, with one specific question or observation
     that invites a reply, no link in the body, and one or two hashtags at
     most.

     Google, a Google Business Profile update of 150 to 300 words: written as
     a local business update for owner led SMEs on the east coast (Brisbane,
     Queensland, New South Wales, Victoria), plain and useful, with no hashtags
     and one clear call to action at the end pointing readers to the blog. No
     link in the body.

Write only those four files. Do not modify posts.json, the brain files, or
anything in docs/. Do not invent statistics. If you genuinely cannot find a
fresh, non-duplicative angle (considering both posts.json and the existing
drafts), still write the four files but use the summary line to flag that the
angles are close to existing content and name two alternatives you would prefer.
