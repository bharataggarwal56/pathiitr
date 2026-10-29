# PathIITR

AI-assisted career and academic guidance for IIT Roorkee students, built for ECC-399 (ECE CORE).
An AI chatbot answers questions from curated material and cites its sources, alongside a career
path recommender, skill-gap analysis, elective guidance and a semester roadmap.

> Work in progress. Setup steps below will be filled in as the app is built.

## Stack

- Next.js (App Router, TypeScript) + Tailwind, deployed on Vercel
- Supabase: Postgres, pgvector, Google login restricted to IITR accounts
- LLM: free tiers only; Groq gpt-oss-120b, then Groq qwen3.8-27b (separate rate limit), then Gemini as last resort
- Embeddings computed locally
- Python data scripts in `scripts/`

## Setup

1. Clone the repo and install the git hooks (required, blocks data files and secrets from being committed):

   ```bash
   bash scripts/setup-hooks.sh
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create `.env.local` in the project root with your own values (never commit this file):

   ```bash
   GROQ_API_KEY=<your-groq-key>
   GEMINI_API_KEY=<your-gemini-key>
   NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-supabase-publishable-key>
   SUPABASE_SECRET_KEY=<your-supabase-secret-key>
   ```

   | Variable | Used by | Placeholder |
   |---|---|---|
   | `GROQ_API_KEY` | `lib/llm.ts`, Python scripts (primary LLM) | `<your-groq-key>` |
   | `GEMINI_API_KEY` | `lib/llm.ts`, Python scripts (fallback LLM) | `<your-gemini-key>` |
   | `NEXT_PUBLIC_SUPABASE_URL` | web app, loader scripts | `<your-supabase-project-url>` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | web app (browser-safe) | `<your-supabase-publishable-key>` |
   | `SUPABASE_SECRET_KEY` | server-side code and loader scripts only | `<your-supabase-secret-key>` |
   | `LLM_DEBUG_FAIL` | optional, dev only: steps of the LLM chain that act as rate-limited, a comma list of `groq`, `groq-backup`, `gemini`, or `all` | unset |
   | `CHAT_RATE_LIMIT` | optional, dev only: questions per user per 10 minutes in `/api/chat` (default 15) | unset |

   In dev, `/api/llm-test?q=<question>` (login required) tries the LLM wrapper; it returns 404 in production.

4. Set up Google login (Supabase → Authentication):

   - Providers → Google: enable it with the client ID/secret of a Google Cloud OAuth client whose
     authorized redirect URI is `https://<your-project-ref>.supabase.co/auth/v1/callback`.
   - URL Configuration → Redirect URLs: add `http://localhost:3000/**`
     (and `https://<your-vercel-domain>/**` once deployed). The `**` is needed because the callback
     URL carries a `?next=` query; without a match Supabase silently sends you to the Site URL.

   Only `@iitr.ac.in` emails (including department addresses like `@ece.iitr.ac.in`) are let in;
   anyone else is signed out straight away. Every page except the landing page needs login.

5. Deploy the `embed` Edge Function, which embeds chat questions with gte-small (the model
   `scripts/embed.py` uses) and only serves logged-in IITR users. Log in once in a normal terminal
   (the login needs an interactive shell), then deploy:

   ```bash
   npx supabase@2 login
   npx supabase@2 functions deploy embed --use-api --project-ref <your-project-ref>
   ```

6. Run the dev server:

   ```bash
   npm run dev
   ```

## Python scripts

Data scripts in `scripts/` (extraction, OCR, anonymisation, structuring, loading) run in a virtualenv.
OCR needs the system Tesseract binary:

```bash
sudo apt install tesseract-ocr
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements.txt
```

Old `.doc`/`.ppt` files are converted only if LibreOffice is installed (optional: `sudo apt install libreoffice`).

Pipeline order: `python scripts/inventory.py`, `python scripts/extract.py`, then
`python scripts/anonymise.py` (writes `data/work/clean/` and a review report, `data/work/anonymise_report.csv`).
After `python scripts/structure.py`, run `python scripts/embed.py` to chunk and embed the clean documents
into `data/work/chunks.jsonl` (the gte-small model, ~130 MB, downloads once into `~/.cache/huggingface`).
`python scripts/embed.py --search "<question>"` prints the top matching chunks.
`python scripts/site_stats.py` refreshes the landing-page counts in `lib/site-stats.json` (counts only, committed,
since Vercel can't see `data/`); re-run it and commit after the data changes.

Scripts read keys from `.env.local` (see the table above).

## Data and confidentiality

This repo is public and contains code only.

- Source material (PDFs, slides, Notion exports, extracted text, embeddings) lives in `data/`, which is gitignored.
- All data is anonymised (names, emails, phone numbers, roll numbers, profile URLs removed) before it is stored in Supabase.
- Content derived from seniors' material is shown only to logged-in IITR users.
- The pre-commit hook in `scripts/hooks/pre-commit` blocks anything under `data/`, `.env*` files,
  files over 1 MB, API keys, full IITR email addresses and phone numbers.

## Docs

- `docs/decisions.md`: one-line log of significant decisions.
