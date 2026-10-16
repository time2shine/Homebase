# Homebase AI-Assisted Engineering Workflow

This document establishes the operational workflow, roles, task sizing, execution rules, and review protocols for collaboration between the User, ChatGPT, and Antigravity in the Homebase repository.

---

## 1. Roles & Collaboration Model

Collaboration in this repository operates across three defined roles:

- **The User**:
  - Sets project goals, decides priorities, and directs scope.
  - Holds exclusive authority to authorize `git commit` and `git push` operations.
- **ChatGPT**:
  - Serves as architectural advisor, requirements copilot, and reviewer.
  - Scopes tasks, evaluates supplied empirical evidence, resolves ambiguities, and drafts copy-ready, unambiguous prompts for Antigravity.
- **Antigravity**:
  - Serves as the repository-bound execution engine.
  - Inspects the active workspace, implements the scoped changes, executes proportional verification, and produces a structured review package.
- **Collaboration Dynamics**:
  - **Honesty over confirmation**: Reports must strictly distinguish observed facts (terminal output, DOM telemetry, diffs) from assumptions or expectations.
  - **Constructive feedback**: Provide direct corrections and suggest superior alternatives whenever a proposed direction is inefficient, risky, or contradictory to repository invariants.

---

## 2. Tiered Task Sizing

Workflows are proportional to the risk and scope of each task. Do not apply heavy lifecycle documentation or excessive toolchains to trivial changes.

### Tier A: Small Visual Fix
- **Examples**: CSS adjustments, spacing/padding alignment, typography, color tweaks, minor layout shifts.
- **Workflow**:
  ```text
  Relevant Inspection → Minimal Patch → Focused Visual Verification → Diff Review → Authorized Commit
  ```
- **Rules**:
  - No separate audit or plan markdown documents by default.
  - No new automated tests by default; add one only when it addresses a concrete regression risk.
  - Keep patches minimal and surgical; avoid arbitrary transforms (e.g., negative `translateY`) that hide root causes.

### Tier B: Feature or Behaviour Change
- **Examples**: New settings toggles, interaction logic, context menu actions, widget UI enhancements.
- **Workflow**:
  ```text
  Brief Acceptance Criteria → Dependency Inspection → Implementation → Focused Verification → Review Package → Authorized Commit
  ```
- **Rules**:
  - Establish clear, observable acceptance criteria before editing code.
  - Inspect dependencies, controller ownership, and existing settings mirrors.
  - Run focused automated unit tests and manual verification steps directly relevant to the modified feature.

### Tier C: High-Risk Changes
- **Examples**: Storage schema modifications, data migrations, WebExtension manifest alterations, core startup pipeline (`src/preload.js`, `src/instant_load.js`), major controller architectural decoupling.
- **Workflow**:
  ```text
  Written Audit & Plan (docs/) → User Approval → Small Implementation Steps → Regression & Failure/Recovery Verification → Comprehensive Review → Authorized Commit
  ```
- **Rules**:
  - Requires dedicated planning documents and formal authorization before implementation starts.
  - Must include regression validation and error-recovery checks (e.g., corrupted storage fallbacks).

---

## 3. Execution Rules

1. **Define Observable Acceptance Criteria First**:
   - Know precisely what success looks like in DOM state, behavior, or visual layout before touching files.
2. **One Coherent Change at a Time**:
   - Keep pull requests and working tree modifications focused on a single logical objective.
3. **Preserve Unrelated Work**:
   - Never restore whole files or discard unowned modifications merely to simplify a patch or clean the working tree.
4. **No Speculative Refactoring**:
   - Do not refactor files solely to reduce line length or advance cycle numbers. Identify a concrete problem and demonstrable benefit before restructuring.
5. **Stop When Satisfied**:
   - Cease tool executions as soon as acceptance criteria and required verification checks are fulfilled. Do not keep running redundant commands.
6. **No Repetitive Passing Checks**:
   - Do not re-run passing tests or static checkers unless a subsequent code change has occurred that could affect their outcome.
7. **Fail Fast on Stalled Commands**:
   - If a command, server, or subagent stalls or hangs, terminate it immediately and report the blocker rather than polling indefinitely.
8. **Independent Action Boundaries**:
   - Testing, building, committing, pushing, and publishing releases are separate actions. Follow the scope explicitly requested by the user.
   - Within an authorized task, proportional automated checks (syntax checks, static checks, unit tests, and local builds) do not require separate permission requests for each execution. However, `git commit` and `git push` strictly require explicit user authorization.

---

## 4. Verification Standards

1. **Proportionality**:
   - Match verification tools to the risk profile of the change. Run `node --check` separately for each modified JavaScript file, `node scripts/check-newtab-static.mjs` for script-tag/declaration changes, and targeted unit tests for controller modifications.
2. **Accurate Status Reporting**:
   - Report test outcomes accurately using `PASS`, `FAIL`, `SKIP`, or `NOT RUN`. Never misrepresent test coverage or omit failures.
3. **Recognize Verification Limits**:
   - A successful build does not prove runtime compatibility or UI correctness.
   - Mocked unit tests do not prove extensions work in real Chromium or Gecko rendering engines.
4. **Actionable Manual Verification**:
   - For manual steps, clearly detail:
     - Why manual testing is necessary.
     - When to execute it.
     - Exact step-by-step instructions.
     - Expected observable behavior.
5. **Acknowledge Gaps & Avoid Unverified Claims**:
   - If visual styling was not inspected in a running browser, state this explicitly.
   - If telemetry or empirical measurement evidence cannot be directly verified in the active session, mark those claims unverified.
   - Avoid unsubstantiated claims such as "zero risk" or "fully verified".
6. **Protected Files Guard**:
   - Protected source files (`src/preload.js`, `src/instant_load.js`) require explicit authorization to modify; authorization is not limited to release tasks.
   - Manifest version changes follow the release workflow.
   - Existing build scripts may regenerate `dist/` during authorized development and verification tasks. Never manually edit or stage generated `dist/` files.

---

## 5. Review Handoff Protocol

Every Antigravity task that modifies repository state—or stops due to a blocker or partial completion—must conclude with a structured **ChatGPT Review Package**.

### Format

```markdown
# ChatGPT Review Package

## Task Completed & Acceptance Criteria
- Objective: [1-2 sentence summary of task]
- Status: [COMPLETE / PARTIAL / BLOCKED]
- Criteria Met: [List of satisfied criteria]
- Criteria Pending / Blocked: [List of unfulfilled criteria or blockers, if any]

## Files Changed
- File: [path]
  - Change: [What was changed]
  - Purpose: [Why it was changed]

## Diff Summary
[Paste actual diff if short (< 50 lines), or provide git diff command to view]

## Verification
- Syntax Checks (`node --check`): [PASS / FAIL / SKIP / NOT RUN]
- Static Invariant Checks: [PASS / FAIL / SKIP / NOT RUN]
- Unit Tests: [PASS (X/Y) / FAIL / SKIP / NOT RUN]
- Build (`npm.cmd run build`): [PASS / FAIL / SKIP / NOT RUN]
- Visual / Manual Checks: [Observed results or EXPLICITLY UNVERIFIED]

## Unverified Behaviour & Known Risks
- Unverified: [What was not directly tested]
- Risks: [Potential edge cases or browser quirks]

## Git Status
- Branch: [branch]
- Latest Commit: [short hash and message]
- Pending Working Tree Changes: [List of modified and untracked files]
- Commit / Push: [None — awaiting authorization]

## Next Recommended Action
[What ChatGPT or the User should review, approve, or do next]
```

---

## 6. Continuity & Repository Truth

1. **Code is Ground Truth**:
   - The active code in the workspace and verified git status override stale notes, outdated plans, or past assumptions.
2. **Context Efficiency**:
   - Keep active context documents concise. Archive completed cycle details rather than forcing continuous re-reading.
3. **Targeted Reading**:
   - Future sessions do not need to read all historical documents. Follow the defined reading order in [AGENTS.md](../AGENTS.md) and inspect only what is relevant to the active task.
4. **Mandatory Current Handoff Updates**:
   - At the conclusion of any task or meaningful change of direction, update the "Current Handoff" section in [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) to reflect the fresh state, replacing stale notes. Never leave historical or conflicting handoff statements in place.
