# OpenDeep

OpenDeep is an open-source terminal AI CLI focused on provider-agnostic chat, safe local tools, visual terminal UX, sessions, projects, and extensible coding-agent workflows.

## Install

From npm after publish:

```bash
npm install -g opendeep
```

Local development install:

```bash
npm install
npm run link:local
opendeep
```

## Start

```bash
opendeep
```

Run a one-shot prompt:

```bash
opendeep "Explain this project"
```

## Useful commands

```bash
opendeep providers
opendeep models
opendeep auth openai
opendeep sessions
opendeep projects
opendeep doctor
```

## Provider login examples

OpenDeep stores API keys through the OS keychain when available, with encrypted local fallback.

OpenRouter:

```bash
opendeep login openrouter
opendeep provider openrouter openai/gpt-4o-mini
opendeep
```

NVIDIA NIM:

```bash
opendeep login nvidia
opendeep provider nvidia nvidia/llama-3.1-nemotron-70b-instruct
opendeep
```

Inside chat you can do the same with:

```text
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
- `/provider [id]` — show or switch provider.
- `/login <provider>` or `/api <provider>` — securely configure API key.
- `/model [provider/model]` — show or switch model.
- `/models [provider]` — list recommended models.
- `/agent [name]` and `/agents` — manage agent profile.
- `/new`, `/sessions`, `/session <id>`, `/rename <title>` — manage sessions.
- `/project`, `/projects`, `/project add <path>` — manage projects.
- `/config`, `/doctor`, `/clear`, `/exit`.

## Current MVP

- Multi-provider registry: OpenAI, Anthropic, Gemini, OpenRouter, NVIDIA NIM, DeepSeek, Groq, Mistral, Ollama, LM Studio, GitHub Models, Bedrock, Vertex, Foundry, Codex placeholders.
- Visual terminal chat with header, message boxes, notices, and rich slash-command help.
- Session persistence and recent project tracking.
- Secure API key setup through keychain when available, encrypted fallback otherwise.
- Safe config display with secret redaction.
- Permission manager for local tools.
- Doctor checks for runtime and configuration.
- Config import preview from OpenClaude/OpenCode/OpenClaw-style environments/files.

## Security defaults

OpenDeep does not print API keys. Sensitive local actions require confirmation unless `permissions.autoAllow` is explicitly enabled in config.
