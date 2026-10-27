# PathIITR

AI-assisted career and academic guidance for IIT Roorkee students, built for ECC-399 (ECE CORE).
An AI chatbot answers questions from curated material and cites its sources, alongside a career
path recommender, skill-gap analysis, elective guidance and a semester roadmap.

> Work in progress. Setup steps below will be filled in as the app is built.

## Stack

- Next.js (App Router, TypeScript) + Tailwind, deployed on Vercel
- Supabase: Postgres, pgvector, Google login restricted to IITR accounts
- LLM: Groq (primary) with Gemini as fallback, free tiers only
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

4. Run the dev server:

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
