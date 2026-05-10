# Fase 04 — Session Manager Profissional

## Problema Atual

O OpenDeep tem um picker de sessões básico (`pickByArrows` em `chat.ts`), que é funcional mas muito simples:

### Código Atual

```typescript
// src/chat/chat.ts — pickByArrows (linha 97-180)
// Lista simples com setas, filtro por texto, máximo 8 itens visíveis
// Sem categorização, sem preview, sem search server-side
```

### Limitações
1. **Máximo 8 sessões visíveis** — Se tem 50 sessões, é difícil encontrar
2. **Sem categorização** por data (hoje, ontem, última semana)
3. **Sem preview** da última mensagem
4. **Sem delete** de sessão pelo picker
5. **Sem rename** pelo picker
6. **Filtro local apenas** — Não busca em sessões não carregadas
7. **Visual simples** — Sem cores diferenciadas, sem indicadores de status

### Comparação com OpenCode

O OpenCode tem `DialogSessionList` (`dialog-session-list.tsx`) com:
- Search com debounce server-side
- Categorias por data ("Today", data formatada)
- Spinner para sessões ativas
- Delete com confirmação (pressionar keybind 2x)
- Rename inline
- Keybinds customizáveis

---

## Solução Proposta

### Session Picker V2

Reescrever o picker de sessões como um componente completo:

### Visual

```
╭─ Sessões ─────────────────────── (↑↓ navega, Enter abre, Esc fecha) ─╮
│                                                                        │
│  Filtro: next                                                          │
│                                                                        │
│  Hoje                                                                  │
│  ──────────────────────────────────────────────────────────────────     │
│  › a1b2c3d4  Criar projeto Next.js com TypeScript     anthropic  2m   │
│    e5f6g7h8  Debugar erro de CORS no servidor         gemini    14m   │
│    i9j0k1l2  ⠹ Otimizar queries do banco de dados    openai     ativo│
│                                                                        │
│  Ontem                                                                 │
│  ──────────────────────────────────────────────────────────────────     │
│    m3n4o5p6  Configurar CI/CD pipeline                gemini    23h   │
│    q7r8s9t0  Refatorar autenticação OAuth             anthropic  1d   │
│                                                                        │
│  Semana passada                                                        │
│  ──────────────────────────────────────────────────────────────────     │
│    u1v2w3x4  Setup inicial do monorepo                openai     5d   │
│                                                                        │
│  [D] deletar  [R] renomear  [N] nova sessão                          │
╰────────────────────────────────────────────────────────────────────────╯
```

---

## Especificação Técnica

### 1. Categorização Temporal

```typescript
function categorizeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'Hoje'
  if (diffDays === 1) return 'Ontem'
  if (diffDays <= 7) return 'Esta semana'
  if (diffDays <= 30) return 'Este mês'
  if (diffDays <= 90) return 'Últimos 3 meses'
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}
```

### 2. Tempo Relativo

```typescript
function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  return `${months}mo`
}
```

### 3. Session Picker Component

```typescript
interface SessionPickerConfig {
  sessions: SessionRecord[]
  currentSessionId?: string
  maxVisible?: number        // Default: 12 (maior que os 8 atuais)
  onSelect: (session: SessionRecord) => void
  onDelete?: (session: SessionRecord) => void
  onRename?: (session: SessionRecord, newTitle: string) => void
  onNew?: () => void
}

interface SessionPickerState {
  query: string
  selected: number
  scrollOffset: number
  deleteConfirm?: string     // sessionId pendente de confirmação
  renaming?: string          // sessionId sendo renomeado
  renameBuffer?: string
}
```

### 4. Ações por Keybind

| Tecla | Ação |
|---|---|
| `↑` / `↓` | Navega na lista |
| `Enter` | Abre sessão selecionada |
| `Esc` | Fecha picker |
| `D` | Inicia delete (2x para confirmar) |
| `R` | Inicia rename inline |
| `N` | Cria nova sessão |
| Texto | Filtra por título/provider/model |
| `Page Up` / `Page Down` | Scroll na lista |

### 5. Delete com Confirmação

```
│  › a1b2c3d4  Criar projeto Next.js             anthropic  2m          │
│    e5f6g7h8  Debugar erro de CORS               gemini    14m         │

// Após pressionar D:
│  › a1b2c3d4  ⚠ Pressione D novamente para deletar   anthropic  2m   │
│    e5f6g7h8  Debugar erro de CORS               gemini    14m         │

// Após pressionar D de novo: sessão deletada, lista atualizada
```

### 6. Rename Inline

```
│  › a1b2c3d4  Criar projeto Next.js             anthropic  2m          │

// Após pressionar R:
│  › a1b2c3d4  [Novo título: Criar projeto Next_]  anthropic  2m       │

// Enter confirma, Esc cancela
```

---

## Melhorias no `sessionStore.ts`

### Search Server-Side

```typescript
// Adicionar busca otimizada
export async function searchSessions(query: string, options?: { limit?: number }): Promise<SessionRecord[]> {
  const sessions = await listSessions()
  const term = query.toLowerCase()
  const limit = options?.limit ?? 30
  
  return sessions
    .filter(session => 
      session.title.toLowerCase().includes(term) ||
      session.provider.toLowerCase().includes(term) ||
      session.model.toLowerCase().includes(term) ||
      session.projectPath.toLowerCase().includes(term)
    )
    .slice(0, limit)
}
```

### Indicador de Sessão Ativa

Precisamos rastrear quais sessões têm agent loops ativos:

```typescript
// src/sessions/sessionStatus.ts — NOVO

const activeSessions = new Map<string, 'idle' | 'busy'>()

export function setSessionBusy(sessionId: string) {
  activeSessions.set(sessionId, 'busy')
}

export function setSessionIdle(sessionId: string) {
  activeSessions.set(sessionId, 'idle')
}

export function getSessionStatus(sessionId: string): 'idle' | 'busy' {
  return activeSessions.get(sessionId) ?? 'idle'
}
```

---

## Integração com Chat

### Atalho Rápido

Além do `/sessions`, adicionar atalho `Ctrl+S` ou `Ctrl+P` para abrir o picker a qualquer momento:

```typescript
// No inputController (Fase 03), adicionar:
if (mode === 'chat-input' && key.ctrl && key.name === 'p') {
  // Abre session picker
  const session = await openSessionPicker(sessions)
  if (session) switchToSession(session)
}
```

---

## Tarefas de Implementação

### Task 4.1 — Categorização e Tempo Relativo
- [ ] `categorizeDate()` com grupos temporais em português
- [ ] `relativeTime()` com formatação amigável
- [ ] Testes unitários

### Task 4.2 — Session Picker V2
- [ ] Componente `SessionPicker` com estado completo
- [ ] Scroll virtual (viewport de N itens com offset)
- [ ] Rendering com categorias, cores e indicadores
- [ ] Highlight da sessão atual

### Task 4.3 — Delete e Rename
- [ ] Delete com confirmação (2x keypress)
- [ ] Rename inline com buffer de texto
- [ ] Feedback visual durante operação
- [ ] Atualização da lista após operação

### Task 4.4 — Search
- [ ] `searchSessions()` no sessionStore
- [ ] Search com debounce no picker (150ms)
- [ ] Highlight do termo de busca nos resultados

### Task 4.5 — Atalhos
- [ ] `Ctrl+P` para abrir picker rapidamente
- [ ] `N` para nova sessão dentro do picker
- [ ] Footer com legenda dos atalhos

### Task 4.6 — Status de Sessão
- [ ] Rastrear sessões ativas (busy/idle)
- [ ] Spinner no picker para sessões ativas
- [ ] Integrar com agentLoop

---

## Arquivos Impactados

| Arquivo | Mudança |
|---|---|
| `src/ui/components/sessionPicker.ts` | **NOVO** — Picker completo |
| `src/sessions/sessionStatus.ts` | **NOVO** — Status tracking |
| `src/sessions/sessionStore.ts` | **MODIFICAR** — Adicionar `searchSessions` |
| `src/chat/chat.ts` | **MODIFICAR** — Substituir `pickByArrows` por novo picker |
| `src/chat/agentLoop.ts` | **MODIFICAR** — Setar busy/idle |

---

## Referências no OpenCode

- `packages/opencode/src/cli/cmd/tui/component/dialog-session-list.tsx` → Lista com search, categorias, delete, rename
- `packages/opencode/src/cli/cmd/tui/component/dialog-session-rename.tsx` → Rename dialog
- `packages/opencode/src/cli/cmd/tui/component/dialog-session-delete-failed.tsx` → Error handling no delete
