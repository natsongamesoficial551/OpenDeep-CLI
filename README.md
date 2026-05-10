# DeepCode

DeepCode is an open-source terminal AI CLI focused on provider-agnostic chat, safe local tools, visual terminal UX, sessions, projects, official OpenAI/Codex OAuth login, and extensible coding-agent workflows.

## Install

From npm after publish:

```bash
npm install -g opendeep
```

The package name stays `opendeep` for now, but the primary command is `deepcode`. The legacy `opendeep` command remains as a temporary alias.

Local development install:

```bash
npm install
npm run link:local
deepcode
```

## Start

```bash
deepcode
```

Run a one-shot prompt:

```bash
deepcode "Explain this project"
```

## Useful commands

```bash
deepcode providers
deepcode models
deepcode codex
deepcode auth openai
deepcode sessions
deepcode projects
deepcode doctor
```

## Provider login examples

DeepCode stores API keys and OAuth tokens through the OS keychain when available, with encrypted local fallback.

OpenAI/Codex OAuth:

```bash
deepcode codex
# or inside chat: /codex
```

This opens the official OpenAI/Codex OAuth flow in the browser and falls back to a device-code prompt when needed. Tokens are stored securely as `CODEX_OAUTH_TOKEN` plus refresh metadata, and `codex-oauth` becomes the active provider.

OpenRouter:

```bash
deepcode login openrouter
deepcode provider openrouter openai/gpt-4o-mini
deepcode
```

NVIDIA NIM:

```bash
deepcode login nvidia
deepcode provider nvidia nvidia/llama-3.1-nemotron-70b-instruct
deepcode
```

Inside chat you can do the same with:

```text
/codex

/login openrouter
/provider openrouter
/model openrouter/openai/gpt-4o-mini

/login nvidia
/provider nvidia
/model nvidia/nvidia/llama-3.1-nemotron-70b-instruct
```

Inside the chat, type `/` to open the command help.

Core slash commands:

- `/help` or `/` — show all commands.
- `/codex` — official OpenAI/Codex OAuth login and provider selection.
- `/provider [id]` — show or switch provider.
- `/login <provider>` or `/api <provider>` — securely configure API key or OAuth credential.
- `/model [provider/model]` — show or switch model.
- `/models [provider]` — list recommended models.
- `/agent [name]` and `/agents` — manage agent profile.
- `/new`, `/sessions`, `/session <id>`, `/rename <title>` — manage sessions.
- `/project`, `/projects`, `/project add <path>` — manage projects.
- `/allowall [on|off|status]` — no-prompt autonomous mode: allows every AI tool/command until disabled.
- `/config`, `/doctor`, `/clear`, `/exit`.

## Current MVP

- Multi-provider registry: OpenAI, Anthropic, Gemini, OpenRouter, NVIDIA NIM, DeepSeek, Groq, Mistral, Ollama, LM Studio, GitHub Models, Bedrock, Vertex, Foundry, Codex, and Codex OAuth.
- Official OpenAI/Codex OAuth login with browser/device-code flow and secure token refresh.
- Visual terminal chat with header, message boxes, notices, and rich slash-command help.
- Session persistence and recent project tracking.
- Secure API key setup through keychain when available, encrypted fallback otherwise.
- Automatic local data migration from legacy `opendeep` storage to `deepcode` storage.
- Safe config display with secret redaction.
- Permission manager for local tools.
- Doctor checks for runtime and configuration.
- Config import preview from OpenClaude/OpenCode/OpenClaw-style environments/files.

## Security defaults

DeepCode does not print API keys or OAuth tokens. Sensitive local actions require confirmation unless `permissions.autoAllow` is explicitly enabled in config.

For fully autonomous production-style runs, use `/allowall on` inside chat or `deepcode allowall on`. This sets `permissions.allowAll=true` and disables all permission prompts, including dangerous shell commands. Use it only in trusted repositories or sandboxes; turn it off with `/allowall off` or `deepcode allowall off`.
