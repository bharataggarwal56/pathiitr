# PathIITR — project rules for Claude Code

## What this is
PathIITR is an AI-assisted career and academic guidance web app for IIT Roorkee students,
built for the ECE CORE course (ECC-399). ECE is covered in depth; other branches get basic coverage.
Final demo: 6 Nov 2026 (live demo with a recorded backup). Mostly a solo build.

Core feature: an AI chatbot that answers from our own data and cites its sources.
Other features, in priority order:
1. Career path recommender (interests + skills -> tracks)
2. Skill-gap analysis (student skills vs role skill matrix) with curated learning resources
3. Elective / course guidance (from official curriculum PDFs)
4. Semester roadmap
5. Resume analyser (last; droppable) — must show a clear privacy warning, strip contact details
   before sending, and never store the resume

## Career tracks (from seniors' drive + Notion)
Software (SDE/SWE), Quant/HFT, Data Science, Analyst, Consulting/PM, ECE Core.
ECE Core can be split into sub-areas (VLSI, embedded, signal processing/comms) only if the material supports it.
Cross-track content: internship experiences doc (pre-season tips, test experiences) and
"specific programs" doc (open-source programs, early-career programs).

## Stack
- Next.js (App Router, TypeScript), Tailwind, deployed on Vercel (free)
- Supabase (free): Postgres, pgvector, Auth with Google login restricted to @iitr.ac.in emails
- LLM: free tiers only (Rs 0 budget). One `lib/llm.ts` wrapper with a fallback chain:
  Groq `openai/gpt-oss-120b` (primary) → Groq `qwen/qwen3.8-27b` (own rate limit) →
  Gemini free tier (last resort); move to the next step automatically on 429 / rate-limit errors.
  Check both providers' current free limits in their consoles before relying on numbers.
- Embeddings: computed locally (free), not via a paid API
- Data scripts in Python under `scripts/` (extraction, OCR for scanned files, anonymisation,
  structuring, loading)

## How to work with me
- Plan first. For any non-trivial task, propose a short plan and wait for approval before editing.
- Small steps. One feature or fix at a time; run it and show me the result before moving on.
- Explain new dependencies before installing them.
- Prefer simple, boring code over clever abstractions. This must be finished and demoable.
- At the end of each session, tell me what was done and roughly how long it took, so I can
  fill in my hours log accurately.

## Confidentiality — non-negotiable
The GitHub repo is PUBLIC. Only code goes in it.
- Never commit anything in `data/` (raw PDFs, PPTs, Notion exports, extracted text, JSON, embeddings).
- Never commit `.env*` files or API keys. Keys live in `.env.local` and in Vercel/Supabase settings.
- Never hard-code real student names, roll numbers, emails, phone numbers, LinkedIn URLs,
  individual CGPA or individual pay into code, seed files, tests, prompts or README examples.
  Use obviously fake sample data in examples.
- Before any data is stored in Supabase, it must pass the anonymisation step
  (strip names, emails, phones, roll numbers, profile URLs).
- Content from seniors' material is shown only to logged-in IITR users.
- Before every commit, check `git status` and the diff for anything from `data/` or any secret.

## Free-tier constraints
- Keep prompts lean; retrieve only the top few chunks.
- Cache LLM answers for repeated questions; never call the LLM in a loop over users.
- Run data-structuring jobs slowly to respect per-minute limits; make scripts resumable.
- Show a friendly "busy, try again shortly" message on rate-limit errors instead of crashing.

## Chatbot behaviour
- Answer only from retrieved context; cite which document/track each point came from.
- If the data doesn't cover it, say so plainly instead of guessing.
- Never invent companies, stipends, cutoffs, people or links.
- Thumbs up/down on every answer, stored in Supabase.

## Design
- IITR-inspired palette: deep navy and blue as primary, white surfaces, one warm accent.
- Clean, mobile-friendly, readable. No clutter.

## Project hygiene
- `README.md` explains setup with placeholder env vars only.
- Keep `docs/decisions.md` with one line per significant decision.

## Git commits — commit often
- Commit after every meaningful change: each setup step, each script, each working feature,
  each fix, each UI change. Prefer many small, focused commits over a few big ones.
- Only commit code that runs. Never commit a broken build.
- Message format: `type: short summary` (types: feat, fix, data-script, ui, docs, chore, refactor),
  e.g. `feat: add Google login restricted to iitr.ac.in`.
- Before every commit: run `git status` and `git diff --staged`; confirm nothing from `data/`,
  no `.env*`, no keys, no real names/emails/phones. The pre-commit hook must pass; never bypass it
  with `--no-verify`.
- Push to GitHub after each commit (or each small batch of commits).
- Tell me the commit message after committing.
