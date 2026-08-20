---
name: call-stack-explainer
description: Trace and explain an application workflow as a nested, file-and-symbol call stack. Use when the user asks what gets called, requests a call stack or execution flow, or wants a start-to-finish trace across routes, services, repositories, databases, queues, or external providers. Produces text by default; do not create visuals unless explicitly requested.
argument-hint: "Entry point or workflow to trace"
---

# Call Stack Explainer

Trace a workflow through the actual code and present it as a readable nested call stack with short explanations.

## Default Output Is Text

Do not load a visual-explainer skill, generate HTML, create Mermaid diagrams, open a browser, or invoke any other visual creation workflow unless the user explicitly asks for a visual, diagram, HTML page, or slide deck.

A request for a “call stack,” “execution flow,” “what gets called,” or “start-to-finish process” is not by itself a request for a visual artifact.

## Workflow

### 1. Establish the requested boundary

Identify:

- The starting event, such as a chat message, HTTP request, job, CLI command, or UI action.
- The expected finish, such as a response, database write, queued job, provider acceptance, or physical delivery.
- The repositories or services involved.

If the user asks for a broad end-to-end flow, trace from the user-visible entry point through every meaningful service boundary.

### 2. Trace the actual implementation

Use code search and file reads to verify the path. Start at the real entry point and follow direct calls, registrations, dependency injection, transports, HTTP clients, queues, and provider clients.

For each step, confirm:

- Repository and file path.
- Function, method, handler, callback, or route name.
- The next function or external boundary it invokes.
- Important data passed across the boundary.

Prefer source code over plans or memory. Use plans only to describe intended or unfinished flow.

### 3. Separate reality from intent

Before presenting a claimed end-to-end path, verify that every bridge exists.

If part of the flow is missing:

1. State the gap prominently.
2. Show the current implemented call stack until it stops.
3. Show the intended or planned continuation in a separate section.
4. Label planned functions and files as not implemented.

Never splice planned calls into the actual stack without marking them.

### 4. Compress low-value plumbing

Include middleware, framework dispatch, generated clients, and serialization only when they affect authorization, ownership, correlation, state, privacy, or behavior.

Do not expand every utility call. Nest helper calls beneath the function that owns the meaningful operation.

Expand branches that materially change the outcome, such as:

- Authorization denied.
- Idempotent replay.
- Validation or preview drift.
- Transaction failure.
- Provider rejection.
- Ambiguous timeout or reconciliation.
- Asynchronous delivery after provider acceptance.

### 5. Identify the true finish line

Distinguish between milestones such as:

- Request accepted.
- Local records committed.
- Provider job accepted.
- Job scheduled.
- Message delivered to a device.
- Delivery result imported later.

Do not describe provider acceptance as physical delivery.

## Required Response Structure

Use the following sections when they apply.

### Reality check

Open with one or two sentences stating whether the full requested path currently exists. Mention any missing bridge or asynchronous boundary.

### Primary call stack

Use nested Markdown bullets. Every executable step should follow this shape:

```text
- User or system event
  - `repository/path/to/file.ts:functionName()`
    - Short explanation of what this function validates, constructs, or calls.
    - `other-repository/path/to/file.ts:nextFunction()`
      - Short explanation of the boundary and important data passed.
```

Formatting rules:

- Use repository-relative paths when multiple repositories are involved.
- Format references as `` `repo/path/file.ts:symbol()` ``.
- Put the call or symbol first, followed by concise explanatory text.
- Use indentation to show direct ownership and nesting.
- Use arrows inside a reference only for compact same-file chains, for example `` `app.ts:createApp() → chatRoutes()` ``.
- Keep each explanation to one or two sentences.
- Do not dump full source code.

### Important branches

After the main success path, briefly show behavior-changing alternatives as nested bullets. Do not interleave every error branch into the main path.

### Finish semantics

Explain what the final successful state guarantees and what still happens asynchronously.

### Key files

Optionally finish with a compact bullet list of the most important files and their responsibilities. Do not render a large table unless the user asks for one.

## Example Style

```markdown
### Reality check

The API submission path exists, but the model-facing tool is not registered yet. Chat currently stops after preview confirmation.

### Current call stack

- User sends a chat message
  - `service-a/src/routes/chat.ts:chatRoutes()`
    - Authenticates and validates the request.
    - `service-a/src/ai/run-chat.ts:runChat()`
      - Loads history and model tools.
      - `service-b/src/tools/notification.ts:createPreview()`
        - Calls the preview API with trusted conversation correlation.

### Intended continuation — not implemented

- User explicitly confirms the latest preview
  - `service-b/src/tools/notification.ts:submitCurrentNotification()` — **planned**
    - Recovers the trusted current preview and submits its revision.
```

## Accuracy Rules

- Verify exported names and route paths directly from source.
- Distinguish registration from invocation. Registering a route or tool does not mean the model or caller can reach it.
- Distinguish synchronous calls from subprocess, HTTP, queue, scheduled, and provider boundaries.
- Mention transaction boundaries where they protect ordering or idempotency.
- Mention authorization and correlation middleware at the boundary where they are enforced.
- Mention state transitions when they explain retries, concurrency, or recovery.
- If runtime dispatch makes the exact implementation uncertain, say so and identify the dispatch point.
- If code and documentation disagree, report the code path first and note the discrepancy.

## Privacy and Security

Redact credentials, tokens, phone numbers, cookies, private student or staff data, and provider payload contents. Describe secret flow by name and scope only, for example “district bearer token” or “district-specific provider credential.”

Do not include values from local environment files, request logs, database rows, or captured provider responses.

## Visual Output Exception

Only when the user explicitly requests a visual representation:

1. Complete the source trace first.
2. Then use an available visual-explainer or diagram workflow.
3. Preserve the same actual-versus-planned distinction in the visual.
4. Still include a concise nested text call stack in the response unless the user asks for visual-only output.
