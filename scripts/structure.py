"""Structure clean text with an LLM: data/work/clean/*.md -> data/work/structured/*.json (same names).

kind=guidance (seniors' material): track(s), doc_type (experience | resource_list | tips | program_info),
  a short summary, a list of experiences (company, role, year, eligibility, interview rounds, skills,
  tips), plus document-level skills, tips and links. Hinglish/Hindi is translated to English.
  Long files are sent in chunks of about CHUNK_CHARS at page/slide/heading boundaries; chunk results
  are merged (same company + role -> one experience) and a short call writes the overall summary.
kind=reference (casebooks, PM books, DSA notes): track(s), a 2-3 sentence summary and a topic list,
  from a sample of the text (the start plus a few evenly spaced excerpts).
Other kinds (curriculum, skip) are not processed here.

Groq is the primary model, Gemini the fallback: any failed Groq call (rate limit, timeout, server
error) goes to Gemini. Every API call has a API_TIMEOUT_SECONDS timeout. If Groq's daily limit is
used up the rest of the run uses Gemini; if both are, the run stops (rerun later to resume).
Each request gets at most MAX_RETRIES retries in total (API failures and invalid replies alike);
after that the failure is logged and the next file is processed. Calls are paced by tokens used
so the per-minute limits hold, and every sleep prints how long and why. Check both consoles for
the current free limits and adjust the constants.

Output is validated in plain Python; an invalid reply is retried with the errors added. Guard rails:
  - a link is kept only if its URL appears verbatim in the source, and resume links are dropped
    (they point to seniors' personal documents)
  - a company not named in the source text is set to null and logged (no guessed companies)
  - anonymise.py's regex pass runs over every output string (no emails, phones, profile links)

Resumable: each chunk and each final file is cached with the source sha256 and PROMPT_VERSION;
cached work is skipped (--force redoes it). Errors and flags go to data/work/structure_errors.csv.

Run from the repo root:  python scripts/structure.py [--only SUBSTRING ...] [--limit N] [--force]
"""

import argparse
import csv
import json
import os
import re
import sys
import time
from collections import Counter
from pathlib import Path

import httpx
from dotenv import load_dotenv
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from groq import APIConnectionError, APIStatusError, BadRequestError, Groq, RateLimitError

from anonymise import header_field, regex_pass, split_header
from inventory import CROSS_TRACK, ROOT, TRACK_BY_FOLDER

CLEAN_DIR = ROOT / "data" / "work" / "clean"
OUT_DIR = ROOT / "data" / "work" / "structured"
CHUNK_DIR = OUT_DIR / ".chunks"
ERRORS_CSV = ROOT / "data" / "work" / "structure_errors.csv"

# Bump when prompts or schema change: cached results with an older version are redone.
PROMPT_VERSION = 1

GROQ_MODEL = "openai/gpt-oss-120b"
# gemini-2.5-flash returns 404 for new keys; 3.8-flash and flash-latest hung until timeout (Oct 2026)
GEMINI_MODEL = "gemini-3.5-flash"
# Tokens per minute to stay under (Groq's limit is 8000) and the minimum gap between calls.
TPM_BUDGET = {"groq": 6000, "gemini": 100_000}
MIN_GAP_SECONDS = 7
API_TIMEOUT_SECONDS = 60
MAX_RETRIES = 3  # per request (chunk, summary or reference sample), all failure kinds together
MAX_WAIT_SECONDS = 120  # a rate limit resetting later than this fails the request (rerun to resume)
DEFAULT_WAIT_SECONDS = 60
RETRY_BACKOFF_SECONDS = 10  # before retrying a timeout or server error

CHUNK_CHARS = 10_000
REFERENCE_HEAD_CHARS = 6000
REFERENCE_EXCERPTS = 4
REFERENCE_EXCERPT_CHARS = 1000

TRACKS = list(TRACK_BY_FOLDER.values()) + [CROSS_TRACK]
DOC_TYPES = ["experience", "resource_list", "tips", "program_info"]
LANGUAGES = ["english", "hinglish", "hindi", "mixed"]
MIN_YEAR, MAX_YEAR = 2015, 2027

RULES = f"""Rules:
- Use only what the text says. If something is not stated, use null or []. Never invent companies,
  roles, years, stipends, cutoffs, people or links.
- Never include people's names. Refer to people as "a senior" if needed.
- The text may contain Hinglish or Hindi: write every output field in clear English.
- tracks must be chosen from: {", ".join(TRACKS)}.
- Keep each list item short (one line). Reply with a single JSON object only."""

GUIDANCE_SYSTEM = f"""You turn career-guidance material written by IIT Roorkee seniors into JSON.

Return a JSON object with exactly these keys:
{{
  "tracks": [string],
  "doc_type": one of {DOC_TYPES} (experience = interview/internship experiences, resource_list = lists of
     courses/links/books, tips = general advice, program_info = programs, fellowships, opportunities),
  "summary": "2-3 sentences on what this text covers",
  "original_language": one of {LANGUAGES},
  "experiences": [{{"company": string or null, "role": string or null, "year": integer or null,
                   "track": one of the tracks or null, "eligibility": string or null (e.g. stated CGPA criteria),
                   "rounds": [{{"name": string, "details": string}}], "skills": [string], "tips": [string]}}],
  "skills_mentioned": [string],
  "tips": [string],
  "links": [{{"title": string, "url": string}}]
}}
experiences is one entry per company/role selection process described; [] if there are none.
links: copy each URL exactly as written in the text; do not shorten or fix it.

{RULES}"""

REFERENCE_SYSTEM = f"""You describe a reference document (casebook, interview-question book or study notes)
for a career-guidance app. You see only the start and a few excerpts of it.

Return a JSON object with exactly these keys:
{{"tracks": [string], "summary": "2-3 sentences on what the document is and who it helps",
  "topics": [string] (5-15 main topics covered)}}

{RULES}"""

SUMMARY_SYSTEM = """You combine partial summaries of one document into one summary.
Return a JSON object: {"summary": "2-3 sentences"}. Use only what the partial summaries say.
Never include people's names."""


class Log:
    """Errors and flags, appended to ERRORS_CSV as they happen (so a killed run keeps them)."""

    def __init__(self):
        self.rows = 0
        self.file = ERRORS_CSV.open("w", newline="", encoding="utf-8")
        self.writer = csv.writer(self.file)
        self.writer.writerow(["file", "stage", "message"])

    def add(self, fname, stage, message):
        self.writer.writerow([fname, stage, str(message)[:500]])
        self.file.flush()
        self.rows += 1
        print(f"  ! {stage}: {str(message)[:200]}")

    def close(self):
        self.file.close()


class CallFailed(Exception):
    """One attempt failed (rate limit, timeout, network, server error); ask() may retry after `wait`."""

    def __init__(self, reason, wait=0):
        super().__init__(reason)
        self.wait = wait


class DailyLimit(Exception):
    pass


class OutOfQuota(Exception):
    """Both providers' daily limits are used up: stop the run, rerun later to resume."""


def sleep_with_status(seconds, why):
    print(f"  sleeping {seconds:.0f}s: {why}")
    time.sleep(seconds)


class LLM:
    """Groq first, Gemini when Groq fails; paces calls by tokens used (gpt-oss reasoning tokens included)."""

    def __init__(self):
        load_dotenv(ROOT / ".env.local")
        # SDK-level retries off: every retry goes through ask() so the per-request cap holds
        self.groq = Groq(api_key=os.environ["GROQ_API_KEY"], timeout=API_TIMEOUT_SECONDS, max_retries=0)
        self.gemini = genai.Client(api_key=os.environ["GEMINI_API_KEY"], http_options=genai_types.HttpOptions(
            timeout=API_TIMEOUT_SECONDS * 1000, retry_options=genai_types.HttpRetryOptions(attempts=1)))
        self.exhausted = set()  # providers whose daily limit is used up
        self.tokens = Counter()
        self.calls = Counter()

    def _groq(self, system, user):
        try:
            resp = self.groq.chat.completions.create(
                model=GROQ_MODEL,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                response_format={"type": "json_object"},
                reasoning_effort="low",
                temperature=0.2,
                max_completion_tokens=6000,
            )
        except RateLimitError as e:
            if re.search(r"per day|\bTPD\b|\bRPD\b", str(e)):
                raise DailyLimit(str(e))
            wait = retry_after(e.response.headers.get("retry-after"))
            raise CallFailed(f"Groq rate limit: {e}", wait)
        except APIStatusError as e:
            if e.status_code == 413 or e.status_code >= 500:  # 413 = request over the per-minute limit
                raise CallFailed(f"Groq HTTP {e.status_code}: {e}")
            raise
        except APIConnectionError as e:  # includes APITimeoutError
            raise CallFailed(f"Groq {type(e).__name__} (timeout {API_TIMEOUT_SECONDS}s): {e}")
        return resp.choices[0].message.content, resp.usage.total_tokens

    def _gemini(self, system, user):
        try:
            resp = self.gemini.models.generate_content(
                model=GEMINI_MODEL,
                contents=user,
                config=genai_types.GenerateContentConfig(
                    system_instruction=system, response_mime_type="application/json", temperature=0.2),
            )
        except genai_errors.ClientError as e:
            if e.code == 429:
                if "PerDay" in str(e):
                    raise DailyLimit(str(e))
                delay = re.search(r"retryDelay['\"]?:\s*['\"]?(\d+)", str(e))
                raise CallFailed(f"Gemini rate limit: {e}", int(delay.group(1)) + 1 if delay else DEFAULT_WAIT_SECONDS)
            raise
        except genai_errors.ServerError as e:  # 500/503/504, including server-side deadline expiry
            raise CallFailed(f"Gemini HTTP {e.code}: {e}")
        except httpx.TransportError as e:  # includes timeouts
            raise CallFailed(f"Gemini {type(e).__name__} (timeout {API_TIMEOUT_SECONDS}s): {e}")
        usage = resp.usage_metadata
        return resp.text, (usage.total_token_count or 0) if usage else 0

    def call_once(self, system, user):
        """One attempt: Groq, then Gemini if Groq fails. Returns (text, provider) or raises CallFailed."""
        failures = []
        for provider, fn in (("groq", self._groq), ("gemini", self._gemini)):
            if provider in self.exhausted:
                continue
            try:
                text, tokens = fn(system, user)
            except DailyLimit as e:
                self.exhausted.add(provider)
                rest = "stopping" if len(self.exhausted) == 2 else "using the other provider for the rest of this run"
                print(f"  *** {provider} daily limit is used up ({str(e)[:160]}); {rest}")
                continue
            except CallFailed as e:
                failures.append(e)
                print(f"  {provider} failed: {str(e)[:160]}")
                continue
            self.tokens[provider] += tokens
            self.calls[provider] += 1
            pause = max(MIN_GAP_SECONDS, 60 * tokens / TPM_BUDGET[provider])
            sleep_with_status(pause, f"pacing for {provider}'s per-minute limit ({tokens} tokens used incl. reasoning)")
            return text, provider
        if len(self.exhausted) == 2:
            raise OutOfQuota("both Groq and Gemini daily limits are used up")
        raise CallFailed("; ".join(str(e)[:200] for e in failures), max(e.wait for e in failures))


def retry_after(value):
    try:
        return max(1, int(float(value)) + 1)
    except (TypeError, ValueError):
        return DEFAULT_WAIT_SECONDS


# --- chunking and sampling ---

SECTION_START = re.compile(r"^(?=## )", re.M)


def chunk_body(body):
    """Split at '## ' headings (pages, slides, sections) into chunks of at most about CHUNK_CHARS."""
    sections = []
    for section in SECTION_START.split(body):
        while len(section) > CHUNK_CHARS:  # one huge section: cut at a paragraph break
            cut = section.rfind("\n\n", 0, CHUNK_CHARS)
            cut = cut if cut > CHUNK_CHARS // 2 else CHUNK_CHARS
            sections.append(section[:cut])
            section = section[cut:]
        sections.append(section)
    chunks, current = [], ""
    for section in sections:
        if current and len(current) + len(section) > CHUNK_CHARS:
            chunks.append(current)
            current = ""
        current += section
    if current.strip():
        chunks.append(current)
    return chunks


def sample_body(body):
    head = body[:REFERENCE_HEAD_CHARS]
    rest = body[REFERENCE_HEAD_CHARS:]
    if len(rest) < REFERENCE_EXCERPTS * REFERENCE_EXCERPT_CHARS * 2:
        return body[:REFERENCE_HEAD_CHARS + REFERENCE_EXCERPTS * REFERENCE_EXCERPT_CHARS]
    step = len(rest) // REFERENCE_EXCERPTS
    excerpts = [rest[i * step + step // 2:][:REFERENCE_EXCERPT_CHARS] for i in range(REFERENCE_EXCERPTS)]
    return head + "".join(f"\n\n[... excerpt ...]\n{e}" for e in excerpts)


# --- validation ---

def clean_str(value):
    if not isinstance(value, str):
        return None
    value = " ".join(value.split())
    return value or None


def clean_list(value):
    if not isinstance(value, list):
        return []
    out, seen = [], set()
    for item in value:
        item = clean_str(item)
        if item and item.lower() not in seen:
            seen.add(item.lower())
            out.append(item)
    return out


def clean_year(value):
    if isinstance(value, str) and re.fullmatch(r"\d{4}", value.strip()):
        value = int(value)
    if isinstance(value, int) and MIN_YEAR <= value <= MAX_YEAR:
        return value
    return None


def clean_tracks(value):
    return [t for t in clean_list(value) if t in TRACKS]


def validate(obj, kind, source, flags):
    """Return (cleaned object, errors). Errors mean the reply must be retried; flags are only logged."""
    if not isinstance(obj, dict):
        return None, ["reply is not a JSON object"]
    errors = []
    summary = clean_str(obj.get("summary"))
    if not summary:
        errors.append("summary is missing or empty")
    if kind == "summary":
        return {"summary": summary}, errors
    if kind == "reference":
        topics = clean_list(obj.get("topics"))
        if not topics:
            errors.append("topics is missing or empty")
        return {"tracks": clean_tracks(obj.get("tracks")), "summary": summary, "topics": topics}, errors

    doc_type = obj.get("doc_type")
    if doc_type not in DOC_TYPES:
        errors.append(f"doc_type must be one of {DOC_TYPES}, got {doc_type!r}")
    for key in ("experiences", "links", "skills_mentioned", "tips"):
        if key in obj and not isinstance(obj[key], list):
            errors.append(f"{key} must be a list")
    language = obj.get("original_language")
    source_low = source.lower()

    experiences = []
    for exp in obj.get("experiences") or []:
        if not isinstance(exp, dict):
            continue
        company = clean_str(exp.get("company"))
        if company and company.lower() not in source_low:
            flags.append(f"company not in source, set to null: {company}")
            company = None
        rounds = []
        for r in exp.get("rounds") or []:
            if isinstance(r, dict) and clean_str(r.get("name")):
                rounds.append({"name": clean_str(r.get("name")), "details": clean_str(r.get("details"))})
        track = exp.get("track") if exp.get("track") in TRACKS else None
        exp = {"company": company, "role": clean_str(exp.get("role")), "year": clean_year(exp.get("year")),
               "track": track, "eligibility": clean_str(exp.get("eligibility")), "rounds": rounds,
               "skills": clean_list(exp.get("skills")), "tips": clean_list(exp.get("tips"))}
        if company or exp["role"] or rounds or exp["tips"]:
            experiences.append(exp)

    links, seen = [], set()
    for link in obj.get("links") or []:
        if not isinstance(link, dict):
            continue
        url = (link.get("url") or "").strip() if isinstance(link.get("url"), str) else ""
        title = clean_str(link.get("title")) or url
        if not url or url in seen:
            continue
        if url not in source:
            flags.append(f"link not in source, dropped: {url}")
            continue
        if "resume" in title.lower() or "resume" in context_of(source, url).lower():
            flags.append(f"resume link dropped: {url}")
            continue
        seen.add(url)
        links.append({"title": title, "url": url})

    return {
        "tracks": clean_tracks(obj.get("tracks")),
        "doc_type": doc_type,
        "summary": summary,
        "original_language": language if language in LANGUAGES else "english",
        "experiences": experiences,
        "skills_mentioned": clean_list(obj.get("skills_mentioned")),
        "tips": clean_list(obj.get("tips")),
        "links": links,
    }, errors


def context_of(source, url):
    """Up to 60 chars before url on its line: its anchor text, e.g. '[Link to the Resume]('."""
    i = source.find(url)
    start = max(source.rfind("\n", 0, i) + 1, i - 60)
    before = source[start:i]
    # only the last link's anchor, not an earlier link on the same line
    return before[before.rfind(")") + 1:]


def ask(llm, system, user, kind, source, log, fname, stage):
    """One validated request with at most MAX_RETRIES retries in total (API failures and invalid
    replies both count). Returns (data, provider) or (None, None) after logging the failure."""
    prompt = user
    for attempt in range(MAX_RETRIES + 1):
        wait = 0
        try:
            text, provider = llm.call_once(system, prompt)
        except CallFailed as e:
            errors, wait = [str(e)], e.wait or RETRY_BACKOFF_SECONDS
        except BadRequestError as e:  # e.g. Groq json_validate_failed: model produced broken JSON
            errors = [f"request failed: {e}"]
        else:
            flags = []
            try:
                data, errors = validate(json.loads(text), kind, source, flags)
            except json.JSONDecodeError as e:
                data, errors = None, [f"invalid JSON: {e}"]
            if not errors:
                for flag in flags:
                    log.add(fname, f"{stage}:flag", flag)
                return data, provider
            prompt = user + "\n\nYour previous reply had these problems, fix them:\n- " + "\n- ".join(errors)
        if attempt == MAX_RETRIES:
            break
        log.add(fname, f"{stage}:retry {attempt + 1}/{MAX_RETRIES}", "; ".join(errors))
        if wait > MAX_WAIT_SECONDS:
            log.add(fname, f"{stage}:failed", f"rate limit resets in {wait}s (over {MAX_WAIT_SECONDS}s); rerun later")
            return None, None
        if wait:
            sleep_with_status(wait, f"before retry {attempt + 1}/{MAX_RETRIES} after: {errors[0][:100]}")
    log.add(fname, f"{stage}:failed", f"gave up after {MAX_RETRIES} retries: " + "; ".join(errors))
    return None, None


# --- merging and privacy pass ---

def merge_guidance(parts):
    merged = {"tracks": [], "doc_type": None, "original_language": "english", "experiences": [],
              "skills_mentioned": [], "tips": [], "links": []}
    by_key = {}
    for part in parts:
        for key in ("tracks", "skills_mentioned", "tips"):
            merged[key] = clean_list(merged[key] + part[key])
        merged["links"] += [l for l in part["links"] if l["url"] not in {x["url"] for x in merged["links"]}]
        for exp in part["experiences"]:
            key = (exp["company"] or "").lower(), (exp["role"] or "").lower()
            if exp["company"] and key in by_key:  # only merge when the company is known
                old = by_key[key]
                old["rounds"] += [r for r in exp["rounds"] if r not in old["rounds"]]
                for field in ("skills", "tips"):
                    old[field] = clean_list(old[field] + exp[field])
                for field in ("year", "track", "eligibility"):
                    old[field] = old[field] or exp[field]
            else:
                by_key[key] = exp
                merged["experiences"].append(exp)
    # a document with several selection processes is an experience doc even if some chunks are tips
    if len(merged["experiences"]) > 1:
        merged["doc_type"] = "experience"
    else:
        merged["doc_type"] = Counter(p["doc_type"] for p in parts).most_common(1)[0][0]
    languages = {p["original_language"] for p in parts}
    merged["original_language"] = languages.pop() if len(languages) == 1 else "mixed"
    return merged


def scrub(value, hits):
    """anonymise.py's regex pass over every string in the structure."""
    if isinstance(value, str):
        return regex_pass(value, hits)
    if isinstance(value, list):
        return [scrub(v, hits) for v in value]
    if isinstance(value, dict):
        return {k: (v if k in ("url", "sha256", "source_file") else scrub(v, hits)) for k, v in value.items()}
    return value


# --- cache ---

def read_cache(path, sha):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if data.get("sha256") == sha and data.get("prompt_version") == PROMPT_VERSION:
        return data
    return None


def write_json(path, data):
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


# --- per document ---

def doc_prompt(title, tracks, text, part=None):
    where = f"Part {part[0]} of {part[1]} of the document.\n" if part and part[1] > 1 else ""
    return f"Document title: {title}\nTrack(s) from its folder: {tracks}\n{where}\n<text>\n{text}\n</text>"


def structure_guidance(llm, fname, meta, body, log, force):
    chunks = chunk_body(body)
    parts, providers = [], Counter()
    for i, chunk in enumerate(chunks, 1):
        cache = CHUNK_DIR / f"{Path(fname).stem}.{i}.json"
        cached = None if force else read_cache(cache, meta["sha256"])
        if cached and cached.get("chunks") == len(chunks):
            parts.append(cached["data"])
            providers[cached["provider"]] += 1
            continue
        print(f"  chunk {i}/{len(chunks)} ({len(chunk)} chars)")
        user = doc_prompt(meta["display_title"], meta["tracks"], chunk, (i, len(chunks)))
        data, provider = ask(llm, GUIDANCE_SYSTEM, user, "guidance", chunk, log, fname, f"chunk {i}")
        if data is None:
            return None  # leave other chunks cached; the next run retries this one
        write_json(cache, {"sha256": meta["sha256"], "prompt_version": PROMPT_VERSION, "chunks": len(chunks),
                           "provider": provider, "data": data})
        parts.append(data)
        providers[provider] += 1

    merged = merge_guidance(parts)
    summaries = [p["summary"] for p in parts]
    merged["summary"] = summaries[0]
    if len(parts) > 1:
        user = f"Document title: {meta['display_title']}\nPartial summaries:\n- " + "\n- ".join(summaries)
        data, provider = ask(llm, SUMMARY_SYSTEM, user, "summary", "", log, fname, "summary")
        if data:
            merged["summary"] = data["summary"]
            providers[provider] += 1
    return merged, providers


def structure_reference(llm, fname, meta, body, log):
    sample = sample_body(body)
    user = doc_prompt(meta["display_title"], meta["tracks"], sample)
    data, provider = ask(llm, REFERENCE_SYSTEM, user, "reference", sample, log, fname, "reference")
    return (data, Counter({provider: 1})) if data else None


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--only", nargs="+", help="only files whose name contains one of these substrings")
    parser.add_argument("--limit", type=int, help="process at most N files that are not already cached")
    parser.add_argument("--force", action="store_true", help="redo files and chunks even if cached")
    args = parser.parse_args()
    sys.stdout.reconfigure(line_buffering=True)  # progress shows up even when piped
    start = time.time()

    files = sorted(CLEAN_DIR.glob("*.md"))
    if args.only:
        files = [f for f in files if any(s in f.name for s in args.only)]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    CHUNK_DIR.mkdir(parents=True, exist_ok=True)

    llm, log = LLM(), Log()
    done = cached = skipped = failed = 0
    report = []
    for path in files:
        header, body = split_header(path.read_text(encoding="utf-8"))
        meta = {k: header_field(header, k) for k in ("display_title", "track", "tracks", "kind", "sha256")}
        kind = meta["kind"]
        if kind not in ("guidance", "reference"):
            skipped += 1
            continue
        out = OUT_DIR / f"{path.stem}.json"
        if not args.force and read_cache(out, meta["sha256"]):
            cached += 1
            continue
        if args.limit is not None and done + failed >= args.limit:
            break
        print(f"[{kind}] {meta['display_title']} ({len(body)} chars)")
        t0 = time.time()
        try:
            if kind == "guidance":
                result = structure_guidance(llm, path.name, meta, body, log, args.force)
            else:
                result = structure_reference(llm, path.name, meta, body, log)
        except OutOfQuota as e:
            log.add(path.name, "stopped", e)
            failed += 1
            break
        except Exception as e:  # auth or unexpected API error: record and keep going
            log.add(path.name, "error", f"{type(e).__name__}: {e}")
            result = None
        if result is None:
            failed += 1
            continue
        data, providers = result
        if not data["tracks"]:  # fall back to the folder's tracks
            data["tracks"] = [t.strip() for t in meta["tracks"].split(";") if t.strip() in TRACKS]
        hits = Counter()
        data = scrub(data, hits)
        for (what, original, _), count in hits.items():
            log.add(path.name, "scrubbed", f"{what} x{count}")
        record = {"display_title": meta["display_title"], "kind": kind, "source_file": path.name,
                  "sha256": meta["sha256"], **data,
                  "model": ", ".join(f"{p}:{GROQ_MODEL if p == 'groq' else GEMINI_MODEL} x{n}"
                                     for p, n in providers.items()),
                  "prompt_version": PROMPT_VERSION}
        write_json(out, record)
        done += 1
        counts = (f"{data['doc_type']}, {len(data['experiences'])} experiences, {len(data['links'])} links, "
                  f"{len(data['tips'])} tips" if kind == "guidance" else f"{len(data['topics'])} topics")
        line = f"{meta['display_title']}: {counts}; {record['model']}; {time.time() - t0:.0f}s"
        report.append(line)
        print(f"  -> {out.relative_to(ROOT)}: {counts}")

    log.close()
    print("\nResults:")
    for line in report:
        print(f"  {line}")
    print(f"\nDone {done}, cached {cached}, other kinds {skipped}, failed {failed}; "
          f"{log.rows} log rows in {ERRORS_CSV.relative_to(ROOT)}")
    print(f"Calls {dict(llm.calls)}, tokens {dict(llm.tokens)}; {time.time() - start:.0f}s")


if __name__ == "__main__":
    main()
