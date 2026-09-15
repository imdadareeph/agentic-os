# CONVERSATION_AGENTS.md

> **Project:** Agentic OS — J.A.R.V.I.S.
>
> Version: 1.0
> Status: Draft

---

# Overview

J.A.R.V.I.S. is **not a single AI model**.

It is a runtime composed of specialized agents that collaborate to understand the user, retrieve knowledge, execute tools, update memory, and continuously improve the system.

Each agent has one responsibility.

The Runtime coordinates all agents.

The LLM never orchestrates itself.

---

# Design Philosophy

Instead of

```
User

↓

LLM

↓

Response
```

J.A.R.V.I.S. operates like

```
User

↓

Runtime

↓

Planner

↓

Specialized Agents

↓

Memory

↓

Tools

↓

LLM

↓

Response
```

Every agent is replaceable.

Every agent is independently testable.

Every agent owns one responsibility.

---

# Agent Architecture

```
                    Runtime Coordinator
                           │
     ┌─────────────────────┼──────────────────────┐
     │                     │                      │
 Voice Agents         Planning Agents      Memory Agents
     │                     │                      │
     ├─────────────────────┼──────────────────────┤
     │                     │                      │
 Knowledge Agents     Tool Agents         Runtime Agents
     │                     │                      │
     └─────────────────────┼──────────────────────┘
                           │
                    Ollama / LLM
```

---

# Runtime Coordinator

## Responsibility

The Runtime Coordinator controls the entire conversation lifecycle.

It never performs reasoning.

Responsibilities

- lifecycle management
- scheduling
- state transitions
- event routing
- orchestration
- cancellation
- interruption
- retries

Example

```
User speaks

↓

Planner

↓

Memory

↓

LLM

↓

Voice

↓

Background Workers
```

---

# Voice Agents

---

## Voice Activity Agent

Detects

- speech start
- speech stop
- silence
- interruption

Input

Microphone

Output

```
VOICE_STARTED

VOICE_STOPPED

USER_INTERRUPTED
```

---

## Speech Recognition Agent

Responsibilities

- Whisper
- streaming transcription
- confidence
- language detection

Output

Transcript

---

## Conversation Mode Agent

Determines

- Push-to-Talk
- Continuous Conversation
- Wake Word
- Listening State

---

## Voice Output Agent

Responsibilities

- Browser TTS
- Voicebox
- ElevenLabs (future)

Controls

- pause
- resume
- stop
- interruption

---

## Voice Interrupt Agent

Responsibilities

Immediately stop TTS when

```
Speech Detected

↓

Interrupt

↓

Cancel TTS

↓

Restart STT

↓

Continue Conversation
```

---

# Planning Agents

---

## Intent Agent

Determines

What the user wants.

Examples

- Ask Question
- Generate Code
- Search
- Modify Project
- Explain
- Execute Tool

Output

Intent

Confidence

---

## Planner Agent

Builds execution plan.

Example

```
Question

↓

Need Memory?

↓

Need Search?

↓

Need Tool?

↓

Need Code?

↓

Need LLM?
```

Planner decides.

LLM does not.

---

## Context Planning Agent

Determines

What information should be retrieved.

Sources

- Session
- Project
- Memory
- Documentation
- RAG

Output

Retrieval Plan

---

## Execution Planner

Creates task graph.

Example

```
Need

Memory

↓

GitHub

↓

Terminal

↓

LLM

↓

Voice
```

---

# Memory Agents

---

## Memory Coordinator

Central memory orchestrator.

Responsibilities

- routing
- scheduling
- indexing
- background jobs

---

## Session Agent

Maintains

Current conversation.

Stores

- transcript
- active tasks
- temporary context

Destroyed after session.

---

## Episode Agent

Creates

Session summaries.

Generates

- Episode
- Timeline
- Report

---

## Fact Agent

Extracts

Stable facts.

Example

```
Uses Rust

↓

Semantic Memory
```

---

## Decision Agent

Extracts

Architecture decisions.

Example

```
Use SQLite

Reason

Performance
```

---

## Task Agent

Extracts

- TODOs
- Follow-ups
- Work items

---

## Preference Agent

Extracts

User preferences.

Examples

Preferred

- voice
- language
- frameworks
- writing style

---

## Relationship Agent

Builds links.

Example

```
Memory Engine

↓

SQLite

↓

Markdown

↓

Project

↓

Episode
```

---

## Reflection Agent

Runs

Daily

Weekly

Monthly

Improves memory.

---

## Compression Agent

Merges

Duplicate memories.

Improves summaries.

---

## Confidence Agent

Updates

Confidence

Importance

Frequency

Access Count

---

## Memory Cleanup Agent

Archives

Deletes

Compresses

Expired memories.

---

# Knowledge Agents

---

## RAG Retrieval Agent

Retrieves

Relevant documents.

Uses

- embeddings
- hybrid search
- ranking

---

## Markdown Agent

Reads

Markdown Vault.

Updates

Markdown knowledge.

---

## Documentation Agent

Automatically updates

README

Architecture

Reports

Knowledge Base

---

## Search Agent

Searches

- Markdown
- SQLite
- Files
- Project

---

## Timeline Agent

Creates

Project timeline.

Session history.

Daily history.

---

# Tool Agents

---

## Tool Router

Determines

Which tool should execute.

Examples

Filesystem

Terminal

GitHub

Docker

Browser

---

## Terminal Agent

Executes

Commands

Safely.

Requires approval.

---

## Filesystem Agent

Reads

Creates

Moves

Deletes

Files

Requires approval.

---

## Git Agent

Handles

- commits
- branches
- history
- diffs

---

## Docker Agent

Controls

Containers

Images

Volumes

Compose

---

## Browser Agent

Can

Search

Navigate

Extract

Summarize

---

## MCP Agent

Discovers

External tools.

Routes

Requests.

---

# Runtime Agents

---

## Event Agent

Maintains

Internal Event Bus.

Publishes

Runtime events.

---

## Queue Agent

Schedules

Background jobs.

Supports

- retry
- priority
- cancellation

---

## Health Agent

Monitors

- CPU
- GPU
- RAM
- Services
- Docker
- Ollama
- Whisper

---

## Status Agent

Maintains

Runtime State

Examples

Ready

Busy

Listening

Thinking

Speaking

Idle

Reflecting

---

## Notification Agent

Displays

Errors

Warnings

Task completion

Progress

---

## Metrics Agent

Collects

Latency

Token Speed

Memory Usage

Embedding Time

Queue Length

---

# Background Agents

These agents never block conversations.

---

## Embedding Agent

Creates embeddings.

Only processes

Dirty documents.

---

## Knowledge Consolidation Agent

Improves

Knowledge Base.

Merges

Related documents.

---

## Report Agent

Creates

Daily Report

Weekly Report

Monthly Report

---

## Indexing Agent

Indexes

Markdown

PDFs

Generated code

Research

---

## Dirty Processing Agent

Processes only changed resources.

```
Document Modified

↓

dirty = true

↓

Queue

↓

Idle

↓

Process

↓

dirty = false
```

---

# Security Agents

---

## Permission Agent

Determines

Whether user approval is required.

Examples

Delete File

Terminal

Git Push

Docker Stop

Always requires confirmation.

---

## Sandbox Agent

Runs

Potentially dangerous operations

inside isolated environments.

---

# Conversation Flow

```
User Speaks

↓

Voice Activity Agent

↓

Speech Recognition Agent

↓

Intent Agent

↓

Planner Agent

↓

Context Planning Agent

↓

Memory Coordinator

↓

Retrieval Agent

↓

Tool Router

↓

LLM

↓

Voice Output Agent

↓

User Hears Response

↓

Background Queue

↓

Memory Agents

↓

Reflection

↓

Knowledge Updated
```

---

# Background Flow

```
Conversation Ends

↓

Episode Agent

↓

Fact Agent

↓

Decision Agent

↓

Task Agent

↓

Relationship Agent

↓

Markdown Agent

↓

Embedding Agent

↓

Reflection Agent

↓

Knowledge Consolidation

↓

Daily Report

↓

Memory Updated
```

---

# Agent Communication

Agents communicate only through the Runtime Event Bus.

```
VOICE_STARTED

INTENT_DETECTED

PLAN_CREATED

MEMORY_RETRIEVED

TOOL_EXECUTED

LLM_STARTED

TOKEN_STREAM

LLM_COMPLETED

VOICE_STARTED

VOICE_INTERRUPTED

SESSION_COMPLETED

EPISODE_CREATED

EMBEDDING_COMPLETED

REFLECTION_COMPLETED
```

Agents never call each other directly.

---

# Agent Priorities

| Priority | Agents |
|-----------|--------|
| Critical | Voice Activity, Speech Recognition, Runtime Coordinator |
| High | Intent, Planner, Memory Coordinator, Retrieval |
| Medium | Tool Router, Documentation, Search |
| Low | Reflection, Reports, Embeddings, Compression |
| Idle Only | Consolidation, Cleanup, Weekly Reports |

---

# Agent Execution Rules

## DO

- Keep each agent responsible for one capability.
- Make agents stateless where possible.
- Communicate through events.
- Support retries and cancellation.
- Run expensive agents in the background.
- Allow independent testing.
- Log every agent execution.
- Make every agent replaceable.

---

## DON'T

- Do not create a "God Agent" that performs every task.
- Do not let agents call each other directly.
- Do not let the LLM orchestrate the runtime.
- Do not block conversations with background work.
- Do not mix memory logic with planning logic.
- Do not duplicate responsibilities across agents.
- Do not allow destructive tool execution without approval.

---

# Long-Term Vision

Over time, J.A.R.V.I.S. should evolve into a distributed cognitive runtime where specialized agents collaborate through a shared event bus and memory system.

The Runtime acts as the operating system.

The agents act as system services.

The LLM acts as a reasoning engine.

Together, they create an AI Operating System capable of conversation, planning, learning, automation, and autonomous execution while remaining modular, observable, and completely local.