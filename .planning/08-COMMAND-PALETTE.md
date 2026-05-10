# Fase 08 — Command Palette Avançado

## Problema Atual

O OpenDeep tem um autocomplete inline de `/commands` (`readChatInput` em `chat.ts`). Funciona mas é limitado:
- Máximo 8 comandos visíveis
- Sem categorias visuais
- Sem keybinds mostrados
- Sem comandos dinâmicos (registrados por módulos)

## Referência: OpenCode

O OpenCode tem um `CommandProvider` completo (`dialog-command.tsx`) com:
- Categorias (Session, Agent, Provider, System)
- Keybinds por comando
- `command.register()` dinâmico
- Slash command aliases
- Sugestões baseadas no contexto (`suggested: true`)

## Solução: Command Palette Full

### Visual

```
╭─ Comandos ────────────────────────────── Ctrl+P ─────╮
│                                                        │
│  Filtro: mod                                           │
│                                                        │
│  Modelo                                                │
│  ──────────────────────────────────────                 │
│  › /model [provider/model]     Trocar modelo    Ctrl+M │
│    /models [provider]          Listar modelos          │
│    /use <provider/model>       Trocar provider+model   │
│                                                        │
│  Sessão                                                │
│  ──────────────────────────────────────                 │
│    /new                        Nova sessão      Ctrl+N │
│    /sessions                   Listar sessões   Ctrl+P │
│                                                        │
╰────────────────────────────────────────────────────────╯
```

### Keybinds Globais

| Keybind | Comando | Contexto |
|---|---|---|
| `Ctrl+P` | Abrir command palette | Sempre |
| `Ctrl+N` | Nova sessão | Sempre |
| `Ctrl+M` | Trocar modelo | Sempre |
| `Ctrl+S` | Abrir session picker | Sempre |
| `Ctrl+L` | Limpar contexto | Em sessão |
| `ESC` | Cancelar / Fechar | Contextual |

### Implementação

```typescript
// src/ui/components/commandPalette.ts — NOVO

interface PaletteCommand {
  name: string
  title: string
  description: string
  category: string
  keybind?: string
  slash?: { name: string; aliases?: string[] }
  suggested?: boolean
  hidden?: boolean
  onSelect: () => void | Promise<void>
}

interface CommandPalette {
  register(commands: PaletteCommand[]): void
  open(): Promise<void>
  close(): void
  isOpen(): boolean
}
```

## Tarefas

- [ ] Task 8.1 — `CommandPalette` component com search fuzzy
- [ ] Task 8.2 — Categorias visuais com separadores
- [ ] Task 8.3 — Keybind display por comando
- [ ] Task 8.4 — `Ctrl+P` global para abrir palette
- [ ] Task 8.5 — Registrar comandos dinâmicos por módulo
- [ ] Task 8.6 — Migrar slash commands atuais para palette

## Arquivos Impactados

| Arquivo | Mudança |
|---|---|
| `src/ui/components/commandPalette.ts` | **NOVO** |
| `src/chat/chat.ts` | **MODIFICAR** — Keybind global Ctrl+P |
| `src/commands/slash.ts` | **MODIFICAR** — Registrar no palette |

## Referências no OpenCode

- `packages/opencode/src/cli/cmd/tui/component/dialog-command.tsx` → Command palette com categorias e keybinds
- `packages/opencode/src/cli/cmd/tui/app.tsx` L413-782 → `command.register()` com ~40 comandos registrados
