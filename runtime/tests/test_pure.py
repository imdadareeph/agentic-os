"""Hermetic unit tests for the pure memory logic (no DB/Chroma/Ollama needed)."""

from memory import context_builder, orchestrator, semantic


# --- semantic.chunk_markdown -------------------------------------------------

def test_chunk_splits_on_headings():
    text = "# Title\n\nintro\n\n## A\nalpha\n\n## B\nbeta"
    chunks = semantic.chunk_markdown(text)
    # Intro block + two ## sections.
    assert len(chunks) == 3
    assert any(c.startswith("## A") for c in chunks)
    assert any(c.startswith("## B") for c in chunks)


def test_chunk_windows_long_sections():
    long_section = "## Big\n" + ("x" * 5000)
    chunks = semantic.chunk_markdown(long_section)
    assert len(chunks) >= 3  # 5000+ chars / 2000 window with overlap
    assert all(len(c) <= 2000 for c in chunks)


def test_chunk_skips_empty():
    assert semantic.chunk_markdown("\n\n   \n") == []


def test_file_hash_stable_and_sensitive():
    assert semantic.file_hash("abc") == semantic.file_hash("abc")
    assert semantic.file_hash("abc") != semantic.file_hash("abd")
    assert semantic.file_hash("abc").startswith("sha256:")


# --- orchestrator.should_retrieve (intent gate) ------------------------------

def test_gate_allows_questions():
    assert orchestrator.should_retrieve("how do I set up docker")
    assert orchestrator.should_retrieve("what did we decide last time")
    assert orchestrator.should_retrieve("explain the whisper config")


def test_gate_skips_greetings_and_commands():
    for msg in ["hey", "hello jarvis", "thanks", "stop", "ok", ""]:
        assert not orchestrator.should_retrieve(msg)


# --- context_builder ---------------------------------------------------------

def test_context_block_empty():
    assert context_builder.build_context_block([]) == ""


def test_context_block_renders_hits():
    block = context_builder.build_context_block(
        [{"path": "learnings/x.md", "text": "docker on 9000", "score": 0.82}]
    )
    assert "Retrieved Memory" in block
    assert "learnings/x.md" in block
    assert "docker on 9000" in block
    assert "0.82" in block


def test_context_block_caps_memory_count():
    hits = [
        {"path": "a.md", "text": "aaa", "score": 0.9},
        {"path": "b.md", "text": "bbb", "score": 0.8},
        {"path": "c.md", "text": "ccc", "score": 0.7},
    ]
    block = context_builder.build_context_block(hits, max_memories=1)
    # Only the highest-scoring hit survives the count cap.
    assert "a.md" in block
    assert "b.md" not in block and "c.md" not in block


def test_context_block_caps_token_budget():
    big = "x" * 4000
    hits = [
        {"path": "a.md", "text": big, "score": 0.9},
        {"path": "b.md", "text": big, "score": 0.8},
    ]
    # ~10 tokens -> ~40 chars: only the first (highest-score) entry fits.
    block = context_builder.build_context_block(hits, max_tokens=10)
    assert "a.md" in block
    assert "b.md" not in block
