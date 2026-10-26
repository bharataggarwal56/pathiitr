# Decisions

One line per significant decision, newest last.

- 2026-10-27: Stack is Next.js (App Router, TS) + Tailwind on Vercel, Supabase for Postgres/pgvector/Auth; Rs 0 budget, free tiers only.
- 2026-10-27: LLM calls go through one `lib/llm.ts` wrapper: Groq primary, Gemini free tier as automatic fallback on rate limits.
- 2026-10-27: Embeddings are computed locally, not via a paid API.
- 2026-10-27: Login is Google via Supabase Auth, restricted to iitr.ac.in accounts.
- 2026-10-27: Repo is public and code-only; all source material lives in gitignored `data/` and is anonymised before reaching Supabase.
- 2026-10-27: Pre-commit hook is tracked in `scripts/hooks/` and enabled via `git config core.hooksPath` (`scripts/setup-hooks.sh`); blocks `data/`, `.env*`, files over 1 MB, API keys, full IITR emails and phone numbers. No bypass.
- 2026-10-27: Python scripts use pymupdf (PDF text + page rendering for OCR), python-docx, python-pptx, pytesseract, groq and google-genai (not the deprecated google-generativeai); Markdown is read as plain text; direct deps pinned in `scripts/requirements.txt`.
