export type ErrorCategory = 'rate-limit' | 'auth' | 'network' | 'model' | 'tool' | 'session' | 'cancelled' | 'internal'

export interface ClassifiedError {
  category: ErrorCategory
  retryable: boolean
  title: string
  message: string
  suggestedAction?: string | undefined
}

function errorText(error: unknown) {
  if (error instanceof Error) return `${error.name} ${error.message}`
  return String(error)
}

export function classifyError(error: unknown): ClassifiedError {
  const text = errorText(error)
  const lower = text.toLowerCase()

  if (/abort|cancelled|canceled/.test(lower)) {
    return { category: 'cancelled', retryable: false, title: 'Operação cancelada', message: text }
  }
  if (/\b429\b|rate.?limit|too many requests/.test(lower)) {
    return { category: 'rate-limit', retryable: true, title: 'Rate limit', message: text, suggestedAction: 'Aguarde alguns segundos e tente novamente; reduza paralelismo se persistir.' }
  }
  if (/\b401\b|\b403\b|invalid api key|unauthorized|forbidden|authentication/.test(lower)) {
    return { category: 'auth', retryable: false, title: 'Autenticação inválida', message: text, suggestedAction: 'Rode /login <provider> ou deepcode auth <provider>.' }
  }
  if (/econnrefused|etimedout|enotfound|network|fetch failed|socket|timeout/.test(lower)) {
    return { category: 'network', retryable: true, title: 'Erro de rede', message: text, suggestedAction: 'Verifique conexão/proxy/baseUrl e tente novamente.' }
  }
  if (/context length|maximum context|too many tokens|token limit|model not found|unsupported model/.test(lower)) {
    return { category: 'model', retryable: false, title: 'Erro de modelo/contexto', message: text, suggestedAction: 'Use /clear, /model ou um modelo com maior contexto.' }
  }
  if (/json.parse|unexpected token|session/.test(lower)) {
    return { category: 'session', retryable: false, title: 'Erro de sessão', message: text, suggestedAction: 'A sessão será ignorada/recuperada automaticamente quando possível.' }
  }
  if (/tool .*failed|permission denied|enoent|eacces/.test(lower)) {
    return { category: 'tool', retryable: false, title: 'Erro de ferramenta', message: text, suggestedAction: 'Veja o output da tool e ajuste permissões/caminho/comando.' }
  }
  return { category: 'internal', retryable: false, title: 'Erro interno', message: text, suggestedAction: 'Rode /doctor para diagnosticar ambiente/configuração.' }
}

export function formatClassifiedError(error: unknown) {
  const classified = classifyError(error)
  return [
    `${classified.title} [${classified.category}]`,
    classified.message,
    classified.suggestedAction ? `Ação sugerida: ${classified.suggestedAction}` : undefined,
    classified.retryable ? 'Este erro parece ser temporário/retryable.' : undefined,
  ].filter(Boolean).join('\n')
}
