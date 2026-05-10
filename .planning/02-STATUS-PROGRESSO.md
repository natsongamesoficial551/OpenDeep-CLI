# Fase 02 — Status & Progresso em Tempo Real

## Problema Atual

Quando o agente está executando tool calls (criando arquivos, rodando comandos, lendo código), o usuário **não recebe nenhum feedback visual**. A tela fica parada até o agente terminar, o que faz parecer que a CLI travou.

### Código Atual

```typescript
// src/chat/agentLoop.ts — executeToolCall()
async function executeToolCall(call: ToolCall, ctx: ToolContext): Promise<ChatMessage> {
  renderToolCall(call)      // ← Mostra JSON bruto da chamada
  // ... executa tool ...
  renderToolResult(call.name, result)  // ← Mostra resultado bruto
}
```

O `renderToolCall()` mostra um dump de JSON da tool call. Não há spinner, não há indicação de "em progresso", não há lista de tasks.

### Comparação com OpenCode

O OpenCode mostra cada tool call com:
- **Spinner animado** enquanto executa (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`)
- **Título descritivo** (ex: "Reading file src/index.ts", "Writing 3 files")
- **Status de conclusão** com ícone (`✓` verde, `✗` vermelho)
- **Tempo de execução** (ex: "2.3s")
- **Colapsável** — detalhes podem ser escondidos/mostrados

---

## Solução Proposta

### Task Tracker com Visual Profissional

Criar um sistema de **Task Status** que mostra cada operação do agente em tempo real, estilo CI/CD pipeline.

### Visual do Status

```
╭─ DeepCode está trabalhando ─────────────────────────────╮
│                                                          │
│  ✓ Lendo estrutura do projeto         glob     0.2s     │
│  ✓ Verificando package.json           read     0.1s     │
│  ✓ Criando diretório src/             mkdir    0.0s     │
│  ⠹ Escrevendo src/index.ts            write    1.4s     │
│  ○ Escrevendo src/app.tsx             write    pendente │
│  ○ Configurando tsconfig.json         write    pendente │
│                                                          │
│  4/6 tasks • 1.7s total                                  │
╰──────────────────────────────────────────────────────────╯
```

### Estados de uma Task

| Ícone | Estado | Cor |
|---|---|---|
| `○` | Pendente (enfileirada) | `chalk.dim` (cinza) |
| `⠹` | Em execução (spinner animado) | `chalk.cyan` |
| `✓` | Concluída com sucesso | `chalk.green` |
| `✗` | Falhou | `chalk.red` |
| `⊘` | Cancelada (ESC) | `chalk.yellow` |

---

## Arquitetura

### Novo Módulo: `src/ui/taskTracker.ts`

```typescript
interface TaskEntry {
  id: string
  label: string             // "Escrevendo src/index.ts"
  toolName: string          // "write"
  status: 'pending' | 'running' | 'done' | 'error' | 'cancelled'
  startedAt?: number
  completedAt?: number
  error?: string
}

interface TaskTracker {
  // Lifecycle
  start(label: string, toolName: string): string    // retorna taskId
  complete(taskId: string): void
  fail(taskId: string, error: string): void
  cancel(taskId: string): void
  
  // Rendering
  render(): string[]         // Retorna linhas para a região de status
  
  // Estado
  tasks: TaskEntry[]
  isActive(): boolean        // Há tasks em execução?
  summary(): string          // "4/6 tasks • 1.7s total"
}
```

### Novo Módulo: `src/ui/components/spinner.ts`

```typescript
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

class Spinner {
  private frameIndex = 0
  private interval: NodeJS.Timeout | null = null
  
  start(onFrame: (frame: string) => void): void
  stop(): void
  currentFrame(): string
}
```

### Labels Descritivos por Tool

Ao invés de mostrar o nome técnico da tool, mostrar labels amigáveis:

```typescript
const TOOL_LABELS: Record<string, (args: unknown) => string> = {
  read:    (args) => `Lendo ${(args as any).path}`,
  write:   (args) => `Escrevendo ${(args as any).path}`,
  edit:    (args) => `Editando ${(args as any).path}`,
  mkdir:   (args) => `Criando diretório ${(args as any).path}`,
  bash:    (args) => `Executando: ${truncate((args as any).command, 40)}`,
  grep:    (args) => `Buscando "${truncate((args as any).pattern, 20)}"`,
  glob:    (args) => `Listando arquivos ${(args as any).pattern}`,
  list:    (args) => `Explorando ${(args as any).path}`,
  git_status: () => `Verificando git status`,
  git_diff:   () => `Analisando git diff`,
  git_log:    () => `Consultando git log`,
  web_fetch:  (args) => `Buscando ${truncate((args as any).url, 40)}`,
  browser_check: () => `Verificando browser`,
}
```

---

## Integração com `agentLoop.ts`

### Mudanças no Fluxo

```typescript
// ANTES (agentLoop.ts)
for (const call of response.toolCalls) {
  const toolMessage = await executeToolCall(call, ctx)
  appendMessage(state.session, toolMessage)
  await saveSession(state.session)
}

// DEPOIS
const tracker = createTaskTracker()

// Registra todas as tasks pendentes
for (const call of response.toolCalls) {
  tracker.start(toolLabel(call.name, call.arguments), call.name)
}

// Executa com status updates
for (const call of response.toolCalls) {
  tracker.setRunning(call.id)
  screen.getRegion('status').setContent(tracker.render())
  screen.requestRender()
  
  try {
    const toolMessage = await executeToolCall(call, ctx)
    tracker.complete(call.id)
  } catch (error) {
    tracker.fail(call.id, safeError(error))
  }
  
  screen.getRegion('status').setContent(tracker.render())
  screen.requestRender()
  
  appendMessage(state.session, toolMessage)
  await saveSession(state.session)
}

// Limpa status após conclusão
tracker.clear()
```

---

## Eventos

Expandir o sistema de eventos existente (`src/core/events.ts`):

```typescript
// Eventos adicionais
export type OpenDeepEvent =
  | { type: 'tool.started'; tool: string; title: string; taskId: string }
  | { type: 'tool.progress'; taskId: string; progress: number }
  | { type: 'tool.completed'; tool: string; title: string; taskId: string; durationMs: number }
  | { type: 'tool.failed'; tool: string; title: string; taskId: string; error: string }
  | { type: 'tool.cancelled'; taskId: string }
  | { type: 'agent.thinking' }                    // Agente está processando
  | { type: 'agent.responding'; partial: string }  // Streaming de resposta
  | { type: 'agent.iteration'; current: number; max: number }  // Loop de agent
```

---

## Visual Adicional: Streaming de Resposta

Além das tasks, mostrar progresso durante o streaming da resposta do modelo:

```
╭─ DeepCode ────────────────────────────────────────────╮
│ ⠹ Pensando...                                         │  ← antes da resposta
╰───────────────────────────────────────────────────────╯

╭─ DeepCode ────────────────────────────────────────────╮
│ Vou criar o projeto com a seguinte estrutura:         │  ← streaming em tempo real
│ - src/index.ts — ponto de entrada                     │
│ - src/app.tsx — componente principal█                  │  ← cursor piscando
╰───────────────────────────────────────────────────────╯
```

---

## Tarefas de Implementação

### Task 2.1 — Spinner Component
- [ ] Implementar classe `Spinner` com frames braille
- [ ] Timer de 80ms entre frames
- [ ] Método `start(callback)` e `stop()`
- [ ] Fallback estático (`⋯`) para terminais sem animação

### Task 2.2 — Task Tracker
- [ ] Implementar `TaskTracker` com array de `TaskEntry`
- [ ] Métodos: `start()`, `complete()`, `fail()`, `cancel()`
- [ ] Método `render()` que retorna box formatado com todas as tasks
- [ ] `summary()` com contagem e tempo total

### Task 2.3 — Tool Labels
- [ ] Mapeamento `toolName → label amigável` para todas as 17 tools
- [ ] Truncamento inteligente de paths longos
- [ ] Labels em português

### Task 2.4 — Integrar no Agent Loop
- [ ] Modificar `executeToolCall()` para usar TaskTracker
- [ ] Emitir eventos `tool.started` e `tool.completed`
- [ ] Atualizar região de status a cada mudança

### Task 2.5 — Status de Streaming
- [ ] Mostrar "⠹ Pensando..." antes da resposta
- [ ] Streaming character-by-character na região body
- [ ] Mostrar "⠹ Gerando resposta..." durante stream

### Task 2.6 — Indicador de Iteração do Agent
- [ ] Mostrar "Iteração 3/8" quando o agent loop está rodando
- [ ] Warning visual quando próximo do limite (7/8, 8/8)

---

## Arquivos Impactados

| Arquivo | Mudança |
|---|---|
| `src/ui/components/spinner.ts` | **NOVO** — Componente spinner |
| `src/ui/taskTracker.ts` | **NOVO** — Task tracker com rendering |
| `src/chat/agentLoop.ts` | **MODIFICAR** — Integrar task tracker |
| `src/core/events.ts` | **MODIFICAR** — Novos tipos de evento |
| `src/ui/chatRenderer.ts` | **MODIFICAR** — `renderToolCall` usa tracker |

---

## Referências no OpenCode

- `packages/opencode/src/cli/cmd/tui/component/spinner.tsx` → Spinner com frames `⠋⠙⠹...` e 80ms interval
- `packages/opencode/src/cli/cmd/tui/component/startup-loading.tsx` → Loading com delay para evitar flash
- `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx` → Como tool parts são renderizadas com status
