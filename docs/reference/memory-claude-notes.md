"How to add more memories" — you don't add them directly; JARVIS writes them automatically during conversation, gated by the
    memory layer toggles in Memory Settings:
    - Conversation memory (SQLite turns table) — every user/assistant turn, if Memory + Session Memory are on and not Incognito.
    - Semantic memory (Chroma) — only kicks in when semanticMemoryEnabled is on; it embeds chunks from the vault, it doesn't store
    new facts on its own.
    - Episodic memory (Obsidian vault notes under agents/{agent_id}/) — only written when episodicMemoryEnabled + allowAgentWrites
    are on, and only for exchanges that look "researchy" (looksResearchy() — questions with how/why/what/setup/decide/etc.). Casual
    chat won't produce a vault note.

    So if you want more vault notes to accumulate, both those Memory Settings toggles need to be on, and the conversation needs to
    actually contain research-flavored questions.

    "Why isn't it showing memories from Obsidian" — most likely explanation given everything traced so far in this session:
    semantic retrieval only fires when mem.semanticMemoryEnabled is true (it defaults to off). If that toggle is off, JARVIS never
    queries Chroma/the vault for context, so nothing from Obsidian ever surfaces in a reply, even if notes exist on disk. Check
    Memory Settings → make sure Semantic memory is enabled, and also confirm the "Vault" and "Chroma" health pills there are green
    — if the vault path or Chroma index isn't in a good state, retrieval silently degrades to empty rather than erroring, which
    looks identical to "nothing there" from the outside.
