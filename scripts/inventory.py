"""Inventory every file under data/raw and write data/work/inventory.csv.

One row per unique document. Exact duplicates (same SHA-256) and near-duplicates
(extracted text over 90% similar) are merged: one copy is kept and every track it
appeared in is listed.

Columns: path, display_title, track, tracks, kind, subfolder, file_type, size_bytes,
         pages, text_status, sha256, duplicate_paths, duplicate_match
  - track / tracks: career track of the kept copy / all tracks the document appeared in
  - kind: guidance | reference | curriculum | skip
  - display_title: clean title with no person's name; later steps and the app must show
    this, never the original file name
  - pages: PDF pages, PPTX slides, DOCX pages (from document properties, may be blank)
  - text_status: text | ocr | mixed | unknown
      text  = selectable text found, no OCR needed
      ocr   = no (or almost no) selectable text, needs OCR
      mixed = PDF where only some pages have selectable text (those pages need OCR)

Run from the repo root:  python scripts/inventory.py
"""

import csv
import difflib
import hashlib
import re
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

import pymupdf
from docx import Document
from pptx import Presentation

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
OUT_CSV = ROOT / "data" / "work" / "inventory.csv"

# A PDF page with fewer characters than this is treated as having no real text layer.
MIN_CHARS_PER_PAGE = 25
TEXT_SUFFIXES = {".md", ".txt", ".cpp", ".py", ".csv", ".json", ".html"}
CODE_SUFFIXES = {".cpp", ".py"}
SKIP_DIRS = {"excluded"}

# Near-duplicate check on extracted text: pairs sharing at least NEAR_DUP_PREFILTER of their
# word 5-grams (Jaccard) get a full difflib similarity ratio, which must exceed the threshold.
NEAR_DUP_THRESHOLD = 0.90
NEAR_DUP_PREFILTER = 0.50
NEAR_DUP_MIN_CHARS = 200  # too little text (e.g. scanned PDFs) to compare reliably
SHINGLE_WORDS = 5

CROSS_TRACK = "Cross-track"
DRIVE_PREFIX = ("drive", "ALL RESOURCES")
TRACK_BY_FOLDER = {
    "ANALYST": "Analyst",
    "CONSULTING - PM": "Consulting/PM",
    "DATA SCIENCE": "Data Science",
    "ECE CORE": "ECE Core",
    "QUANT": "Quant/HFT",
    "SOFTWARE": "Software",
}

# kind by path relative to data/raw. Anything not listed gets a warning and "guidance".
G, R, C, S = "guidance", "reference", "curriculum", "skip"
# display_title by the same key: readable, with no person's name.
META = {
    "cdc/CDC'S INTERNSHIP REPOSITORY 2025-2026.pdf": (G, "CDC internship repository 2025-26"),
    "curriculum/Structure_new.pdf": (C, "Curriculum structure"),
    "notion/introduction.md": (G, "Introduction"),
    "notion/websites.md": (G, "Useful websites"),
    "drive/ALL RESOURCES/Internship Tips_2022.docx": (G, "Internship tips (2022)"),
    "drive/ALL RESOURCES/specific programs and opportunities.docx": (G, "Specific programs and opportunities"),
    "drive/ALL RESOURCES/ANALYST/Analytics_ Business Analyst.docx": (G, "Analytics: business analyst"),
    "drive/ALL RESOURCES/ANALYST/RCS Guesstimate Book.pdf": (R, "RCS guesstimate book"),
    "drive/ALL RESOURCES/ANALYST/IIM A Case.pdf": (R, "IIM A case"),
    "drive/ALL RESOURCES/CONSULTING - PM/Consulting/IIM A Case.pdf": (R, "IIM A case"),
    "drive/ALL RESOURCES/CONSULTING - PM/Consulting/Case Compendium.pdf": (R, "Case compendium"),
    "drive/ALL RESOURCES/CONSULTING - PM/Consulting/How to go About_.docx": (G, "How to go about consulting"),
    "drive/ALL RESOURCES/CONSULTING - PM/Consulting/IIM Lucknow Casebook 2021.pdf": (R, "IIM Lucknow casebook 2021"),
    "drive/ALL RESOURCES/CONSULTING - PM/Consulting/IIT-BHU Casebook 2023.pdf": (R, "IIT BHU casebook 2023"),
    "drive/ALL RESOURCES/CONSULTING - PM/Product/Interview Prep/13 Common Product Manager Interview Questions _ Answers _ by Ben Aston _ The Product Manager _ Medium.pdf": (R, "13 common PM interview questions and answers"),
    "drive/ALL RESOURCES/CONSULTING - PM/Product/Interview Prep/20 Key Questions to Ask in a Product Management Interview _ by Carlos G de Villaumbrosia _ Agile Insider _ Medium.pdf": (R, "20 key questions to ask in a PM interview"),
    "drive/ALL RESOURCES/CONSULTING - PM/Product/Interview Prep/The Ultimate List of Product Manager Interview Questions _ by Carlos G de Villaumbrosia _ Product School _ Medium.pdf": (R, "The ultimate list of PM interview questions"),
    "drive/ALL RESOURCES/CONSULTING - PM/Product/Interview Prep/PM Case Study Guide.pdf": (R, "PM case study guide"),
    "drive/ALL RESOURCES/CONSULTING - PM/Product/Interview Prep/What happens in an interview.pdf": (G, "What happens in an interview"),
    "drive/ALL RESOURCES/CONSULTING - PM/Product/Learning resources/IITBHU The PM Book.pdf": (R, "The PM book (IIT BHU)"),
    "drive/ALL RESOURCES/DATA SCIENCE/ML_Resources.pdf": (G, "ML resources"),
    "drive/ALL RESOURCES/ECE CORE/Core ECE  Internship prep.pdf": (G, "Core ECE internship prep"),
    "drive/ALL RESOURCES/ECE CORE/Internship_talk_EESS.pptx.pdf": (G, "Internship talk (EESS)"),
    "drive/ALL RESOURCES/QUANT/Copy of Internship_Prep_sde_quant_vasu.docx": (G, "SDE and Quant internship prep"),
    "drive/ALL RESOURCES/SOFTWARE/Internship_Prep_sde_quant_vasu.docx": (G, "SDE and Quant internship prep"),
    "drive/ALL RESOURCES/SOFTWARE/CP resources_Amandeeep.docx": (G, "CP resources (contests and practice)"),
    "drive/ALL RESOURCES/SOFTWARE/CP resources_ dgstar (advanced + docs specially).docx": (G, "CP resources (advanced)"),
    "drive/ALL RESOURCES/SOFTWARE/CP_resources_general.docx": (G, "CP resources (general)"),
    "drive/ALL RESOURCES/SOFTWARE/cp_vk/cpResourcesVipul.docx": (G, "CP resources (starter ladders)"),
    "drive/ALL RESOURCES/SOFTWARE/cp_vk/DP theory .pdf": (R, "DP theory"),
    "drive/ALL RESOURCES/SOFTWARE/cp_vk/Fenwick Tree.pdf": (R, "Fenwick tree"),
    "drive/ALL RESOURCES/SOFTWARE/cp_vk/Number Theory.pdf": (R, "Number theory"),
    "drive/ALL RESOURCES/SOFTWARE/cp_vk/NumberTheoryquestions.pdf": (R, "Number theory questions"),
    "drive/ALL RESOURCES/SOFTWARE/cp_vk/segmenttree_resources.pdf": (R, "Segment tree resources"),
    "drive/ALL RESOURCES/SOFTWARE/cp_vk/segtree_1.cpp": (S, "Segment tree code"),
}


def career_track(rel):
    """Map a path relative to data/raw to a career track."""
    parts = rel.parts
    if parts[0] == "cdc":
        return CROSS_TRACK
    if parts[0] == "notion":
        return "Software"
    if parts[0] == "curriculum":
        return "curriculum"
    if parts[:2] == DRIVE_PREFIX:
        if len(parts) == 3:  # directly in ALL RESOURCES
            return CROSS_TRACK
        if parts[2] in TRACK_BY_FOLDER:
            return TRACK_BY_FOLDER[parts[2]]
    print(f"WARN {rel}: no track mapping, using {CROSS_TRACK}", file=sys.stderr)
    return CROSS_TRACK


def kind_and_title(rel):
    key = rel.as_posix()
    if key in META:
        return META[key]
    print(f"WARN {rel}: not in META, defaulting kind to guidance", file=sys.stderr)
    kind = S if rel.suffix.lower() in CODE_SUFFIXES else G
    return kind, re.sub(r"[_\s]+", " ", rel.stem).strip()


def inspect_pdf(path):
    with pymupdf.open(path) as doc:
        pages = doc.page_count
        with_text = sum(
            1 for page in doc if len(page.get_text().strip()) >= MIN_CHARS_PER_PAGE
        )
    if pages == 0 or with_text == 0:
        status = "ocr"
    elif with_text == pages:
        status = "text"
    else:
        status = "mixed"
    return pages, status


def inspect_docx(path):
    doc = Document(path)
    chars = sum(len(p.text.strip()) for p in doc.paragraphs)
    chars += sum(
        len(cell.text.strip())
        for table in doc.tables
        for row in table.rows
        for cell in row.cells
    )
    pages = ""
    with zipfile.ZipFile(path) as z:
        if "docProps/app.xml" in z.namelist():
            m = re.search(r"<Pages>(\d+)</Pages>", z.read("docProps/app.xml").decode("utf-8", "ignore"))
            if m:
                pages = int(m.group(1))
    return pages, "text" if chars >= MIN_CHARS_PER_PAGE else "ocr"


def inspect_pptx(path):
    prs = Presentation(path)
    chars = 0
    for slide in prs.slides:
        for shape in slide.shapes:
            if shape.has_text_frame:
                chars += len(shape.text_frame.text.strip())
    return len(prs.slides), "text" if chars >= MIN_CHARS_PER_PAGE else "ocr"


def inspect_plain(path):
    text = path.read_text(encoding="utf-8", errors="ignore")
    return "", "text" if text.strip() else "unknown"


def inspect(path):
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return inspect_pdf(path)
    if suffix == ".docx":
        return inspect_docx(path)
    if suffix == ".pptx":
        return inspect_pptx(path)
    if suffix in TEXT_SUFFIXES:
        return inspect_plain(path)
    return "", "unknown"


def extract_text(path):
    """All selectable text in the file, for the near-duplicate check only."""
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        with pymupdf.open(path) as doc:
            return "\n".join(page.get_text() for page in doc)
    if suffix == ".docx":
        doc = Document(path)
        parts = [p.text for p in doc.paragraphs]
        parts += [c.text for t in doc.tables for row in t.rows for c in row.cells]
        return "\n".join(parts)
    if suffix == ".pptx":
        return "\n".join(
            shape.text_frame.text
            for slide in Presentation(path).slides
            for shape in slide.shapes
            if shape.has_text_frame
        )
    if suffix in TEXT_SUFFIXES:
        return path.read_text(encoding="utf-8", errors="ignore")
    return ""


def shingles(text):
    words = re.findall(r"\w+", text.lower())
    if len(words) < SHINGLE_WORDS:
        return set()
    return {tuple(words[i:i + SHINGLE_WORDS]) for i in range(len(words) - SHINGLE_WORDS + 1)}


def jaccard(a, b):
    return len(a & b) / len(a | b)


def similarity(text_a, text_b, set_a, set_b):
    """Text similarity in 0..1, or 0 if the pair is clearly different (cheap prefilter)."""
    if jaccard(set_a, set_b) < NEAR_DUP_PREFILTER:
        return 0.0
    return difflib.SequenceMatcher(None, text_a, text_b, autojunk=False).ratio()


def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def keep_order(row):
    """Which copy to keep: prefer originals over 'Copy of ...', then path order."""
    return (row["path"].rsplit("/", 1)[-1].lower().startswith("copy of"), row["path"])


def find_groups(rows):
    """Group rows that are the same document. Returns (groups, how) where how maps a
    non-kept row's path to 'exact' or 'near (NN%)'."""
    parent = list(range(len(rows)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    how = {}
    by_hash = defaultdict(list)
    for i, r in enumerate(rows):
        by_hash[r["sha256"]].append(i)
    for idxs in by_hash.values():
        for i in idxs[1:]:
            parent[find(i)] = find(idxs[0])
            how[rows[i]["path"]] = "exact"

    sets = {}
    texts = {}
    for i, r in enumerate(rows):
        text = r.pop("_text")
        if len(text.strip()) >= NEAR_DUP_MIN_CHARS:
            texts[i] = text
            sets[i] = shingles(text)
    ids = sorted(sets)
    for n, i in enumerate(ids):
        for j in ids[n + 1:]:
            if find(i) == find(j) or not sets[i] or not sets[j]:
                continue
            sim = similarity(texts[i], texts[j], sets[i], sets[j])
            if sim > NEAR_DUP_THRESHOLD:
                parent[find(j)] = find(i)
                how.setdefault(rows[j]["path"], f"near ({sim:.0%})")
                how.setdefault(rows[i]["path"], f"near ({sim:.0%})")

    groups = defaultdict(list)
    for i, r in enumerate(rows):
        groups[find(i)].append(r)
    return list(groups.values()), how


def merge(rows):
    groups, how = find_groups(rows)
    merged = []
    for group in groups:
        group.sort(key=keep_order)
        kept = dict(group[0])
        tracks = []
        for r in group:
            if r["track"] not in tracks:
                tracks.append(r["track"])
        kept["tracks"] = "; ".join(tracks)
        kept["duplicate_paths"] = "; ".join(r["path"] for r in group[1:])
        kept["duplicate_match"] = "; ".join(sorted({how[r["path"]] for r in group[1:] if r["path"] in how}))
        merged.append(kept)
    merged.sort(key=lambda r: r["path"])
    return merged


def main():
    if not RAW_DIR.is_dir():
        sys.exit(f"{RAW_DIR} not found")

    files = sorted(
        p for p in RAW_DIR.rglob("*")
        if p.is_file() and not (set(p.relative_to(RAW_DIR).parts) & SKIP_DIRS)
    )

    rows = []
    for path in files:
        rel = path.relative_to(RAW_DIR)
        try:
            pages, status = inspect(path)
            text = extract_text(path)
        except Exception as e:  # corrupt/encrypted file: record it, keep going
            print(f"WARN {rel}: {type(e).__name__}: {e}", file=sys.stderr)
            pages, status, text = "", "unknown", ""
        kind, title = kind_and_title(rel)
        rows.append({
            "path": rel.as_posix(),
            "display_title": title,
            "track": career_track(rel),
            "kind": kind,
            "subfolder": "/".join(rel.parts[1:-1]),
            "file_type": path.suffix.lower().lstrip(".") or "none",
            "size_bytes": path.stat().st_size,
            "pages": pages,
            "text_status": status,
            "sha256": sha256(path),
            "_text": text,
        })

    total = len(rows)
    rows = merge(rows)

    fields = ["path", "display_title", "track", "tracks", "kind", "subfolder", "file_type",
              "size_bytes", "pages", "text_status", "sha256", "duplicate_paths", "duplicate_match"]
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} unique documents ({total} files scanned) to {OUT_CSV.relative_to(ROOT)}\n")
    print_summary(rows)


def print_summary(rows):
    by_track = defaultdict(Counter)
    size = Counter()
    pages = Counter()
    for r in rows:
        by_track[r["track"]][r["file_type"]] += 1
        size[r["track"]] += r["size_bytes"]
        pages[r["track"]] += r["pages"] or 0

    print(f"{'track':<16}{'type':<8}{'files':>6}")
    for track in sorted(by_track):
        for ftype, n in sorted(by_track[track].items()):
            print(f"{track:<16}{ftype:<8}{n:>6}")
        print(f"{'':<16}{'total':<8}{sum(by_track[track].values()):>6}"
              f"  {size[track] / 1e6:.1f} MB, {pages[track]} pages/slides")

    print("\nKind:", dict(Counter(r["kind"] for r in rows)))

    print("\nText extraction status:")
    status = Counter((r["file_type"], r["text_status"]) for r in rows)
    for (ftype, st), n in sorted(status.items()):
        print(f"  {ftype:<8}{st:<9}{n:>4}")

    dups = [r for r in rows if r["duplicate_paths"]]
    print(f"\nDuplicate groups ({len(dups)}):")
    for r in dups:
        print(f"  {r['display_title']} [{r['duplicate_match']}] tracks: {r['tracks']}")
        print(f"    kept:   {r['path']}")
        print(f"    merged: {r['duplicate_paths']}")

    needs_ocr = [r for r in rows if r["text_status"] in ("ocr", "mixed")]
    if needs_ocr:
        print(f"\nNeed OCR ({len(needs_ocr)}):")
        for r in needs_ocr:
            print(f"  [{r['text_status']}] {r['display_title']}")


if __name__ == "__main__":
    main()
