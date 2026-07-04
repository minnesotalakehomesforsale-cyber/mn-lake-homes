# Workflow & Outputs — Blog Post Builder

Per-post workflow and the structure of every blog post produced in this project.

---

## Workflow (per request)

When Hunter says "I need a blog" (or any variant — "blog post," "write me one," "go," "blog about [X]"):

### Step 1 — Parse the input

- If Hunter named a topic, lake, or angle → use it.
- If Hunter said only "blog" / "go" / "I need a blog" → run topic generation per `/02 Topic Engine.md`.
- If Hunter pasted a constraint ("seasonal," "buyer-focused," "for [Lake]") → apply that filter to topic generation.

Do **not** ask permission to start. Do **not** ask procedural questions. Only ask if a clarifying question would materially change the topic (rare).

### Step 2 — Topic decision

- If a topic is provided: validate against the SEO standards and duplication check, then proceed.
- If no topic is provided: generate 3–5 candidates using the scoring rubric in `/02 Topic Engine.md`. If Hunter said "go" or similar (commit-now signal), auto-pick #1. Otherwise, present the candidates and ask Hunter to pick.

Always check `/Posts/` and `/Lakes/[Lake]/02 Blog Post.md` before committing — never duplicate.

### Step 3 — Research

Use web search to gather the lake-specific or topic-specific facts you'll need. Verify any numbers (acreage, average prices, fish populations, seasonality). If a fact can't be verified, mark it `[verify with local source]` rather than inventing.

For market-report posts, search for recent MN real estate market data (Minnesota Realtors monthly reports, regional MLS reports) and reference them.

### Step 4 — Write the post

Per the structure in this file (Output spec below). Apply the brand voice and SEO standards from `/Department Heads/Director of Marketing/Sub-projects/Lake Page Builder/02 Brand Voice & SEO Standards.md` (the same voice and SEO standards used by the Lake Page Builder — single source of truth).

### Step 5 — Save the file

Save to:

```
/Department Heads/Director of Marketing/Sub-projects/Blog Post Builder/Posts/
```

Filename format: `YYYY-MM-DD - [topic-slug].md` (e.g., `2026-05-12 - gull-lake-buyer-guide.md`).

Use today's date (run `date +%Y-%m-%d` via bash if uncertain).

### Step 6 — Return the post + publishing notes

In the chat response, give Hunter:

- A short header (1–2 sentences) explaining why this topic was picked (especially when Hunter said "go" — show the top score logic).
- A link to the saved file.
- A "Publishing checklist" block — copy-paste-ready for the dev / publishing flow.

End the response there. Don't add fluff.

---

## Output spec — every blog post

The blog-post file must include all of the following sections, in order. The Cowork project is responsible for filling them in for every post.

### Frontmatter (metadata block at top of file)

```
---
title: [SEO-optimized clickable title, 50–60 chars]
url_slug: /blog/[topic-slug]/
meta_title: [50–60 chars, primary keyword in first 60 chars]
meta_description: [145–160 chars, primary keyword + soft CTA]
primary_keyword: [the main term we're targeting]
secondary_keywords: [3–5 supporting terms]
category: [from the topic menu in 02 Topic Engine.md]
tags: [Lake Name(s), season, buyer/seller intent, etc.]
hero_image_suggestion: [describe what to use — e.g., "aerial of Gull Lake at sunset, autumn color"]
internal_links: [list each — /lake/gull-lake/, /lake/whitefish-chain/, /, etc.]
external_links: [list each — DNR.state.mn.us survey link, lake association URL, etc.]
word_count_target: 1200–1800
publish_window: [now / next week / hold for [season]]
topic_score: [from the rubric — show all 6 axes and total]
---
```

### Hook (50–100 words)

Open with a specific, concrete image — a fact, a season, a story-fragment. Promise what the reader will learn. Drop the primary keyword naturally in the first 100 words.

### Body (1,200–1,800 words)

- Use H2s for major sections, H3s for subsections.
- Mention the primary keyword 3–6 times in the body (natural, not stuffed).
- Mention secondary keywords once or twice each.
- Internal links: at least 3 to relevant lake pages, 1–2 to the home page or other blog posts.
- External links: at least 1 to an authoritative source (MN DNR lake survey, lake association, chamber, MN Realtors stats).
- Use specific data points: real towns, real prices, real fish species, real distances. No vague generalities.
- Include at least one short list, table, or callout box that's scannable for skimmers.

### Closing CTA (40–80 words)

Drive to the lake page (if lake-specific) or the lead form (if general intent). Soft, useful tone — not "Click here to claim your offer!". Examples:

- "Get listings as they hit the [Lake Name] market." → link to lead form
- "Browse current homes on [Lake Name] →" → link to lake page
- "Considering selling? See what your [Lake Name] home is worth →" → link to seller form

### Publishing notes (the dev/publishing block)

A short, copy-paste section the publisher (developer or content operator) follows to ship the post:

- URL slug
- Meta title and description
- Hero image asset (filename or specification)
- Tags to apply in the CMS (lake name, category, season)
- Internal-link map (final list of `[anchor text] → [destination URL]`)
- External-link map
- Schema markup: `Article` with `author`, `datePublished`, `image`, plus `BreadcrumbList`. Include `mainEntityOfPage` linking to the canonical URL.
- Suggested social pull-quotes (2–3 short lines, ≤180 chars each, ready for Twitter/IG/LinkedIn).
- Suggested publish day and time (based on the topic — e.g., "Saturday morning for lifestyle posts, Tuesday for market reports").

---

## What you do not do

- Do not invent facts. Mark unverifiable claims `[verify with local source]`.
- Do not commit to launch dates or technical timelines — that's the dev / publisher.
- Do not promise referral fees or describe the platform as a referral arrangement. Subscription product, agents pay for visibility.
- Do not write generic "lake content mill" posts. Specifics over generalities.
- Do not edit files in other Directors' folders or the Website folder.
- Do not skip the duplication check before writing.

---

## When the workflow is "weird"

- **"Write me a series of three posts on Lake Minnetonka"** → produce three posts, each in its own file, each scored individually so they don't overlap. Use a series tag in the frontmatter.
- **"Update the post from last week with new market data"** → read the existing file, edit in place, update the `publish_window` and add a "Last updated: [date]" line near the top.
- **"Repurpose this lake page content into a blog"** → read the Lake Page Builder output for that lake, identify the angle most suitable for a standalone post, write it as a new post (don't just paste — restructure for blog format).
- **"Give me ideas, don't write yet"** → produce a ranked list of 5–10 candidate topics with scores. No file saved. Wait for Hunter to pick.
