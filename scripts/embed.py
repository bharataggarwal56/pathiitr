"""Split the clean documents into small chunks and embed them locally -> data/work/chunks.jsonl.

Model: gte-small (384 dims), the ONNX weights from the Supabase/gte-small Hugging Face repo at a pinned
revision. Supabase Edge Functions have the same model built in (Supabase.ai.Session('gte-small') with
mean_pool + normalize), so the app can embed questions at no cost and land in the same vector space.
Here we use onnxruntime + tokenizers with the same pooling: mean over real tokens, then L2-normalise.
The model downloads once into ~/.cache/huggingface (outside the repo).

What gets chunked:
  kind=guidance - full text of data/work/clean/*.md. A Markdown heading starts a new chunk;
      "## Page N" lines only set the page; YAML front-matter blocks inside Notion (.md) bodies are
      dropped. Paragraphs are packed up to ~300 tokens (too-long ones are split on sentences, then
      lines, then words), the next chunk in the same section repeats the last ~50 tokens of whole
      sentences, and chunks under ~30 tokens are merged into the one before.
  kind=curriculum - not the PDF text (its tables come out one cell per line) but data/work/courses.json:
      one chunk per semester (core courses and elective slots with credits) and one per elective group
      (program electives, honours-only, each talent-enhancement basket, open electives) with each
      elective's mapped tracks, labelled "Track mapping based on course titles." Long groups are split
      into parts. If courses.json is missing or built from another curriculum file, it is skipped.
  kind=reference (casebooks, PM books, DSA notes) - no full text. One chunk per document built only
      from data/work/structured/<stem>.json: display_title, tracks, summary and topics. Documents whose
      JSON is missing, unreadable or for a different sha256 are skipped with a warning.

For guidance chunks the embedded text is "<display_title> - <heading>" plus the chunk text, so short
chunks keep their context; the stored `text` has no prefix. Curriculum and reference chunks already
start with a title line and are embedded as they are. Every embedded input must fit gte-small's 512 tokens,
counting [CLS] and [SEP], or the script stops (nothing is silently truncated). Any chunk that the
anonymise regex pass would still change is listed as a warning.

Also writes data/work/chunks_meta.json (model, revision, settings, counts). An existing "edge_check"
entry there (cosine vs the Edge Function, written by hand after checking) is kept if the model and
revision are unchanged.

Run from the repo root:
  python scripts/embed.py                         # build chunks.jsonl + chunks_meta.json
  python scripts/embed.py --search "question"     # top 5 chunks for a question (local check only)
"""

import argparse
import json
import os
import re
import statistics
from collections import Counter
from datetime import date

import numpy as np
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer

from anonymise import header_field, regex_pass, split_header
from inventory import ROOT

CLEAN_DIR = ROOT / "data" / "work" / "clean"
STRUCTURED_DIR = ROOT / "data" / "work" / "structured"
COURSES_JSON = ROOT / "data" / "work" / "courses.json"
OUT_JSONL = ROOT / "data" / "work" / "chunks.jsonl"
META_JSON = ROOT / "data" / "work" / "chunks_meta.json"

MODEL_ID = "Supabase/gte-small"
MODEL_REVISION = "93b36ff09519291b77d6000d2e86bd8565378086"
ONNX_FILE = "onnx/model.onnx"
DIMS = 384
MAX_TOKENS = 512  # gte-small's limit, including [CLS] and [SEP]
TARGET_TOKENS = 300
OVERLAP_TOKENS = 50
MIN_TOKENS = 30
BATCH = 32
FULL_TEXT_KINDS = {"guidance"}
MAPPING_NOTE = "Track mapping based on course titles."
ELECTIVE_SLOT_AREAS = {"HSSEC", "OEC", "TEB", "PEC", "MSC/DHC"}

HEADING = re.compile(r"^(#{1,6})\s+(.*)")
PAGE = re.compile(r"^## Page (\d+)\s*$")
FRONT_MATTER = re.compile(r"(?m)^---\n(?:[A-Za-z_][\w ]*:.*\n)+---$")
SENTENCE = re.compile(r"(?<=[.!?])\s+")
# Ways to split a paragraph that is too long, tried in order, with the separator to rejoin pieces.
SPLITTERS = [(SENTENCE, " "), (re.compile(r"\n"), "\n"), (re.compile(r" +"), " ")]


class Embedder:
    def __init__(self):
        tokenizer_path = hf_hub_download(MODEL_ID, "tokenizer.json", revision=MODEL_REVISION)
        model_path = hf_hub_download(MODEL_ID, ONNX_FILE, revision=MODEL_REVISION)
        self.tokenizer = Tokenizer.from_file(tokenizer_path)
        self.tokenizer.no_truncation()
        self.tokenizer.no_padding()
        self.session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
        self.inputs = {i.name for i in self.session.get_inputs()}

    def count(self, text, special=False):
        return len(self.tokenizer.encode(text, add_special_tokens=special).ids)

    def embed(self, texts):
        vectors = []
        for start in range(0, len(texts), BATCH):
            encodings = self.tokenizer.encode_batch(texts[start:start + BATCH])
            width = max(len(e.ids) for e in encodings)
            if width > MAX_TOKENS:
                raise ValueError(f"input of {width} tokens is over gte-small's {MAX_TOKENS}")
            ids = np.zeros((len(encodings), width), dtype=np.int64)
            mask = np.zeros_like(ids)
            for row, e in enumerate(encodings):
                ids[row, :len(e.ids)] = e.ids
                mask[row, :len(e.ids)] = 1
            feeds = {"input_ids": ids, "attention_mask": mask, "token_type_ids": np.zeros_like(ids)}
            hidden = self.session.run(None, {k: v for k, v in feeds.items() if k in self.inputs})[0]
            pooled = (hidden * mask[..., None]).sum(axis=1) / mask.sum(axis=1, keepdims=True)
            vectors.append(pooled / np.linalg.norm(pooled, axis=1, keepdims=True))
        return np.vstack(vectors)


def paragraphs(body):
    """(heading, page, text) per paragraph. "## Page N" sets the page; the first "# title" is skipped."""
    heading, page, lines, out, seen_title = None, None, [], [], False
    for line in body.split("\n") + [""]:
        page_m, head_m = PAGE.match(line), HEADING.match(line)
        if line.strip() and not page_m and not head_m:
            lines.append(line.rstrip())
            continue
        if lines:
            out.append((heading, page, "\n".join(lines)))
            lines = []
        if page_m:
            page = int(page_m.group(1))
        elif head_m:
            if seen_title or head_m.group(1) != "#":
                heading = head_m.group(2).strip()
            seen_title = True
    return out


def split_long(text, sep, count, level=0):
    """[(separator before piece, piece)] with each piece <= TARGET_TOKENS where possible."""
    if level == len(SPLITTERS) or count(text) <= TARGET_TOKENS:
        return [(sep, text)]
    pattern, join = SPLITTERS[level]
    out = []
    for i, unit in enumerate(u for u in pattern.split(text) if u.strip()):
        out += split_long(unit, sep if i == 0 else join, count, level + 1)
    return out


def overlap(text, count):
    """Trailing whole sentences of text, up to OVERLAP_TOKENS; empty if that would be all of it."""
    sentences = [s for s in SENTENCE.split(text) if s.strip()]
    kept, n = [], 0
    for sentence in reversed(sentences[1:]):
        m = count(sentence)
        if n + m > OVERLAP_TOKENS:
            break
        kept.insert(0, sentence)
        n += m
    return " ".join(kept), n


def pack(paras, count):
    """Greedy packing of paragraph pieces into chunks of about TARGET_TOKENS within one heading."""
    chunks, cur = [], None
    for heading, page, text in paras:
        for sep, piece in split_long(text, "\n\n", count):
            n = count(piece)
            if cur and (heading != cur["heading"] or cur["n"] + n > TARGET_TOKENS):
                chunks.append(cur)
                carry, carry_n = overlap(cur["text"], count) if heading == cur["heading"] else ("", 0)
                pages = [cur["pages"][-1]] if carry else []
                cur = {"heading": heading, "pages": pages, "text": carry, "n": carry_n, "carry": len(carry)}
            if cur is None:
                cur = {"heading": heading, "pages": [], "text": "", "n": 0, "carry": 0}
            cur["text"] += (sep if cur["text"] else "") + piece
            cur["n"] += n
            cur["pages"].append(page)
    if cur:
        chunks.append(cur)

    merged = []
    for c in chunks:
        if merged and c["n"] < MIN_TOKENS:
            prev = merged[-1]
            text = c["text"][c["carry"]:].strip()
            if c["heading"] != prev["heading"] and c["heading"]:
                text = f"{c['heading']}\n{text}"
            prev["text"] += "\n\n" + text
            prev["pages"] += c["pages"]
        else:
            merged.append(c)
    return merged


def doc_meta(path, header):
    return {"doc": path.stem, "display_title": header_field(header, "display_title"),
            "tracks": [t.strip() for t in header_field(header, "tracks").split(";") if t.strip()],
            "kind": header_field(header, "kind")}


def text_chunks(path, header, body, count):
    meta = doc_meta(path, header)
    if header_field(header, "file_type") == "md":
        body = FRONT_MATTER.sub("", body)
    for c in pack(paragraphs(body), count):
        pages = [p for p in c["pages"] if p is not None]
        title = meta["display_title"]
        yield {**meta, "source": "clean_text", "heading": c["heading"],
               "page_start": min(pages) if pages else None, "page_end": max(pages) if pages else None,
               "text": c["text"], "embed_input": f"{title} - {c['heading']}\n\n{c['text']}" if c["heading"]
               else f"{title}\n\n{c['text']}"}


def course_line(c):
    line = f"{c['code']} {c['name']}, {c['credits']} credits, {c['category']}"
    if c["category"] == "elective":
        sub_area = f" ({c['sub_area']})" if c.get("sub_area") else ""
        line += f"; tracks: {', '.join(c.get('tracks_helped') or []) or 'none mapped'}{sub_area}"
        if c.get("offered"):
            line += f"; offered in {c['offered']}"
        if "dhc" in c["lists"] and "pec" in c["lists"]:
            line += "; also a Departmental Honours course"
    return line


def elective_group(c):
    if "pec" in c["lists"]:
        return "program elective courses"
    if "dhc" in c["lists"]:
        return "Departmental Honours courses"
    if c["elective_group"]:
        return f"talent enhancement basket {c['elective_group']}"
    if "oec" in c["lists"]:
        return "open elective courses"
    return "other elective courses"


def split_lines(lines, count, budget):
    """Greedy groups of lines with each group's token count within budget."""
    groups, cur, n = [], [], 0
    for line in lines:
        m = count(line)
        if cur and n + m > budget:
            groups.append(cur)
            cur, n = [], 0
        cur.append(line)
        n += m
    return groups + [cur] if cur else groups


def curriculum_chunks(path, header, count, warnings):
    """Chunks from courses.json: one per semester, one (or more parts) per elective group."""
    try:
        data = json.loads(COURSES_JSON.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        warnings.append(f"skipped {path.stem}: courses.json missing or unreadable ({e.__class__.__name__})")
        return []
    if data.get("source") != path.name:
        warnings.append(f"skipped {path.stem}: courses.json was built from {data.get('source')!r}")
        return []
    meta = doc_meta(path, header)
    title = meta["display_title"]
    sections = []  # (heading, first lines, item lines)

    by_semester = {}
    for c in data["courses"]:
        if c["year"]:
            by_semester.setdefault((c["year"], c["semester"]), []).append(course_line(c))
    for s in data["slots"]:
        slot = "elective slot" if s["subject_area"] in ELECTIVE_SLOT_AREAS else "core or elective slot"
        by_semester.setdefault((s["year"], s["semester"]), []).append(
            f"{s['slot']} {s['name']}, {s['credits']} credits, {slot}")
    for (year, semester), lines in sorted(by_semester.items(), key=lambda kv: (kv[0][0], kv[0][1] != "Autumn")):
        heading = f"Year {year}, {semester} semester"
        sections.append((heading, [f"{title}: {data['programme']}, {heading.lower()}"], lines))

    groups = {}
    for c in data["courses"]:
        if c["category"] == "elective":
            groups.setdefault(elective_group(c), []).append(course_line(c))
    for name, lines in groups.items():
        sections.append((f"Electives: {name}", [f"{title}: {data['programme']}, {name}", MAPPING_NOTE], lines))

    chunks = []
    for heading, first, lines in sections:
        parts = split_lines(lines, count, TARGET_TOKENS - count("\n".join(first)) - 8)
        for i, part in enumerate(parts, 1):
            head = list(first)
            if len(parts) > 1:
                head[0] += f" (part {i} of {len(parts)})"
            text = "\n".join(head + part)
            chunks.append({**meta, "source": "courses_json", "heading": heading, "page_start": None,
                           "page_end": None, "text": text, "embed_input": text})
    return chunks


def reference_chunk(path, header, warnings):
    meta = doc_meta(path, header)
    json_path = STRUCTURED_DIR / f"{path.stem}.json"
    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        warnings.append(f"skipped {path.stem}: structured JSON missing or unreadable ({e.__class__.__name__})")
        return None
    if data.get("sha256") != header_field(header, "sha256"):
        warnings.append(f"skipped {path.stem}: structured JSON is for a different sha256")
        return None
    text = "\n".join([
        data.get("display_title") or meta["display_title"],
        "Tracks: " + ", ".join(data.get("tracks") or meta["tracks"]),
        (data.get("summary") or "").strip(),
        "Topics: " + "; ".join(data.get("topics") or []),
    ])
    return {**meta, "source": "structured_summary", "heading": None, "page_start": None,
            "page_end": None, "text": text, "embed_input": text}


def build():
    embedder = Embedder()
    count = embedder.count
    chunks, warnings = [], []
    for path in sorted(CLEAN_DIR.glob("*.md")):
        header, body = split_header(path.read_text(encoding="utf-8"))
        kind = header_field(header, "kind")
        sha8 = header_field(header, "sha256")[:8]
        if kind in FULL_TEXT_KINDS:
            doc_chunks = list(text_chunks(path, header, body, count))
        elif kind == "curriculum":
            doc_chunks = curriculum_chunks(path, header, count, warnings)
        elif kind == "reference":
            doc_chunks = [c for c in [reference_chunk(path, header, warnings)] if c]
        else:
            warnings.append(f"skipped {path.stem}: unknown kind {kind!r}")
            continue
        for i, c in enumerate(doc_chunks):
            c["id"] = f"{sha8}-{i:04d}"
            c["chunk_index"] = i
            c["n_tokens"] = count(c["text"])
            n_input = count(c["embed_input"], special=True)
            if n_input > MAX_TOKENS:
                raise SystemExit(f"{c['id']}: embedded input is {n_input} tokens (limit {MAX_TOKENS})")
            hits = Counter()
            if regex_pass(c["text"], hits) != c["text"]:
                kinds = ", ".join(sorted({k for k, _, _ in hits}))
                warnings.append(f"{c['id']} ({c['display_title']}): regex pass would change it ({kinds})")
        chunks += doc_chunks

    vectors = embedder.embed([c["embed_input"] for c in chunks])
    fields = ["id", "doc", "display_title", "tracks", "kind", "source", "heading", "page_start",
              "page_end", "chunk_index", "n_tokens", "text"]
    tmp = OUT_JSONL.with_suffix(".jsonl.tmp")
    with tmp.open("w", encoding="utf-8") as f:
        for c, v in zip(chunks, vectors):
            row = {k: c[k] for k in fields} | {"embedding": [round(float(x), 6) for x in v]}
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    os.replace(tmp, OUT_JSONL)

    write_meta(chunks)
    print_summary(chunks, vectors, warnings, count)


def write_meta(chunks):
    old = json.loads(META_JSON.read_text(encoding="utf-8")) if META_JSON.exists() else {}
    meta = {
        "model": MODEL_ID, "revision": MODEL_REVISION, "onnx_file": ONNX_FILE, "dims": DIMS,
        "pooling": "mean over attention mask, then L2 normalise (Supabase.ai: mean_pool + normalize)",
        "embed_input": "'<display_title> - <heading>\\n\\n<text>' for clean_text chunks; text as is "
                       "for courses_json and structured_summary chunks",
        "settings": {"target_tokens": TARGET_TOKENS, "overlap_tokens": OVERLAP_TOKENS,
                     "min_tokens": MIN_TOKENS, "max_tokens_with_special": MAX_TOKENS,
                     "full_text_kinds": sorted(FULL_TEXT_KINDS),
                     "curriculum": "courses.json: one chunk per semester + per elective group",
                     "reference": "one structured summary chunk"},
        "by_source": dict(Counter(c["source"] for c in chunks)),
        "built": date.today().isoformat(),
        "chunks": len(chunks),
        "by_doc": dict(Counter(c["doc"] for c in chunks)),
        "by_track": dict(Counter(t for c in chunks for t in c["tracks"])),
        "by_kind": dict(Counter(c["kind"] for c in chunks)),
    }
    if old.get("edge_check") and old.get("model") == MODEL_ID and old.get("revision") == MODEL_REVISION:
        meta["edge_check"] = old["edge_check"]
    META_JSON.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def print_summary(chunks, vectors, warnings, count):
    print(f"Wrote {len(chunks)} chunks to {OUT_JSONL.relative_to(ROOT)}")
    for label, counter in [("source", Counter(c["source"] for c in chunks)),
                           ("kind", Counter(c["kind"] for c in chunks)),
                           ("track", Counter(t for c in chunks for t in c["tracks"]))]:
        print(f"  by {label}: " + ", ".join(f"{k} {v}" for k, v in counter.most_common()))
    sizes = [c["n_tokens"] for c in chunks if c["source"] == "clean_text"]
    if sizes:
        print(f"  clean_text tokens: min {min(sizes)}, median {statistics.median(sizes):.0f}, max {max(sizes)}")
    longest = max(count(c["embed_input"], special=True) for c in chunks)
    norms = np.linalg.norm(vectors, axis=1)
    print(f"  longest embedded input: {longest} tokens incl. [CLS]/[SEP] (limit {MAX_TOKENS})")
    print(f"  vectors: {vectors.shape[1]} dims, norm {norms.min():.4f}-{norms.max():.4f}")
    print(f"Warnings: {len(warnings)}")
    for w in warnings:
        print("  " + w)


def search(question, top=5):
    rows = [json.loads(line) for line in OUT_JSONL.read_text(encoding="utf-8").splitlines()]
    matrix = np.array([r["embedding"] for r in rows], dtype=np.float32)
    scores = matrix @ Embedder().embed([question])[0]
    print(f"Q: {question}")
    for i in np.argsort(-scores)[:top]:
        r = rows[i]
        page = f"p.{r['page_start']}" + (f"-{r['page_end']}" if r["page_end"] != r["page_start"] else "") \
            if r["page_start"] else "-"
        print(f"  {scores[i]:.3f}  {r['display_title']} [{r['kind']}; {', '.join(r['tracks'])}] "
              f"| {r['heading'] or '-'} | {page}")
        print(f"         {' '.join(r['text'].split())[:150]}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--search", metavar="QUESTION", help="print the top 5 chunks for a question")
    args = parser.parse_args()
    if args.search:
        search(args.search)
    else:
        build()


if __name__ == "__main__":
    main()
