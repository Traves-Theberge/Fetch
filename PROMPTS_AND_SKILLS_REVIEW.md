# 🧠 Fetch Prompts & Skills Detail Review

This document reviews the "Brain" of Fetch v4.0.0, focusing on how it manages identity, context framing, and specialized domain knowledge through its skills system.

---

## 🎭 Persona & Identity (`data/identity/`)

Fetch uses a structured "Collar" framework to define its personality and operational limits.

### The COLLAR.md (Core Directives)

- **Concept:** Uses a "Loyal Dog" metaphor to reinforce safety and reliability.
- **Directives:** "Orchestrate, don't implement" is the most important rule — it prevents the bridge LLM from trying to write code itself when it should be using a harness.
- **Personality:** Eager, concise, and quirky (e.g., hating lobsters). This consistency reduces "LLM drift" and makes the UX more engaging.

### The PACK (Agent Routing)

- **Multi-Model Intelligence:** Fetch doesn't rely on one model. It intelligently routes tasks:
  - **Claude 🦉:** The "Sage" for complex architectural work.
  - **Gemini ⚡:** The "Scout" for quick researcher and explanations.
  - **Copilot 🎯:** The "Retriever" for GitHub and Shell-specific patterns.

---

## 🏗️ Prompt Engineering (`fetch-app/src/agent/`)

Fetch employs a two-tier prompting strategy that is highly effective for headless orchestration.

### 1. Task Framing (`prompts.ts`)

- **Isolation Strategy:** Since child agents (Claude Code, etc.) don't have access to the WhatsApp history, Fetch "frames" the goal.
- **Transformation:** It takes "fix login" and turns it into a self-contained 4-sentence goal with file paths and definition of done. This is the "Secret Sauce" of Fetch's reliability.

### 2. Context Building

- **Dynamic Context:** The system prompt isn't static. It injects:
  - **Active Workspace Status:** (Branch, dirty status, path).
  - **Repository Map:** A high-level tree structure of the project.
  - **Sliding History + Compaction:** Keeps the LLM aware of the conversation without hitting token limits.

---

## 🛠️ The Skills System (`fetch-app/src/skills/`)

Fetch's skills system is designed for **Context Efficiency**.

### Discovery → Activation Pattern

1. **Discovery:** Every message includes an XML list of *available* skills (Name, ID, Description).
2. **Activation:** Only when a message matches a skill's triggers does the system inject the *full instruction set* from the skill's `SKILL.md`.
3. **Benefit:** This prevents "System Prompt Bloat" while allowing Fetch to have expert-level knowledge in Git, Docker, React, and Testing.

### Built-in Pack

- **Meta-Fetch:** Allows Fetch to modify its own identity and tools.
- **Git/Docker:** Deep domain knowledge for infrastructure tasks.
- **React/TS:** Best practices for web development.

---

## ⚖️ Technical Verdict

The prompt and skill architecture is **Advanced and Efficient**.

### Strengths

- **Token Economy:** The activation pattern for skills is a masterclass in RAG-lite context management.
- **Goal Framing:** Solves the "stateless child agent" problem elegantly.
- **Safety Metaphor:** The dog/collar metaphor is more than just fun; it provides a consistent moral framework for the AI.

### Suggested Improvements

- **Skill Parameterization:** Currently, skills are pure instructions. Adding a `tools` field to skills could allow them to register specialized temporary tools.
- **Persona Modes:** Allow the user to tighten the "Collar" (Autonomy Level) through the WhatsApp interface more dynamically.

---
🐕 *Fetch: Good boy. Smart brain. Sharp skills.*
