# Fase 01 — Sistema de Renderização TUI

## Problema Atual

O OpenDeep usa `console.log` direto com `chalk` para toda a renderização. Cada componente (header, bubble, tool call, error) escreve diretamente no stdout sem controle de layout, sem update in-place, e sem capacidade de redesenhar a tela.

### Código Atual Problemático

```
src/ui/terminal.ts    → box(), table(), rule() - funções estáticas de formatação
src/ui/chatRenderer.ts → renderHeader(), renderToolCall() etc - tudo via console.log
```

**Consequências**:
- Impossível mostrar spinners animados (console.log não redesenha linhas)
- Impossível atualizar status de uma tool call em progresso
- Impossível criar uma status bar fixa no rodapé
- Scroll infinito sem controle — tela vira um dump de texto

---

## Solução Proposta

### Criar uma Camada de Rendering com Regiões

Ao invés de adotar uma framework TUI pesada como Ink (React) ou `@opentui/solid` (que é Go-native), criar um **rendering engine leve** próprio baseado em regiões ANSI.

### Arquitetura

```
src/ui/
├── engine/
│   ├── screen.ts          ← Gerenciador de tela (regiões, refresh, alternate screen)
│   ├── region.ts          ← Classe Region (área retangular com conteúdo)
│   ├── ansi.ts            ← ANSI escape sequences helpers
│   └── layout.ts          ← Layout manager (header, body, footer)
├── components/
│   ├── spinner.ts         ← Componente spinner animado
│   ├── statusLine.ts      ← Linha de status (task em progresso)
│   ├── progressBar.ts     ← Barra de progresso
│   ├── box.ts             ← Box melhorado (reusa lógica atual)
│   ├── toast.ts           ← Notificações temporárias
│   └── logo.ts            ← Logo ASCII art animado
├── chatRenderer.ts        ← (refatorado) Usa engine ao invés de console.log
└── terminal.ts            ← (refatorado) Funções utilitárias mantidas
```

---

## Especificação Técnica

### 1. Screen Manager (`screen.ts`)

**Responsabilidades**:
- Gerenciar alternate screen buffer (`\x1b[?1049h` / `\x1b[?1049l`)
- Manter registro de regiões ativas (header, body/scroll, status, footer)
- Ciclo de render: `requestRender()` → debounce → `flush()`
- Controlar cursor position com `\x1b[{row};{col}H`
- Terminal resize handler via `process.stdout.on('resize')`

```typescript
interface Screen {
  width: number
  height: number
  regions: Map<string, Region>
  
  // Lifecycle
  enter(): void              // Entra no alternate screen
  exit(): void               // Sai do alternate screen, restaura terminal
  
  // Regiões
  addRegion(id: string, config: RegionConfig): Region
  getRegion(id: string): Region | undefined
  removeRegion(id: string): void
  
  // Rendering
  requestRender(): void      // Marca como dirty, agenda flush
  flush(): void              // Redesenha regiões dirty
  
  // Cleanup
  destroy(): void            // Limpa tudo, restaura terminal
}

interface RegionConfig {
  type: 'fixed-top' | 'fixed-bottom' | 'scrollable' | 'overlay'
  height: number | 'auto' | 'fill'
  zIndex?: number
}
```

### 2. Region (`region.ts`)

**Responsabilidades**:
- Manter buffer de conteúdo (linhas de texto ANSI)
- Suportar scroll interno (para body de mensagens)
- Dirty tracking (só redesenha se mudou)

```typescript
interface Region {
  id: string
  x: number
  y: number
  width: number
  height: number
  
  // Conteúdo
  setContent(lines: string[]): void
  appendLine(line: string): void
  clear(): void
  
  // Scroll (para região scrollable)
  scrollUp(lines?: number): void
  scrollDown(lines?: number): void
  scrollToBottom(): void
  
  // Estado
  isDirty(): boolean
  render(): string[]          // Retorna linhas prontas para flush
}
```

### 3. Layout Padrão

```
┌─────────────────────────────────────────────┐ ← Region: header (fixed-top, h=5)
│  ╭─ DeepCode ─────────────────────────────╮ │
│  │ provider  anthropic • claude-4-sonnet  │ │
│  │ agent     general                      │ │
│  │ project   OpenDeep                     │ │
│  ╰────────────────────────────────────────╯ │
├─────────────────────────────────────────────┤
│                                             │ ← Region: body (scrollable, h=fill)
│  ╭─ You ─────────────────────────────────╮  │
│  │ Crie um projeto Next.js              │  │
│  ╰───────────────────────────────────────╯  │
│                                             │
│  ╭─ DeepCode ────────────────────────────╮  │
│  │ Vou criar o projeto...               │  │
│  ╰───────────────────────────────────────╯  │
│                                             │
│  ⠹ Executando: mkdir project-name           │ ← Status line dentro do body
│  ✓ mkdir concluído                          │
│  ⠹ Executando: write package.json           │
│                                             │
├─────────────────────────────────────────────┤
│ › prompt do usuário aqui_                   │ ← Region: input (fixed-bottom, h=3)
├─────────────────────────────────────────────┤
│ ~/projects/myapp  anthropic/claude  general │ ← Region: footer (fixed-bottom, h=1)
└─────────────────────────────────────────────┘
```

---

## Tarefas de Implementação

### Task 1.1 — ANSI Helpers (`ansi.ts`)
- [ ] `moveTo(row, col)` — move cursor
- [ ] `clearLine()` — limpa linha atual
- [ ] `clearScreen()` — limpa tela inteira
- [ ] `enterAlternateScreen()` / `exitAlternateScreen()`
- [ ] `hideCursor()` / `showCursor()`
- [ ] `saveCursor()` / `restoreCursor()`
- [ ] `scrollRegion(top, bottom)` — define região de scroll

### Task 1.2 — Region Class (`region.ts`)
- [ ] Implementar buffer de linhas
- [ ] Dirty tracking com hash
- [ ] Scroll interno para regiões scrollable
- [ ] Método `render()` que retorna linhas cortadas na largura

### Task 1.3 — Screen Manager (`screen.ts`)
- [ ] Criar/destruir alternate screen
- [ ] Gerenciar regiões com layout vertical
- [ ] Render loop com `requestRender()` debounced (16ms = 60fps)
- [ ] Resize handler
- [ ] Graceful cleanup em `SIGINT`, `SIGTERM`, `exit`

### Task 1.4 — Layout Manager (`layout.ts`)
- [ ] Calcular posições das regiões baseado em `fixed-top`, `fill`, `fixed-bottom`
- [ ] Recalcular em resize
- [ ] Garantir que `fill` ocupa espaço restante

### Task 1.5 — Migrar `chatRenderer.ts`
- [ ] Substituir `console.log` por `screen.getRegion('body').appendLine()`
- [ ] `renderHeader()` → escreve na região header
- [ ] `renderUserBubble()` → append na região body
- [ ] `renderAssistantBubble()` → append na região body
- [ ] `renderToolCall()` → append na região body
- [ ] Manter fallback para terminais sem suporte (pipe, CI)

### Task 1.6 — Testes
- [ ] Teste unitário de Region (buffer, scroll, dirty)
- [ ] Teste de layout calculation
- [ ] Teste de ANSI helpers (snapshot do output)

---

## Decisões de Design

### Por que não usar Ink/Blessed/@opentui?

| Framework | Por que não |
|---|---|
| **Ink** | Adiciona React como dep, overhead significativo, difícil integrar com readline existente |
| **Blessed** | Abandonado, API legacy, complexo |
| **@opentui/solid** | Nativo do ecossistema OpenCode/Go, dependência pesada, não reutilizável |
| **Custom leve** | ✅ Total controle, zero deps extras, integra com chalk existente |

### Alternate Screen vs Inline

- **Usar alternate screen** para o modo interativo (`runChat`)
- **Manter inline** para `runPrompt` (modo one-shot)
- **Fallback inline** quando `!process.stdout.isTTY`

---

## Arquivos Atuais Impactados

| Arquivo | Impacto |
|---|---|
| `src/ui/terminal.ts` | Refatorar: extrair helpers para `ansi.ts`, manter `box/table/section` |
| `src/ui/chatRenderer.ts` | Refatorar: usar Screen API ao invés de console.log |
| `src/chat/chat.ts` | Modificar: `runChat()` inicializa Screen, `runPrompt()` mantém inline |
| `src/chat/agentLoop.ts` | Modificar: tool calls atualizam região de status |

---

## Referências no OpenCode

- `packages/opencode/src/cli/cmd/tui/app.tsx` → Estrutura geral do TUI com providers
- `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx` → Layout da sessão com scroll, sidebar, footer
- `packages/opencode/src/cli/cmd/tui/routes/home.tsx` → Home com logo centralizado e prompt
- `packages/opencode/src/cli/cmd/tui/component/spinner.tsx` → Spinner animado com frames braille
