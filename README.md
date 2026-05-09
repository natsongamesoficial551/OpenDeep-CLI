# OpenDeep

OpenDeep is an open-source terminal AI CLI focused on provider-agnostic chat, safe local tools, and extensible coding-agent workflows.

## Install

```bash
npm install -g opendeep
```

## Start

```bash
opendeep
```

Run a one-shot prompt:

```bash
opendeep "Explain this project"
```

## Current MVP

- Multi-provider registry: OpenAI, Anthropic, Gemini, OpenRouter, DeepSeek, Groq, Mistral, Ollama, LM Studio, GitHub Models, Bedrock, Vertex, Foundry, Codex placeholders.
- Interactive terminal chat with slash commands.
- Safe config display with secret redaction.
- Permission manager for local tools.
- Doctor checks for runtime and configuration.
- Config import preview from OpenClaude/OpenCode/OpenClaw-style environments/files.

## Security defaults

OpenDeep does not print API keys. Sensitive local actions require confirmation unless `permissions.autoAllow` is explicitly enabled in config.
