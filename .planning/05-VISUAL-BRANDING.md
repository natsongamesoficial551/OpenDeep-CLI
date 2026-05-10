# Fase 05 — Visual & Branding Profissional

## Problema Atual

O visual do OpenDeep é funcional mas genérico:
- Logo é apenas texto "DeepCode" em uma box
- Todas as caixas usam as mesmas bordas (`╭╮╰╯│─`)
- Cores fixas sem harmonia (cyan no header, blue no assistente, green no user)
- Sem identidade visual própria — parece um projeto escolar
- Sem gradientes, sem efeitos visuais

### Visual Atual

```
╭─ DeepCode ─────────────────────────────────────────╮
│ provider   anthropic • claude-4-sonnet             │
│ agent      general                                 │
│ project    OpenDeep                                │
│ session    Nova sessão (a1b2c3d4)                  │
│ hint       digite / para comandos, /exit para sair │
╰────────────────────────────────────────────────────╯
```

Tudo usa a mesma estética — sem diferenciação visual entre header, mensagens, tools, erros.

---

## Referência Visual: OpenCode

O OpenCode usa:
- **Logo ASCII art** com block characters estilizados (`█▀▀█`, `█__█`, etc.)
- **Gradientes ANSI** via cores 256-color (`\x1b[38;5;{n}m`)
- **Separação cromática** — logo em cinza escuro/branco, texto highlight em cyan
- **Background panels** com `\x1b[48;5;{n}m`
- **Sistema de temas** com dark/light mode

### Logo OpenCode (referência)

```
                   ▄     
█▀▀█ █▀▀█ █▀▀█ █▀▀▄ █▀▀▀ █▀▀█ █▀▀█ █▀▀█
█__█ █__█ █^^^ █__█ █___ █__█ █__█ █^^^
▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀~~▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀
```

---

## Solução Proposta

### Logo DeepCode ASCII Art

Criar um logo equivalente usando block characters, mantendo a identidade DeepCode:

```
          ▄                       ▄     
█▀▀▄ █▀▀▀ █▀▀▀ █▀▀█  █▀▀▀ █▀▀█ █▀▀▄ █▀▀▀
█  █ █▀▀  █▀▀  █▀▀▀  █    █  █ █  █ █▀▀ 
▀▀▀  ▀▀▀▀ ▀▀▀▀ ▀     ▀▀▀▀ ▀▀▀▀ ▀▀▀  ▀▀▀▀
      D E E P          C O D E
```

### Rendering do Logo com Gradientes

```typescript
// src/ui/components/logo.ts

const LOGO_LEFT = [
  '          ▄     ',
  '█▀▀▄ █▀▀▀ █▀▀▀ █▀▀█',
  '█  █ █▀▀  █▀▀  █▀▀▀',
  '▀▀▀  ▀▀▀▀ ▀▀▀▀ ▀   ',
]

const LOGO_RIGHT = [
  '          ▄     ',
  '█▀▀▀ █▀▀█ █▀▀▄ █▀▀▀',
  '█    █  █ █  █ █▀▀ ',
  '▀▀▀▀ ▀▀▀▀ ▀▀▀  ▀▀▀▀',
]

// Cores: "DEEP" em azul escuro/dim, "CODE" em branco/highlight
function renderLogo(): string {
  const reset = '\x1b[0m'
  const deep = {
    fg: '\x1b[38;5;24m',     // Azul escuro (Deep blue)
    shadow: '\x1b[38;5;17m', // Sombra mais escura
    bg: '\x1b[48;5;17m',
  }
  const code = {
    fg: '\x1b[38;5;51m',     // Cyan brilhante
    shadow: '\x1b[38;5;30m', // Sombra cyan
    bg: '\x1b[48;5;30m',
  }
  
  // Similar ao draw() do OpenCode (ui.ts L73-95)
  // Renderiza cada caractere com cores baseadas em marcadores (_^~)
}
```

---

## Paleta de Cores DeepCode

### Dark Mode (padrão)

```typescript
export const THEME_DARK = {
  // Primárias
  primary:       '\x1b[38;5;39m',   // #00AFFF — Azul DeepCode
  primaryBold:   '\x1b[38;5;45m',   // #00D7FF — Cyan accent
  secondary:     '\x1b[38;5;114m',  // #87D787 — Verde suave
  
  // Texto
  text:          '\x1b[38;5;252m',  // #D0D0D0 — Texto principal
  textMuted:     '\x1b[38;5;242m',  // #6C6C6C — Texto secundário
  textBold:      '\x1b[1m',         // Negrito
  
  // Semânticas
  success:       '\x1b[38;5;78m',   // #5FD787 — Verde
  warning:       '\x1b[38;5;220m',  // #FFD700 — Amarelo
  error:         '\x1b[38;5;196m',  // #FF0000 — Vermelho
  info:          '\x1b[38;5;75m',   // #5FAFFF — Azul info
  
  // Bordas
  border:        '\x1b[38;5;240m',  // Cinza médio
  borderAccent:  '\x1b[38;5;39m',   // Azul (para boxes destacados)
  
  // Backgrounds (para painéis)
  bgPanel:       '\x1b[48;5;235m',  // Fundo de painel
  bgHighlight:   '\x1b[48;5;237m',  // Fundo highlighted
  
  // Reset
  reset:         '\x1b[0m',
}
```

### Sistema de Temas

```typescript
// src/ui/theme.ts

interface Theme {
  primary: string
  primaryBold: string
  secondary: string
  text: string
  textMuted: string
  success: string
  warning: string
  error: string
  info: string
  border: string
  borderAccent: string
  bgPanel: string
  bgHighlight: string
  reset: string
}

// Detectar tema do terminal
function detectTerminalMode(): 'dark' | 'light' {
  // Checar variável de ambiente
  if (process.env.COLORFGBG) {
    const parts = process.env.COLORFGBG.split(';')
    const bg = parseInt(parts[parts.length - 1] ?? '0', 10)
    return bg > 8 ? 'light' : 'dark'
  }
  return 'dark'  // Default
}

let currentTheme: Theme = THEME_DARK

export function getTheme(): Theme { return currentTheme }
export function setTheme(theme: Theme) { currentTheme = theme }
```

---

## Redesign dos Componentes

### Header Redesenhado

```
╭─────────────────────────────────────────────────────────╮
│                                                          │
│          ▄                       ▄                       │
│  █▀▀▄ █▀▀▀ █▀▀▀ █▀▀█  █▀▀▀ █▀▀█ █▀▀▄ █▀▀▀             │
│  █  █ █▀▀  █▀▀  █▀▀▀  █    █  █ █  █ █▀▀              │
│  ▀▀▀  ▀▀▀▀ ▀▀▀▀ ▀     ▀▀▀▀ ▀▀▀▀ ▀▀▀  ▀▀▀▀             │
│                                                          │
│  provider  anthropic • claude-4-sonnet                  │
│  session   Criar projeto Next.js (a1b2c3d4)             │
│                                                          │
╰─────────────────────────────────────────────────────────╯
```

### Mensagem do Usuário

```
  ┌ You ─────────────────────────────────────────────────
  │ Crie um projeto Next.js com TypeScript e TailwindCSS
  └──────────────────────────────────────────────────────
```

Nota: borda esquerda em `chalk.green`, sem borda direita para visual mais limpo.

### Mensagem do Assistente

```
  ╭─ DeepCode ──────────────────────────────────────────
  │ Vou criar o projeto com a seguinte estrutura:
  │ 
  │ - `src/app/page.tsx` — Página principal
  │ - `src/app/layout.tsx` — Layout raiz
  │ - `tailwind.config.ts` — Configuração do Tailwind
  ╰─────────────────────────────────────────────────────
```

Nota: borda esquerda em `theme.primary`, texto com markdown rendering básico.

### Tool Call

```
  ◆ write src/app/page.tsx ─────────────── ✓ 0.2s
```

Linha única, compacta. Expandível com `/tools details`.

### Erro

```
  ╭─ ✗ Erro ────────────────────────────────────────────
  │ API rate limit exceeded. Aguarde 30s antes de tentar
  │ novamente.
  │ 
  │ Provider: anthropic  Model: claude-4-sonnet
  ╰─────────────────────────────────────────────────────
```

Borda em `theme.error`, ícone `✗`.

---

## Tarefas de Implementação

### Task 5.1 — Logo ASCII Art
- [ ] Criar arrays de caracteres para "DEEP" e "CODE"
- [ ] Implementar `renderLogo()` com gradientes ANSI
- [ ] Marcadores de shadow (`_^~`) como no OpenCode
- [ ] Centralizar no terminal

### Task 5.2 — Sistema de Temas
- [ ] Definir interface `Theme`
- [ ] Implementar `THEME_DARK` com paleta DeepCode
- [ ] Implementar `THEME_LIGHT` (opcional, prioridade menor)
- [ ] `detectTerminalMode()` baseado em env vars
- [ ] `getTheme()` / `setTheme()` global

### Task 5.3 — Migrar Cores
- [ ] Substituir chamadas `chalk.cyan/blue/green` hardcoded por `theme.primary/secondary/success`
- [ ] Atualizar `chatRenderer.ts` para usar tema
- [ ] Atualizar `terminal.ts` para usar tema

### Task 5.4 — Redesign dos Componentes Visuais
- [ ] Header com logo e informações compactas
- [ ] User bubble com borda esquerda simples
- [ ] Assistant bubble com borda accent
- [ ] Tool call como linha compacta
- [ ] Error box com destaque vermelho

### Task 5.5 — Markdown Rendering Básico
- [ ] Bold (`**text**`) → `chalk.bold`
- [ ] Inline code (`` `code` ``) → `chalk.bgGray`
- [ ] Heading (`# Title`) → `chalk.bold.underline`
- [ ] Lista (`- item`) → indentação com bullet

### Task 5.6 — Testes Visuais
- [ ] Snapshot tests do logo
- [ ] Snapshot tests de cada componente com tema dark
- [ ] Verificar largura correta em diferentes tamanhos de terminal

---

## Arquivos Impactados

| Arquivo | Mudança |
|---|---|
| `src/ui/components/logo.ts` | **NOVO** — Logo ASCII art com gradientes |
| `src/ui/theme.ts` | **NOVO** — Sistema de temas |
| `src/ui/chatRenderer.ts` | **MODIFICAR** — Usar tema, redesign de bubbles |
| `src/ui/terminal.ts` | **MODIFICAR** — `box()` usa tema |
| `src/chat/chat.ts` | **MODIFICAR** — `renderHeader()` usa logo novo |

---

## Referências no OpenCode

- `packages/opencode/src/cli/logo.ts` → Arrays de caracteres para logo
- `packages/opencode/src/cli/ui.ts` L15-30 → Style constants (escape codes)
- `packages/opencode/src/cli/ui.ts` L49-105 → Função `logo()` com gradientes e shadows
- `packages/opencode/src/cli/cmd/tui/component/logo.tsx` → Logo component renderizado
