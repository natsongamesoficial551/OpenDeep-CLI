# Fase 06 — Error Handling & Recovery

## Problema Atual

Erros tratados com `renderError(safeError(error))` simples. Sem retry, sem classificação, sem recovery de sessões corrompidas.

## Solução

### 1. Error Classification (`src/core/errors.ts` — NOVO)

Classificar erros em categorias com ações sugeridas:

| Categoria | Detecção | Retryable | Ação Sugerida |
|---|---|---|---|
| `rate-limit` | 429, "rate limit" | ✓ | Aguardar retry-after |
| `auth` | 401, 403, "invalid api key" | ✗ | `/login <provider>` |
| `network` | ECONNREFUSED, ETIMEDOUT | ✓ | Retry automático 3s |
| `model` | "context length", "too many tokens" | ✗ | `/clear` ou `/model` |
| `tool` | Tool execution failed | ✗ | Mostrar output |
| `session` | JSON parse error | ✗ | Recovery automático |
| `cancelled` | AbortError | ✗ | — |
| `internal` | Catch-all | ✗ | `/doctor` |

### 2. Retry com Backoff (`src/core/retry.ts` — NOVO)

- `withRetry(fn, { maxRetries: 3, baseDelayMs: 1000 })`
- Exponential backoff com jitter
- Visual: "⠹ Tentando novamente em 3s... (2/3)"
- Cancelável via AbortSignal

### 3. Toast System (`src/ui/components/toast.ts` — NOVO)

Notificações temporárias no rodapé:
```
┌ ⚠ Rate limit — aguardando 30s ─── [Enter] retry ┐
```

### 4. Session Recovery

- Try/catch robusto em `loadSession()`
- Backup de JSON corrompido (`session.json.corrupted.timestamp`)
- Tentativa de fix com JSON parcial

### 5. Logger (`src/core/logger.ts` — NOVO)

- File-based (não stdout): `~/.deepcode/deepcode.log`
- Levels: debug, info, warn, error
- Configurável via `DEEPCODE_LOG_LEVEL`
- Rotação: 3 × 5MB

## Tarefas

- [ ] Task 6.1 — `classifyError()` com categorias e ações
- [ ] Task 6.2 — `withRetry()` com backoff e visual
- [ ] Task 6.3 — Toast manager com auto-dismiss
- [ ] Task 6.4 — Session recovery em `loadSession`
- [ ] Task 6.5 — Logger com rotação
- [ ] Task 6.6 — Integrar retry no agent loop

## Arquivos Impactados

| Arquivo | Mudança |
|---|---|
| `src/core/errors.ts` | **NOVO** |
| `src/core/retry.ts` | **NOVO** |
| `src/core/logger.ts` | **NOVO** |
| `src/ui/components/toast.ts` | **NOVO** |
| `src/sessions/sessionStore.ts` | **MODIFICAR** — Recovery |
| `src/chat/agentLoop.ts` | **MODIFICAR** — Retry |
| `src/chat/chat.ts` | **MODIFICAR** — Errors classificados |
