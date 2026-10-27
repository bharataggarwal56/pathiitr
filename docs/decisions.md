# Decisions

One line per significant decision, newest last.

- 2026-10-27: Stack is Next.js (App Router, TS) + Tailwind on Vercel, Supabase for Postgres/pgvector/Auth; Rs 0 budget, free tiers only.
- 2026-10-27: LLM calls go through one `lib/llm.ts` wrapper: Groq primary, Gemini free tier as automatic fallback on rate limits.
- 2026-10-27: Embeddings are computed locally, not via a paid API.
- 2026-10-27: Login is Google via Supabase Auth, restricted to iitr.ac.in accounts.
- 2026-10-27: Repo is public and code-only; all source material lives in gitignored `data/` and is anonymised before reaching Supabase.
- 2026-10-27: Pre-commit hook is tracked in `scripts/hooks/` and enabled via `git config core.hooksPath` (`scripts/setup-hooks.sh`); blocks `data/`, `.env*`, files over 1 MB, API keys, full IITR emails and phone numbers. No bypass.
- 2026-10-27: Python scripts use pymupdf (PDF text + page rendering for OCR), python-docx, python-pptx, pytesseract, groq and google-genai (not the deprecated google-generativeai); Markdown is read as plain text; direct deps pinned in `scripts/requirements.txt`.
- 2026-10-27: Inventory merges exact (SHA-256) and near (>90% text similarity) duplicates into one row listing all tracks; every document has a `display_title` with no personal names, and the app/later steps show that, never the original file name.
- 2026-10-27: `scripts/extract.py` writes one Markdown file per document to `data/work/text/`, named `<display_title slug>-<sha8>.md`; PDF pages with under 25 selectable characters are OCR'd (Tesseract, 300 dpi), capped at the first 15 such pages for `kind=reference` files (summary/topics only); links are kept; .doc/.ppt are converted only if LibreOffice is installed (optional).
- 2026-10-27: The `path` field in extracted text headers holds original file names (some contain people's names); it stays in `data/work/` for tracing only, is never loaded into Supabase or shown in the app, and later steps use `display_title` only.
- 2026-10-27: `scripts/anonymise.py` writes `data/work/clean/`; regex removes emails, phones, roll numbers and personal profile links in all files; names (spaCy `en_core_web_sm` + signature-line and Prof./Dr. rules) are replaced only in `kind=guidance` files, case-sensitively, with "a senior" ("a professor" for Prof./Dr.); one-word or mixed names containing ordinary English words are only flagged in the report; `path:` is dropped from clean headers.
- 2026-10-27: Learning-resource links come from `scripts/harvest_links.py` (all URLs in `data/work/clean/` + structured JSON, minus resume links and non-URLs); `data/work/skill_matrix.json` is hand-drafted and may only use URLs from that list, checked by `scripts/check_skill_matrix.py`. Skills with no link in our docs stay as listed gaps; Drive copies of published textbooks are left out.
- 2026-10-27: `scripts/extract_courses.py` builds `data/work/courses.json` from the curriculum structure PDF; `topics` stays null until syllabus PDFs are added; elective→track mapping is hand-kept in `data/work/elective_tracks.json`, based on course titles only. ECE Core stays one track with sub_area tags rather than separate sub-tracks.
