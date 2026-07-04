"""Semantic memory — Chroma persistent store over the vault (Phase M2).

Chroma is a persistent *directory* (memory.md §1), not a single file.
Collection `jarvis_vault`. Chunking: split on `##` headings, ~512-token
cap (~2000 chars), 64-token (~256 char) overlap.
"""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path

import chromadb

from memory import embedder

CHROMA_DIR = Path(
    os.environ.get("JARVIS_CHROMA_DIR", str(Path.home() / "jarvis" / "chroma"))
).expanduser()
COLLECTION = "jarvis_vault"

# Char-based approximations of the token budgets (avoids a tokenizer dep for M2).
_MAX_CHARS = 2000
_OVERLAP = 256

_client: chromadb.ClientAPI | None = None


def _collection():
    global _client
    if _client is None:
        CHROMA_DIR.mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    # Cosine space so `min_score` matches the 0..1 similarity the UI expects.
    return _client.get_or_create_collection(
        COLLECTION, metadata={"hnsw:space": "cosine"}
    )


def chunk_markdown(text: str) -> list[str]:
    """Split on `##` headings first, then window long sections with overlap."""
    sections = re.split(r"(?=^##\s)", text, flags=re.MULTILINE)
    chunks: list[str] = []
    for section in sections:
        s = section.strip()
        if not s:
            continue
        if len(s) <= _MAX_CHARS:
            chunks.append(s)
            continue
        start = 0
        while start < len(s):
            chunks.append(s[start : start + _MAX_CHARS])
            start += _MAX_CHARS - _OVERLAP
    return chunks


def file_hash(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


async def upsert_file(path: str, text: str) -> int:
    """Embed and upsert every chunk of one vault file. Returns chunk count."""
    coll = _collection()
    delete_file(path)  # replace any prior chunks for this path
    chunks = chunk_markdown(text)
    ids, docs, embs, metas = [], [], [], []
    for i, chunk in enumerate(chunks):
        ids.append(f"{path}#{i}")
        docs.append(chunk)
        embs.append(await embedder.embed(chunk))
        metas.append({"path": path, "chunk_index": i})
    if ids:
        coll.upsert(ids=ids, documents=docs, embeddings=embs, metadatas=metas)
    return len(ids)


def delete_file(path: str) -> None:
    _collection().delete(where={"path": path})


async def query(text: str, top_k: int, min_score: float) -> list[dict]:
    """Return up to top_k chunks scoring >= min_score (cosine similarity)."""
    coll = _collection()
    if coll.count() == 0:
        return []
    qv = await embedder.embed(text)
    res = coll.query(query_embeddings=[qv], n_results=top_k)
    docs = (res.get("documents") or [[]])[0]
    metas = (res.get("metadatas") or [[]])[0]
    dists = (res.get("distances") or [[]])[0]
    hits = []
    for doc, meta, dist in zip(docs, metas, dists):
        # Cosine space: distance = 1 - cosine_similarity.
        score = 1.0 - dist
        if score >= min_score:
            hits.append({"path": meta.get("path"), "text": doc, "score": round(score, 4)})
    return hits


def available() -> bool:
    try:
        _collection()
        return True
    except Exception:
        return False
