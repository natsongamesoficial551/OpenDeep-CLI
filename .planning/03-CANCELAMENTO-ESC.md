# Fase 03 — Cancelamento com ESC

## Problema Atual

O OpenDeep já tem um mecanismo parcial de cancelamento via ESC, mas ele é **bugado e inconsistente**:

### Código Atual (`src/chat/chat.ts`)

```typescript
// Linha 634-649
function watchAbortKey(controller: AbortController) {
  if (!process.stdin.isTTY) return () => {}
  const stdin = process.stdin
  const wasRaw = stdin.isRaw
  const onData = (chunk: Buffer) => {
    const text = chunk.toString('utf8')
    if (text.includes('\u001b') || text.includes('\u0003')) controller.abort()
  }
  stdin.setRawMode(true)     // ⚠️ CONFLITO: setRawMode já está ativo no readChatInput
  stdin.resume()
  stdin.on('data', onData)
  return () => {
    stdin.off('data', onData)
    if (!wasRaw) stdin.setRawMode(false)  // ⚠️ Pode desligar rawMode quando não deveria
  }
}
```

### Bugs Identificados

1. **Conflito de `setRawMode`** — `readChatInput()` já define rawMode para o input picker. Quando `watchAbortKey` também define, há estado inconsistente
2. **ESC intercepta tudo** — Qualquer tecla ESC é capturada, incluindo ESC de sequências de escape (setas, F-keys)
3. **Sem feedback visual** — O abort acontece silenciosamente, sem spinner parando ou mensagem clara
4. **Estado sujo após abort** — Session pode ficar com mensagens parciais
5. **Não funciona durante tool calls** — Se uma tool call está bloqueando (ex: `bash` rodando), o abort não chega ao processo filho

### Tratamento Atual do Erro

```typescript
// Linha 688-690
if (error instanceof Error && /abort/i.test(error.name + error.message)) 
  renderNotice('Interrompido', 'Resposta interrompida pelo usuário.')
else renderError(safeError(error))
```

Funciona mas é muito básico — sem cleanup de tasks, sem indicação visual durante o abort.

---

## Solução Proposta

### Input Controller Centralizado

Criar um controller único que gerencia todos os inputs de teclado, incluindo ESC para abort:

```typescript
// src/ui/inputController.ts

interface InputController {
  // Estado
  isListening(): boolean
  currentMode(): 'chat-input' | 'picker' | 'agent-running' | 'idle'
  
  // Modos
  enterChatInput(): void      // Modo de digitação normal
  enterPicker(): void          // Modo de seleção (setas/enter)
  enterAgentRunning(): void    // Modo de agente rodando (ESC cancela)
  enterIdle(): void            // Nenhum input ativo
  
  // Abort
  setAbortController(controller: AbortController): void
  onAbort(callback: () => void): () => void  // Retorna unsubscribe
}
```

### Fluxo de Cancelamento

```
1. Usuário envia prompt
2. inputController.enterAgentRunning()
3. AbortController criado e registrado
4. Agent loop inicia
5. [Usuário pressiona ESC]
6. InputController detecta ESC no modo 'agent-running'
7. AbortController.abort() chamado
8. TaskTracker marca tasks como 'cancelled'
9. Visual atualizado: "⊘ Operação cancelada pelo usuário"
10. Cleanup: session salva com estado consistente
11. inputController.enterChatInput()
12. Prompt volta a aceitar input
```

### Diferenciação de ESC

```typescript
// ESC sozinho vs ESC como parte de sequência de escape
function isStandaloneEsc(chunk: Buffer): boolean {
  // Se for ESC seguido de outro byte, é uma sequência (seta, F-key, etc.)
  // ESC sozinho: buffer de 1 byte = 0x1B
  // Seta para cima: buffer de 3 bytes = 0x1B 0x5B 0x41
  
  if (chunk.length === 1 && chunk[0] === 0x1B) return true
  
  // Timeout approach: esperar 50ms para ver se mais bytes chegam
  // Se não chegarem, é ESC standalone
  return false
}
```

---

## Especificação Técnica

### 1. Detecção de ESC Confiável

```typescript
class EscDetector {
  private timeout: NodeJS.Timeout | null = null
  private buffer: number[] = []
  
  constructor(private onEsc: () => void, private timeoutMs = 50) {}
  
  feed(chunk: Buffer): boolean {
    // Se é ESC puro (1 byte)
    if (chunk.length === 1 && chunk[0] === 0x1B) {
      // Agenda timeout — se nada mais chegar em 50ms, é ESC standalone
      this.timeout = setTimeout(() => {
        this.onEsc()
        this.timeout = null
      }, this.timeoutMs)
      return true  // Consumido, não propagar
    }
    
    // Se tinha ESC pendente e chegou mais dados, é sequência de escape
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
      return false  // Não consumido, propagar como sequência normal
    }
    
    return false
  }
  
  destroy() {
    if (this.timeout) clearTimeout(this.timeout)
  }
}
```

### 2. Abort com Cleanup

```typescript
// src/chat/agentLoop.ts — melhorado

async function runAgentTurnWithAbort(input: AgentTurnInput) {
  const { state, config, provider, signal } = input
  const tracker = input.taskTracker
  
  // Registra handler de abort
  signal?.addEventListener('abort', () => {
    // Cancela todas as tasks pendentes
    for (const task of tracker.tasks) {
      if (task.status === 'running' || task.status === 'pending') {
        tracker.cancel(task.id)
      }
    }
    
    // Salva session com estado atual (sem mensagem parcial corrompida)
    const lastMessage = state.session.messages.at(-1)
    if (lastMessage?.role === 'assistant' && !lastMessage.content.trim()) {
      // Remove mensagem vazia do assistente
      state.session.messages.pop()
    }
  }, { once: true })
  
  // ... resto do loop ...
}
```

### 3. Kill de Processos Filhos

Quando uma tool `bash` está rodando e o usuário pressiona ESC, precisamos matar o processo:

```typescript
// src/tools/localRunner.ts — melhorado

async function runCommand(command: string, ctx: ToolContext): Promise<ToolResult> {
  const proc = spawn(command, { /* ... */ })
  
  // Registra cleanup no signal
  ctx.signal?.addEventListener('abort', () => {
    if (!proc.killed) {
      // Tenta SIGTERM primeiro, depois SIGKILL
      proc.kill('SIGTERM')
      setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL')
      }, 2000)
    }
  }, { once: true })
  
  // ... resto ...
}
```

### 4. Feedback Visual de Cancelamento

```
╭─ Operação Cancelada ─────────────────────────────────╮
│                                                       │
│  ✓ Lendo package.json              read     0.1s     │
│  ✓ Criando diretório src/          mkdir    0.0s     │
│  ⊘ Escrevendo src/index.ts         write    cancelado│
│  ⊘ Escrevendo src/app.tsx          write    cancelado│
│                                                       │
│  2/4 tasks • cancelado após 0.3s                     │
│                                                       │
│  Pressione Enter para continuar ou envie novo prompt │
╰──────────────────────────────────────────────────────╯
```

---

## Tarefas de Implementação

### Task 3.1 — EscDetector
- [ ] Implementar detecção de ESC standalone vs sequência de escape
- [ ] Timeout de 50ms para diferenciação
- [ ] Testes unitários

### Task 3.2 — InputController
- [ ] Implementar gerenciador centralizado de modos de input
- [ ] Modes: `chat-input`, `picker`, `agent-running`, `idle`
- [ ] Registrar/desregistrar handlers de teclado por modo
- [ ] Evitar conflitos de `setRawMode`

### Task 3.3 — Abort com Cleanup
- [ ] Integrar AbortController com TaskTracker
- [ ] Cancelar tasks pendentes no abort
- [ ] Limpar mensagens parciais da session
- [ ] Salvar session em estado consistente

### Task 3.4 — Kill de Processos
- [ ] Modificar `localRunner.ts` para registrar abort handler
- [ ] Implementar kill graceful (SIGTERM → timeout → SIGKILL)
- [ ] Modificar `run_background` para cleanup no abort

### Task 3.5 — Feedback Visual
- [ ] Mostrar ícone `⊘` amarelo para tasks canceladas
- [ ] Mensagem "Operação cancelada pelo usuário" no body
- [ ] Transição suave de volta ao prompt

### Task 3.6 — Testes
- [ ] Teste de EscDetector (timing)
- [ ] Teste de InputController (mode transitions)
- [ ] Teste de abort cleanup (session consistency)

---

## Arquivos Impactados

| Arquivo | Mudança |
|---|---|
| `src/ui/inputController.ts` | **NOVO** — Controller centralizado |
| `src/ui/escDetector.ts` | **NOVO** — Detecção de ESC |
| `src/chat/chat.ts` | **MODIFICAR** — Remover `watchAbortKey`, usar InputController |
| `src/chat/agentLoop.ts` | **MODIFICAR** — Integrar abort com TaskTracker |
| `src/tools/localRunner.ts` | **MODIFICAR** — Kill de processos no abort |
| `src/ui/chatRenderer.ts` | **MODIFICAR** — Novo visual de cancelamento |

---

## Referências no OpenCode

- `packages/opencode/src/cli/cmd/tui/app.tsx` L263-296 → Keyboard handler com ESC para clear selection
- `packages/opencode/src/cli/ui.ts` L13 → `CancelledError` tipado
- `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx` → Abort via keybind
