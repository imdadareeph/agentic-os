# Memory Decision Flow

**Project:** J.A.R.V.I.S. – Agentic OS
**Version:** 1.0
**Status:** Draft

---

# Overview

The Memory Decision Flow defines how J.A.R.V.I.S. decides whether new information should be remembered, ignored, summarized, linked, or promoted into long-term knowledge.

The objective is **not to save everything**, but to build an intelligent, evolving memory system.

The Memory Engine acts as an autonomous cognitive layer between the runtime and the LLM.

---

# Design Principles

- Local First
- Memory should evolve
- Never block conversation
- Deterministic whenever possible
- LLM only when semantic understanding is required
- Every memory has a purpose
- Every memory has a lifecycle
- Memory continuously improves itself

---

# High Level Flow

```text
New Information

↓

Event Created

↓

Ingestion

↓

Normalization

↓

Classification

↓

Importance Evaluation

↓

Memory Decision

↓

Extraction

↓

Relationship Discovery

↓

Storage Selection

↓

Persist

↓

Background Evolution
```

---

# Stage 1 — New Information Arrives

Everything entering the runtime becomes an event.

Possible sources:

- Voice Conversation
- Text Input
- Documents
- Terminal
- File System
- Browser
- MCP Server
- Tool Execution
- Git Commit
- API Response
- Generated Code

Example

```text
User says:

Let's use Rust instead of Spring Boot.
```

Creates

```yaml
type: conversation
timestamp: 2026-07-05T09:22:18
source: voice
session: session-22
```

Nothing is stored yet.

---

# Stage 2 — Ingestion

Purpose:

Capture the raw information.

Responsibilities:

- capture input
- assign event id
- attach timestamp
- identify source
- identify project
- identify session

Output

```yaml
event_id: evt_00121

project: Agentic OS

session: session_17

timestamp: ...

source: voice
```

---

# Stage 3 — Normalization

Purpose:

Convert every input into a common format.

Examples

Voice

↓

Transcript

File

↓

Text

PDF

↓

Extracted Text

Terminal

↓

Structured Command

Browser

↓

HTML → Markdown

Everything becomes a standard document.

---

# Stage 4 — Rules Engine

The Rules Engine executes first.

No AI involved.

Responsibilities

- duplicate detection
- timestamp
- source detection
- project detection
- file lookup
- active workspace
- active session

Examples

File modified

↓

Update metadata

Conversation started

↓

Create session

Conversation ended

↓

Create episode

Fast

Deterministic

---

# Stage 5 — Classification

Determine the memory type.

Examples

Fact

Decision

Task

Episode

Preference

Research

Architecture

Bug

Meeting

Idea

Workflow

Project

Question

Temporary

The output is one or more classifications.

Example

```text
Let's move to Rust.
```

↓

Decision

Architecture

Project

---

# Stage 6 — Importance Evaluation

Every memory receives an importance score.

Range

0–10

Factors

- frequency
- project relevance
- user emphasis
- architecture impact
- future usefulness
- recency
- uniqueness

Example

```text
Hello
```

Importance

1

Example

```text
Switch backend to Rust
```

Importance

10

---

# Stage 7 — Memory Decision

The Memory Coordinator decides.

Possible outcomes

Ignore

↓

Session Only

↓

Short Term

↓

Long Term

↓

Knowledge Base

↓

Decision Record

↓

Project Documentation

↓

Task

↓

Relationship Update

Example

```text
What's the weather?
```

↓

Ignore

Example

```text
Create Memory Engine.
```

↓

Task

Episode

Project

---

# Stage 8 — Information Extraction

If semantic understanding is required,

specialized agents are invoked.

Agents

Fact Agent

Decision Agent

Task Agent

Entity Agent

Preference Agent

Summary Agent

Relationship Agent

The main LLM is not responsible.

Each agent has one responsibility.

Example

Conversation

↓

Decision Agent

↓

Output

```yaml
decision: Rust Backend

reason: Performance

confidence: 0.96
```

---

# Stage 9 — Relationship Discovery

Every memory is connected.

Example

```text
Memory Engine

↓

belongs to

↓

Agentic OS

↓

created during

↓

Episode 22

↓

related to

↓

SQLite

↓

related to

↓

Markdown
```

Relationships continuously evolve.

---

# Stage 10 — Storage Selection

Different memory types go to different locations.

## SQLite

Stores

- metadata
- indexes
- sessions
- timestamps
- scores
- relationships

---

## Markdown Vault

Stores

- episodes
- architecture
- research
- notes
- decisions
- documentation

Markdown is the primary source of truth.

---

## Local RAG

Stores

- embeddings
- document chunks

Used for semantic retrieval.

---

## File System

Stores

- images
- videos
- generated code
- PDFs
- exports
- attachments

SQLite only stores references.

---

# Stage 11 — Persist

Write everything.

Examples

SQLite

↓

Episode Metadata

Markdown

↓

Episode Summary

Vector Store

↓

Embedding

Filesystem

↓

Generated Files

Everything becomes linked.

---

# Stage 12 — Memory Evolution

Persistence is not the end.

Memory continues evolving.

Processes

Reflection

Compression

Relationship Updates

Importance Updates

Confidence Updates

Summaries

Knowledge Consolidation

Runs in the background.

Never blocks conversation.

---

# Background Memory Jobs

Executed asynchronously.

Examples

Episode Summary

Fact Extraction

Decision Extraction

Task Extraction

Embedding Generation

Knowledge Graph Update

Daily Report

Weekly Report

Monthly Reflection

Compression

Relationship Discovery

No user latency.

---

# Decision Matrix

| Event | Store? | Destination |
|----------|---------|-------------|
| Greeting | No | Ignore |
| Small Talk | Session | Session Memory |
| Architecture Decision | Yes | Decision + Project |
| Task Created | Yes | Task Memory |
| File Generated | Yes | Filesystem + SQLite |
| Research | Yes | Markdown + RAG |
| Preference | Yes | Semantic Memory |
| Bug Discussion | Yes | Episode + Project |
| Temporary Question | Session | Session Memory |

---

# Importance Levels

| Score | Meaning |
|----------|-----------|
| 0 | Ignore |
| 1–2 | Session Only |
| 3–4 | Short-Term Memory |
| 5–6 | Episode Memory |
| 7–8 | Long-Term Memory |
| 9–10 | Permanent Project Knowledge |

---

# Memory Lifecycle

```text
Observe

↓

Extract

↓

Classify

↓

Evaluate

↓

Store

↓

Connect

↓

Retrieve

↓

Update

↓

Compress

↓

Reflect

↓

Evolve
```

Memory never remains static.

---

# Fast Path

Runs during conversation.

Target

<100ms

Includes

- SQLite lookup
- session lookup
- project lookup
- recent episode lookup
- quick RAG retrieval

Never performs expensive reasoning.

---

# Slow Path

Runs asynchronously.

Includes

- summarization
- embeddings
- reflection
- relationship discovery
- graph updates
- memory compression
- daily reports
- weekly reports

Never blocks user interaction.

---

# Retrieval Flow

When the user asks a question

```text
User Question

↓

Intent Detection

↓

Memory Planner

↓

Determine Required Memories

↓

Retrieve

↓

Rank

↓

Compress Context

↓

LLM

↓

Response
```

The LLM never queries databases directly.

---

# Continuous Evolution

Memory improves itself over time.

Reflection

↓

Find duplicate memories

↓

Merge similar knowledge

↓

Increase confidence

↓

Strengthen relationships

↓

Archive stale memories

↓

Generate reports

↓

Improve retrieval quality

The system becomes smarter even while idle.

---

# End Goal

The Memory Engine should not behave like a database.

It should behave like an intelligent knowledge system that continuously learns, organizes, relates, summarizes, and evolves every interaction.

J.A.R.V.I.S. should remember **what matters**, forget **what does not**, strengthen **what is repeatedly useful**, and continuously improve its understanding of projects, workflows, decisions, and the user over time.