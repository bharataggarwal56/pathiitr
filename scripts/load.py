"""Upload data/work/ to Supabase (documents, chunks + embeddings, experiences, skill matrix, courses).

Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY from .env.local and talks to the REST API
(PostgREST) with `requests`, using the secret key. Safe to re-run: every table is upserted on its
natural key, so a second run changes nothing. Rows that no longer exist in data/work/ are then
deleted, but only from the content tables listed in CONTENT_TABLES; profiles, conversations,
chat_messages, message_feedback and llm_cache are never touched.

  documents         structured/*.json (+ the curriculum doc's front matter in clean/); metadata only,
                    no file paths. The text itself lives in chunks.
  chunks            chunks.jsonl (embeddings are gte-small, 384 dims)
  experiences       experiences[] of each structured/*.json
  skill_matrix      skill_matrix.json
  courses           courses.json merged with elective_tracks.json
  curriculum_slots  courses.json "slots"

Before anything is written, all text going up is checked with the anonymise regexes (emails, phones,
roll numbers, personal profile links); one hit stops the run. On "permission denied" the script stops
too: fix the grants in a migration instead of working around them.

Run from the repo root:  .venv/bin/python scripts/load.py [--dry-run] [--no-prune]
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "data" / "work"

BATCH = 50  # chunks carry a 384-float embedding each (~8 KB), so keep requests small
EMBED_DIMS = 384

# Never prune anything outside this list.
CONTENT_TABLES = ["documents", "chunks", "experiences", "skill_matrix", "courses", "curriculum_slots"]

# Same patterns as scripts/anonymise.py (not imported: that module loads spaCy).
URL = r"(?:https?://)?(?:www\.)?"
PII = [
    ("email", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")),
    ("profile link", re.compile(
        URL + r"(?:[a-z]{2}\.)?(?:linkedin\.com/(?:in|posts|pub)/|instagram\.com/|(?:twitter|x)\.com/"
        r"|(?:facebook|fb)\.com/)[^\s)\]>]*", re.I)),
    ("profile link", re.compile(URL + r"github\.com/[A-Za-z0-9-]+/?(?=[\s)\]>]|$)", re.I)),
    ("phone", re.compile(r"(?<![\d.,])(?:\+91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?![\d.,])")),
    ("roll no.", re.compile(
        r"(?i:roll\s*(?:no\.?|number)|enrol?l?ment\s*(?:no\.?|number)?)\s*[:#-]?\s*\d{6,10}")),
    ("roll no.", re.compile(r"(?<![\d.,])(?:1[5-9]|2\d)\d{6}(?![\d.,])")),
]


class LoadError(Exception):
    pass


# ---------------------------------------------------------------------------------------------
# REST helpers
# ---------------------------------------------------------------------------------------------

class Api:
    def __init__(self, url, key):
        self.base = url.rstrip("/") + "/rest/v1"
        self.s = requests.Session()
        self.s.headers.update({"apikey": key, "Authorization": f"Bearer {key}"})

    def _check(self, r, what):
        if r.ok:
            return r
        body = r.text[:300]
        if r.status_code in (401, 403) or "permission denied" in body.lower():
            raise LoadError(
                f"{what}: permission denied ({r.status_code}). Not working around it; the migration "
                f"probably needs explicit grants to service_role. Response: {body}")
        if r.status_code == 404:
            raise LoadError(f"{what}: table not found. Has the migration been run? {body}")
        raise LoadError(f"{what}: HTTP {r.status_code}: {body}")

    def count(self, table):
        r = self.s.head(f"{self.base}/{table}", params={"select": "*"},
                        headers={"Prefer": "count=exact"}, timeout=30)
        self._check(r, f"count {table}")
        return int(r.headers["Content-Range"].split("/")[1])

    def keys(self, table, cols):
        """All rows, only the given columns (paged)."""
        out, start = [], 0
        while True:
            r = self.s.get(f"{self.base}/{table}", params={"select": ",".join(cols)},
                           headers={"Range": f"{start}-{start + 999}"}, timeout=60)
            self._check(r, f"read {table}")
            rows = r.json()
            out += rows
            if len(rows) < 1000:
                return out
            start += 1000

    def upsert(self, table, rows, on_conflict):
        for i in range(0, len(rows), BATCH):
            r = self.s.post(f"{self.base}/{table}", params={"on_conflict": on_conflict},
                            json=rows[i:i + BATCH], timeout=120,
                            headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
            self._check(r, f"upsert {table}")

    def delete_in(self, table, col, values):
        for i in range(0, len(values), BATCH):
            vals = ",".join('"' + str(v).replace('"', '\\"') + '"' for v in values[i:i + BATCH])
            r = self.s.delete(f"{self.base}/{table}", params={col: f"in.({vals})"}, timeout=60)
            self._check(r, f"delete {table}")


# ---------------------------------------------------------------------------------------------
# Build rows from data/work/
# ---------------------------------------------------------------------------------------------

def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def front_matter(path):
    text = Path(path).read_text(encoding="utf-8")
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    fm = {}
    for line in (m.group(1).splitlines() if m else []):
        k, _, v = line.partition(":")
        fm[k.strip()] = v.strip()
    return fm


def build_documents(chunks):
    """One row per document that has chunks. id = file stem (<slug>-<sha8>)."""
    docs, experiences, warnings = {}, [], []
    for p in sorted((WORK / "structured").glob("*.json")):
        d = read_json(p)
        if not (WORK / "clean" / p.with_suffix(".md").name).exists():
            warnings.append(f"{p.name}: no clean/ file, skipped")
            continue
        docs[p.stem] = {
            "id": p.stem, "display_title": d["display_title"], "kind": d["kind"],
            "tracks": d["tracks"], "doc_type": d.get("doc_type"), "summary": d.get("summary"),
            "topics": d.get("topics"), "sha256": d["sha256"],
        }
        for i, e in enumerate(d.get("experiences") or []):
            experiences.append({
                "document_id": p.stem, "item_index": i, "company": e.get("company"),
                "role": e.get("role"), "year": e.get("year"), "track": e.get("track"),
                "eligibility": e.get("eligibility"), "rounds": e.get("rounds") or [],
                "skills": e.get("skills") or [], "tips": e.get("tips") or [],
            })
    # documents with chunks but no structured JSON (the curriculum): metadata from clean/ front matter
    for stem in sorted({c["document_id"] for c in chunks} - docs.keys()):
        fm = front_matter(WORK / "clean" / f"{stem}.md")
        if fm.get("kind") != "curriculum":
            raise LoadError(f"{stem}: has chunks but no structured JSON and is not a curriculum doc")
        docs[stem] = {
            "id": stem, "display_title": fm["display_title"], "kind": "curriculum",
            "tracks": ["curriculum"], "doc_type": None, "summary": None, "topics": None,
            "sha256": fm["sha256"],
        }
    return list(docs.values()), experiences, warnings


def build_chunks():
    rows = []
    for line in (WORK / "chunks.jsonl").read_text(encoding="utf-8").splitlines():
        c = json.loads(line)
        if len(c["embedding"]) != EMBED_DIMS:
            raise LoadError(f"chunk {c['id']}: embedding has {len(c['embedding'])} dims, want {EMBED_DIMS}")
        rows.append({
            "id": c["id"], "document_id": c["doc"], "chunk_index": c["chunk_index"],
            "source": c["source"], "heading": c["heading"], "page_start": c["page_start"],
            "page_end": c["page_end"], "tracks": c["tracks"], "n_tokens": c["n_tokens"],
            "content": c["text"],
            # pgvector text input; PostgREST casts it to vector(384)
            "embedding": "[" + ",".join(repr(float(x)) for x in c["embedding"]) + "]",
        })
    return rows


def build_skill_matrix():
    rows = []
    for track, levels in read_json(WORK / "skill_matrix.json")["tracks"].items():
        for level, skills in levels.items():
            for s in skills:
                rows.append({
                    "track": track, "skill": s["skill"], "level": level,
                    "sub_area": s.get("sub_area"), "evidence": s.get("evidence") or [],
                    "resources": s.get("resources") or [],
                })
    return rows


def build_courses():
    data = read_json(WORK / "courses.json")
    mapping = read_json(WORK / "elective_tracks.json")
    rows = []
    for c in data["courses"]:
        m = mapping.get(c["code"], {})
        rows.append({
            "code": c["code"], "name": c["name"], "credits": c["credits"], "year": c.get("year"),
            "semester": c.get("semester"), "category": c["category"],
            "subject_area": c.get("subject_area"), "elective_group": c.get("elective_group"),
            "lists": c.get("lists") or [], "offered": c.get("offered"), "topics": c.get("topics"),
            "tracks_helped": m.get("tracks_helped") or c.get("tracks_helped") or [],
            "sub_area": m.get("sub_area") or c.get("sub_area"),
            "track_reason": m.get("reason") or c.get("reason"),
        })
    slots = []
    for s in data["slots"]:
        credits = s["credits"]
        if isinstance(credits, str):  # "3/4": the column is a smallint, keep the lower value
            credits = min(int(x) for x in credits.split("/"))
        slots.append({**s, "credits": credits})
    return rows, slots


# ---------------------------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------------------------

def strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            if k not in ("embedding", "sha256"):
                yield from strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from strings(v)


def check_pii(tables):
    hits = []
    for table, rows in tables.items():
        for n, row in enumerate(rows):
            for text in strings(row):
                for label, rx in PII:
                    if rx.search(text):
                        hits.append(f"{table}[{n}]: {label}")
    if hits:
        raise LoadError("anonymisation check failed, nothing written:\n  " + "\n  ".join(hits[:20]))


def check_references(tracks_in_db, tables):
    known = set(tracks_in_db)
    used = set()
    for r in tables["experiences"]:
        if r["track"]:
            used.add(r["track"])
    used |= {r["track"] for r in tables["skill_matrix"]}
    if used - known:
        raise LoadError(f"tracks missing from the tracks table: {sorted(used - known)}")
    doc_ids = {d["id"] for d in tables["documents"]}
    bad = {c["document_id"] for c in tables["chunks"]} - doc_ids
    if bad:
        raise LoadError(f"chunks point at unknown documents: {sorted(bad)}")


# ---------------------------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------------------------

# table -> (on_conflict columns, key columns to compare when pruning, column to delete by)
SPEC = {
    "documents": ("id", ["id"], "id"),
    "chunks": ("id", ["id"], "id"),
    "experiences": ("document_id,item_index", ["id", "document_id", "item_index"], "id"),
    "skill_matrix": ("track,skill", ["id", "track", "skill"], "id"),
    "courses": ("code", ["code"], "code"),
    "curriculum_slots": ("slot", ["slot"], "slot"),
}


def prune(api, table, rows, dry_run):
    assert table in CONTENT_TABLES
    on_conflict, cols, del_col = SPEC[table]
    keep = {tuple(r[c] for c in on_conflict.split(",")) for r in rows}
    stale = [r[del_col] for r in api.keys(table, cols)
             if tuple(r[c] for c in on_conflict.split(",")) not in keep]
    if stale and not dry_run:
        api.delete_in(table, del_col, stale)
    return len(stale)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dry-run", action="store_true", help="validate and print counts, write nothing")
    ap.add_argument("--no-prune", action="store_true", help="keep rows that are no longer in data/work/")
    args = ap.parse_args()

    load_dotenv(ROOT / ".env.local")
    url, key = os.environ.get("NEXT_PUBLIC_SUPABASE_URL"), os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not key:
        sys.exit("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local")
    if key.startswith("sb_publishable_"):
        sys.exit("SUPABASE_SECRET_KEY holds a publishable key; use the secret key")

    try:
        chunks = build_chunks()
        documents, experiences, warnings = build_documents(chunks)
        skills = build_skill_matrix()
        courses, slots = build_courses()
        tables = {"documents": documents, "chunks": chunks, "experiences": experiences,
                  "skill_matrix": skills, "courses": courses, "curriculum_slots": slots}
        for w in warnings:
            print("warning:", w)
        check_pii(tables)

        api = Api(url, key)
        before = {t: api.count(t) for t in CONTENT_TABLES}  # also the "table exists + readable" preflight
        check_references([r["name"] for r in api.keys("tracks", ["name"])], tables)

        stale = {}
        for t in CONTENT_TABLES:  # FK order
            if not args.dry_run:
                api.upsert(t, tables[t], SPEC[t][0])
            print(f"  {t:<17} {'would upsert' if args.dry_run else 'upserted'} {len(tables[t])}")
        if not args.no_prune:
            # reverse FK order so children go first
            for t in reversed(CONTENT_TABLES):
                stale[t] = prune(api, t, tables[t], args.dry_run)
        after = {t: api.count(t) for t in CONTENT_TABLES}
    except LoadError as e:
        sys.exit(f"error: {e}")

    print(f"\n{'table':<18}{'in data/work':>13}{'before':>9}{'after':>8}{'pruned':>8}")
    for t in CONTENT_TABLES:
        print(f"{t:<18}{len(tables[t]):>13}{before[t]:>9}{after[t]:>8}{stale.get(t, 0):>8}")
    if args.dry_run:
        print("\ndry run: nothing was written")


if __name__ == "__main__":
    main()
