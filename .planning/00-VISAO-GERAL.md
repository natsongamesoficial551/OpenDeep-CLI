# 🚀 OpenDeep CLI — MVP → Produção

## Visão Geral do Projeto

**Objetivo**: Transformar a CLI OpenDeep/DeepCode de um MVP funcional mas com bugs, visual simples e sem feedback visual adequado, para uma CLI profissional de produção com experiência de uso comparável ao OpenCode.

**Identidade**: DeepCode (mantém a marca, branding e cores próprias)

**Referência Visual**: OpenCode CLI (TUI baseada em `@opentui/solid`)

---

## 📊 Análise Comparativa: OpenDeep vs OpenCode

| Aspecto | OpenDeep (Atual) | OpenCode (Referência) |
|---|---|---|
| **Rendering** | `chalk` + `console.log` direto | TUI completa (`@opentui/solid`, SolidJS, renderer 60fps) |
| **Layout** | Caixas de texto simples (`box()`) | Flexbox completo, scroll, sidebar, dialog system |
| **Spinner/Loading** | Nenhum | Componente `<Spinner>` animado com frames `⠋⠙⠹...` |
| **Task Status** | Nenhum feedback visual de progresso | Status em tempo real de cada tool call com spinner |
| **Session List** | Picker simples com setas (`pickByArrows`) | `DialogSessionList` com search, categorias por data, delete, rename |
| **Cancelar tarefa** | ESC já aborta (parcial, via `watchAbortKey`) | ESC com UX limpa e feedback visual |
| **Command Palette** | Autocomplete inline básico de `/commands` | Command palette full com categorias, keybinds, slash commands |
| **Temas** | Fixo (chalk cyan/blue/green) | Sistema de temas com dark/light mode, custom themes |
| **Footer/Status Bar** | Inexistente | Footer com directory, MCP count, LSP status, permissões |
| **Logo** | Texto "DeepCode" simples | Logo ASCII art estilizado com gradientes ANSI |
| **Error Handling** | `console.error` básico | Error boundary, toast system, error recovery |
| **Eventos** | Sistema básico (`publish/subscribe`) | Event bus completo com tipagem forte |

---

## 🐛 Inventário de Problemas Atuais

### Bugs Conhecidos
1. **Travamento ao receber erro da API** — sem recovery, CLI congela
2. **ESC não funciona de forma confiável** durante tool calls longas
3. **Raw mode conflicts** — `setRawMode` entra em conflito entre `readChatInput` e `watchAbortKey`
4. **Sessões corrompidas** — JSON parse errors sem tratamento em `loadSession`
5. **Sem feedback visual** quando agente está processando — tela parece congelada
6. **MAX_AGENT_ITERATIONS=8** sem aviso progressivo para o usuário

### Limitações de UX
1. **Sem status de progresso** — usuário não sabe o que está acontecendo
2. **Sem spinner** durante operações de IA
3. **Sem barra de status/footer** com informações do contexto
4. **Session picker rudimentar** — difícil navegar entre sessões antigas
5. **Sem toast/notificações** para erros não-fatais
6. **Visual monótono** — mesmo padrão de cores em tudo

---

## 📋 Fases de Trabalho

| Fase | Nome | Prioridade | Complexidade |
|---|---|---|---|
| 01 | [Sistema de Renderização TUI](01-TUI-RENDERING.md) | 🔴 Crítica | Alta |
| 02 | [Status & Progresso em Tempo Real](02-STATUS-PROGRESSO.md) | 🔴 Crítica | Alta |
| 03 | [Cancelamento com ESC](03-CANCELAMENTO-ESC.md) | 🔴 Crítica | Média |
| 04 | [Session Manager Profissional](04-SESSION-MANAGER.md) | 🟡 Alta | Alta |
| 05 | [Visual & Branding Profissional](05-VISUAL-BRANDING.md) | 🟡 Alta | Média |
| 06 | [Error Handling & Recovery](06-ERROR-HANDLING.md) | 🟡 Alta | Média |
| 07 | [Footer & Status Bar](07-FOOTER-STATUSBAR.md) | 🟢 Média | Baixa |
| 08 | [Command Palette Avançado](08-COMMAND-PALETTE.md) | 🟢 Média | Média |

---

## 🏗️ Estratégia de Execução

### Abordagem Incremental
Cada fase é independente e pode ser entregue sozinha. A ordem de prioridade garante que o maior impacto visual e funcional venha primeiro.

### Restrição de Tecnologia
- **Manter Node.js + TypeScript** (sem Go, sem Rust)
- **Manter chalk** como base, mas adicionar camada de abstração de rendering
- **Não adotar `@opentui/solid`** (projeto Go do OpenCode). Criar sistema próprio mais leve
- **Usar Ink (React para terminais)** ou construir rendering loop próprio com ANSI codes

### Compatibilidade
- Node.js >= 22
- Windows, macOS, Linux
- Terminais: Windows Terminal, iTerm2, Alacritty, Warp, VS Code terminal

---

## 📁 Arquivos de Planejamento

```
00-VISAO-GERAL.md          ← Este arquivo (índice mestre)
01-TUI-RENDERING.md        ← Sistema de renderização TUI
02-STATUS-PROGRESSO.md      ← Task status em tempo real
03-CANCELAMENTO-ESC.md      ← ESC para cancelar tarefa
04-SESSION-MANAGER.md       ← Navegação de sessões profissional
05-VISUAL-BRANDING.md       ← Visual, logo, cores, branding
06-ERROR-HANDLING.md        ← Tratamento de erros e recovery
07-FOOTER-STATUSBAR.md      ← Barra de status/footer
08-COMMAND-PALETTE.md       ← Command palette avançado
```

---

> [!IMPORTANT]
> Este planejamento é baseado na análise real do código-fonte do OpenDeep (`src/`) e do OpenCode (`packages/opencode/src/cli/`) — nenhuma feature foi inventada ou alucinada. Todas as referências apontam para arquivos existentes.
