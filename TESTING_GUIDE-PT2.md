# 🧪 Fetch Practical Capability Labs (Part 2)

> **Focus:** Real-world scenarios to verify Fetch's intelligence and tool usage.
> **Prerequisite:** Ensure `fetch-bridge` and `fetch-kennel` are running and you have bonded via WhatsApp.

This guide provides a series of "Labs"—hands-on tasks to request from Fetch. These scenarios test the limits of its reasoning, tool use, and multi-step planning.

---

## 🔬 Lab 1: The "Hello World" of Agentic Coding
**Goal:** Verify basic file creation and execution in the sandbox.

**Prompt:**
> "Create a python script called `fib.py` that prints the first 10 Fibonacci numbers. Then run it and show me the output."

**Success Criteria:**
1.  **Tool Use:** `run_terminal` (to creating file via echo/cat) or `create_file` (if available via toolset abstraction), then `run_terminal` to execute `python3 fib.py`.
2.  **Output:** The agent should reply with the actual output from the terminal (e.g., `0 1 1 2 3 5 8 ...`).
3.  **Persistence:** You can verify the file exists: `docker exec fetch-kennel cat /workspace/fib.py`.

---

## 🔬 Lab 2: The Debugger
**Goal:** Verify analysis and editing capabilities.

**Step 1: Plant a Bug**
> "Create a file called `buggy.js` with this content:
> ```javascript
> function add(a, b) {
>   return a * b; // Oops, this should be addition
> }
> console.log(add(2, 3));
> ```"

**Step 2: The Request**
> "Run `buggy.js`. It looks like there's a bug in the math. Fix it so it adds instead of multiplies, then run it again."

**Success Criteria:**
1.  **Analysis:** Agent notices `*` vs `+`.
2.  **Tool Use:** `run_terminal` (sed or overwrite) to fix the code.
3.  **Verification:** Agent runs the code again and shows `5`.

---

## 🔬 Lab 3: The Architect (Multi-File Scaffold)
**Goal:** Verify context awareness and multi-file management.

**Prompt:**
> "Scaffold a simple Express.js API in a folder called `my-api`. I need:
> 1. A `package.json` with express.
> 2. An `index.js` with a GET /health route.
> 3. A `README.md` explaining how to run it.
> Don't run it yet, just create the files."

**Success Criteria:**
1.  **Planning:** Agent explicitly mentions creating the folder.
2.  **Tool Use:** Series of `run_terminal` calls (mkdir, echoing content).
3.  **Accuracy:** Files are created in the correct subdirectory (`my-api/`).

---

## 🔬 Lab 4: The Project Manager (Git & Sync)
**Goal:** Verify the `workspace_sync` tool and GitHub integration.

**Prerequisite:** `GH_TOKEN` must be valid in `.env`.

**Prompt:**
> "Initialize a git repo in `my-api`, commit the files, and sync it to a new private GitHub repository."

**Success Criteria:**
1.  **Tool Use:** `workspace_sync` (or manual `git init` sequence). Ideally, it uses the high-level `workspace_sync` tool.
2.  **Output:** A link to the new GitHub repository.
3.  **Verification:** Click the link and verify the files are there.

---

## 🔬 Lab 5: The Researcher (Documentation Analysis)
**Goal:** Verify reading and synthesizing large text.

**Step 1: Seed Data**
> "Create a file `specs.md` with: 'The project usage requires the user to hop three times before deploying.'"

**Step 2: The Query**
> "Read `specs.md` and tell me the deployment requirements."

**Success Criteria:**
1.  **Tool Use:** `read_file` (targeting `specs.md`).
2.  **Synthesis:** Agent humorously (or seriously) reports the "hop three times" requirement.

---

## 🔬 Lab 6: Vision Test (Optional)
**Goal:** Verify image understanding.

**Action:**
1.  Send a photo of a coffee mug (or any object) to Fetch via WhatsApp.
2.  **Caption:** "What is in this image?"

**Success Criteria:**
1.  **Routing:** Agent receives the image message.
2.  **Vision Model:** The specialized Vision LLM analyzes the image.
3.  **Output:** "I see a coffee mug on a table..."

---

## 🔬 Lab 7: Voice Interface (Optional)
**Goal:** Verify Whisper.cpp transcription.

**Action:**
1.  Record a voice note on WhatsApp: "Fetch, what is the status of the kennel container?"
2.  Send it.

**Success Criteria:**
1.  **Transcription:** Logs show `[Transcription] "Fetch, what is the status..."`.
2.  **Response:** Agent answers the question as if it were text.

---

## 🧪 Advanced Challenge: "The Self-Correction"

**Prompt:**
> "Write a bash script `loop.sh` that prints numbers 1 to 5. However, accidentally make it an infinite loop (e.g., `while true`). Run it with a timeout of 2 seconds, catch the timeout, and then correct the script to only loop 5 times."

**Why this is hard:**
- Requires anticipating the timeout command (`timeout 2s ./loop.sh`).
- Requires analyzing why it failed (if not explicitly told).
- Requires editing the file based on the runtime failure.

**Success Criteria:**
- Agent demonstrates ability to recover from a "hanging" process or creates the safeguard (timeout) proactively.

