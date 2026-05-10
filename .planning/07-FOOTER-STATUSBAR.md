# Fase 07 — Footer & Status Bar

## Problema Atual

O OpenDeep não tem nenhuma barra de status. O usuário precisa usar `/config` ou olhar o header para saber qual provider/model está usando.

## Referência: OpenCode Footer

```
~/projects/myapp            • 0 LSP  ⊙ 2 MCP  /status
```

Mostra: diretório, LSP count, MCP count, atalho para status.

## Solução: DeepCode Status Bar

### Layout

```
~/projects/myapp  │  anthropic/claude-4-sonnet  │  general  │  ESC cancela  │  /help
```

### Componentes da Barra

| Seção | Conteúdo | Atualização |
|---|---|---|
| Esquerda | Diretório do projeto (truncado) | Fixo por sessão |
| Centro-esq | `provider/model` | Muda com `/use`, `/model` |
| Centro | Nome do agente | Muda com `/agent` |
| Centro-dir | Hint contextual (varia por estado) | Dinâmico |
| Direita | Atalho rápido | Fixo |

### Hints Contextuais

| Estado | Hint |
|---|---|
| Idle (aguardando input) | `/ comandos` |
| Agent rodando | `ESC cancela` |
| Picker aberto | `↑↓ navega  Enter seleciona` |
| Erro exibido | `Enter continua` |
| Rate limit | `Retry em 28s...` |

### Implementação

```typescript
// src/ui/components/statusBar.ts — NOVO

interface StatusBarState {
  directory: string
  provider: string
  model: string
  agent: string
  hint: string
}

function renderStatusBar(state: StatusBarState, width: number): string {
  const theme = getTheme()
  const left = truncatePath(state.directory, 30)
  const center = `${state.provider}/${truncate(state.model, 20)}`
  const agent = state.agent
  const hint = state.hint
  
  // Layout: left │ center │ agent │ hint
  const sep = theme.textMuted + ' │ ' + theme.reset
  const content = [
    theme.textMuted + left,
    theme.text + center,
    theme.info + agent,
    theme.textMuted + hint,
  ].join(sep)
  
  return theme.bgPanel + padVisible(content, width) + theme.reset
}
```

## Tarefas

- [ ] Task 7.1 — `StatusBar` component com layout responsivo
- [ ] Task 7.2 — Integrar na região `footer` do Screen Manager
- [ ] Task 7.3 — Atualizar hints conforme estado do input
- [ ] Task 7.4 — Truncamento inteligente para terminais estreitos
- [ ] Task 7.5 — Testes de layout em diferentes larguras

## Arquivos Impactados

| Arquivo | Mudança |
|---|---|
| `src/ui/components/statusBar.ts` | **NOVO** |
| `src/chat/chat.ts` | **MODIFICAR** — Setar estado da status bar |
| `src/chat/agentLoop.ts` | **MODIFICAR** — Atualizar hint durante agent run |

## Referências no OpenCode

- `packages/opencode/src/cli/cmd/tui/routes/session/footer.tsx` → Footer com directory, LSP, MCP, /status
