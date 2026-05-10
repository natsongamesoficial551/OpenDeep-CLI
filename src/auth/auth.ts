import readline from 'node:readline/promises'
import { spawn } from 'node:child_process'
import { stdin as input, stdout as output } from 'node:process'
import { ProviderConfig } from '../types.js'
import { getSecret, setSecret } from '../security/secrets.js'

const OPENAI_AUTH_BASE_URL = process.env.CODEX_OAUTH_ISSUER_BASE_URL ?? 'https://auth.openai.com'
const CODEX_CLIENT_ID = process.env.CODEX_OAUTH_CLIENT_ID ?? 'app_EMoamEEZ73f0CkXaXp7hrann'
const DEVICE_CODE_TIMEOUT_MS = 15 * 60_000
const DEVICE_CODE_DEFAULT_INTERVAL_MS = 5_000
const DEVICE_CODE_MIN_INTERVAL_MS = 1_000
const DEVICE_CALLBACK_URL = `${OPENAI_AUTH_BASE_URL}/deviceauth/callback`
const OAUTH_REFRESH_SKEW_MS = 30_000

function oauthTokenEndpoint() {
  return process.env.CODEX_OAUTH_TOKEN_ENDPOINT ?? process.env.OPENAI_OAUTH_TOKEN_ENDPOINT ?? `${OPENAI_AUTH_BASE_URL}/oauth/token`
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function expiresAtFrom(expiresIn?: unknown) {
  const n = Number(expiresIn)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Date.now() + (n * 1000)
}

function headers(contentType: string) {
  return {
    'content-type': contentType,
    accept: 'application/json',
    originator: 'deepcode',
    'user-agent': 'deepcode',
  }
}

function parseJsonObject(text: string) {
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function cleanErrorText(value: string) {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim()
}

function formatOAuthError(prefix: string, status: number, bodyText: string) {
  const body = parseJsonObject(bodyText)
  const error = typeof body.error === 'string' ? body.error : undefined
  const description = typeof body.error_description === 'string' ? body.error_description : undefined
  if (error && description) return `${prefix}: ${error} (${description})`
  if (error) return `${prefix}: ${error}`
  const safeBody = cleanErrorText(bodyText)
  return safeBody ? `${prefix}: HTTP ${status} ${safeBody}` : `${prefix}: HTTP ${status}`
}

function normalizePositiveMilliseconds(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.trunc(value * 1000)
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const seconds = Number.parseInt(value.trim(), 10)
    return seconds > 0 ? seconds * 1000 : undefined
  }
}

function normalizeTokenLifetimeSeconds(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.trunc(value)
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number.parseInt(value.trim(), 10)
}

function parseJwtPayload(token: string | null | undefined) {
  if (!token) return undefined
  const parts = token.split('.')
  if (parts.length < 2 || !parts[1]) return undefined
  try {
    const parsed = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

function nestedRecord(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function parseChatgptAccountId(token: string | null | undefined) {
  const payload = parseJwtPayload(token)
  const auth = nestedRecord(payload, 'https://api.openai.com/auth')
  return stringValue(auth?.chatgpt_account_id)
    ?? stringValue(payload?.['https://api.openai.com/auth.chatgpt_account_id'])
    ?? stringValue(payload?.chatgpt_account_id)
}

async function exchangeCodexIdTokenForApiKey(idToken: string) {
  const data = await postTokenForm({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    client_id: CODEX_CLIENT_ID,
    requested_token: 'openai-api-key',
    subject_token: idToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
  })
  const apiKey = typeof data.access_token === 'string' ? data.access_token : ''
  if (!apiKey) throw new Error('Token exchange Codex não retornou openai-api-key.')
  return apiKey
}

function openBrowser(url: string) {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
    return true
  }
  if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
    return true
  }
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
  return true
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type CodexDeviceCode = {
  deviceAuthId: string
  userCode: string
  verificationUrl: string
  intervalMs: number
}

type CodexAuthorization = {
  authorizationCode: string
  codeVerifier: string
}

type TokenResponse = {
  access_token: string
  refresh_token?: string
  id_token?: string
  expires_in?: number
}

async function requestCodexDeviceCode(): Promise<CodexDeviceCode> {
  const response = await fetch(`${OPENAI_AUTH_BASE_URL}/api/accounts/deviceauth/usercode`, {
    method: 'POST',
    headers: headers('application/json'),
    body: JSON.stringify({ client_id: CODEX_CLIENT_ID }),
  })
  const bodyText = await response.text()
  if (!response.ok) throw new Error(formatOAuthError('Falha ao solicitar device code OpenAI/Codex', response.status, bodyText))
  const body = parseJsonObject(bodyText)
  const deviceAuthId = typeof body.device_auth_id === 'string' ? body.device_auth_id : ''
  const userCode = typeof body.user_code === 'string' ? body.user_code : (typeof body.usercode === 'string' ? body.usercode : '')
  if (!deviceAuthId || !userCode) throw new Error('Resposta OpenAI/Codex inválida: device_auth_id/user_code ausente.')
  return {
    deviceAuthId,
    userCode,
    verificationUrl: `${OPENAI_AUTH_BASE_URL}/codex/device`,
    intervalMs: normalizePositiveMilliseconds(body.interval) ?? DEVICE_CODE_DEFAULT_INTERVAL_MS,
  }
}

function nextPollDelay(intervalMs: number, deadlineMs: number) {
  const remainingMs = Math.max(0, deadlineMs - Date.now())
  return Math.min(Math.max(intervalMs, DEVICE_CODE_MIN_INTERVAL_MS), remainingMs)
}

async function pollCodexDeviceCode(deviceCode: CodexDeviceCode): Promise<CodexAuthorization> {
  const deadline = Date.now() + DEVICE_CODE_TIMEOUT_MS
  while (Date.now() < deadline) {
    const response = await fetch(`${OPENAI_AUTH_BASE_URL}/api/accounts/deviceauth/token`, {
      method: 'POST',
      headers: headers('application/json'),
      body: JSON.stringify({
        device_auth_id: deviceCode.deviceAuthId,
        user_code: deviceCode.userCode,
      }),
    })
    const bodyText = await response.text()
    if (response.ok) {
      const body = parseJsonObject(bodyText)
      const authorizationCode = typeof body.authorization_code === 'string' ? body.authorization_code : ''
      const codeVerifier = typeof body.code_verifier === 'string' ? body.code_verifier : ''
      if (!authorizationCode || !codeVerifier) throw new Error('Autorização OpenAI/Codex inválida: authorization_code/code_verifier ausente.')
      return { authorizationCode, codeVerifier }
    }
    if (response.status === 403 || response.status === 404) {
      await sleep(nextPollDelay(deviceCode.intervalMs, deadline))
      continue
    }
    throw new Error(formatOAuthError('Falha na autorização device code OpenAI/Codex', response.status, bodyText))
  }
  throw new Error('Tempo do login OAuth OpenAI/Codex expirou após 15 minutos.')
}

async function exchangeCodexDeviceCode(authorization: CodexAuthorization): Promise<TokenResponse> {
  const response = await fetch(oauthTokenEndpoint(), {
    method: 'POST',
    headers: headers('application/x-www-form-urlencoded'),
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: authorization.authorizationCode,
      redirect_uri: DEVICE_CALLBACK_URL,
      client_id: CODEX_CLIENT_ID,
      code_verifier: authorization.codeVerifier,
    }),
  })
  const bodyText = await response.text()
  if (!response.ok) throw new Error(formatOAuthError('Falha ao trocar device code por token OpenAI/Codex', response.status, bodyText))
  const body = parseJsonObject(bodyText)
  const accessToken = typeof body.access_token === 'string' ? body.access_token : ''
  const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : ''
  const idToken = typeof body.id_token === 'string' ? body.id_token : ''
  if (!accessToken || !refreshToken) throw new Error('Troca OAuth OpenAI/Codex não retornou access_token/refresh_token.')
  const expiresIn = normalizeTokenLifetimeSeconds(body.expires_in)
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    ...(idToken ? { id_token: idToken } : {}),
    ...(expiresIn !== undefined ? { expires_in: expiresIn } : {}),
  }
}

async function persistOauthTokens(tokens: TokenResponse) {
  let apiKey: string | undefined
  if (tokens.id_token) {
    try {
      apiKey = await exchangeCodexIdTokenForApiKey(tokens.id_token)
    } catch {}
  }
  const backend = await setSecret('CODEX_OAUTH_TOKEN', tokens.access_token)
  if (apiKey) await setSecret('CODEX_API_KEY_TOKEN', apiKey)
  if (tokens.refresh_token) await setSecret('CODEX_OAUTH_REFRESH_TOKEN', tokens.refresh_token)
  if (tokens.id_token) await setSecret('CODEX_OAUTH_ID_TOKEN', tokens.id_token)
  const accountId = parseChatgptAccountId(tokens.id_token) ?? parseChatgptAccountId(tokens.access_token)
  if (accountId) await setSecret('CODEX_ACCOUNT_ID', accountId)
  const expiresAt = expiresAtFrom(tokens.expires_in)
  if (expiresAt) await setSecret('CODEX_OAUTH_EXPIRES_AT', String(expiresAt))
  return backend
}

export async function configureCodexOAuth() {
  const deviceCode = await requestCodexDeviceCode()
  const opened = openBrowser(deviceCode.verificationUrl)

  output.write(`\nLogin OAuth OpenAI/Codex\n`)
  output.write(`Abra este link e confirme o login: ${deviceCode.verificationUrl}\n`)
  output.write(`Código: ${deviceCode.userCode}\n`)
  if (!opened) output.write('Não foi possível abrir o navegador automaticamente.\n')

  const authorization = await pollCodexDeviceCode(deviceCode)
  const token = await exchangeCodexDeviceCode(authorization)
  const backend = await persistOauthTokens(token)
  return `OAuth concluído. Token salvo com segurança em ${backend} (CODEX_OAUTH_TOKEN).`
}

async function postTokenForm(payload: Record<string, string>) {
  const response = await fetch(oauthTokenEndpoint(), {
    method: 'POST',
    headers: headers('application/x-www-form-urlencoded'),
    body: new URLSearchParams(payload),
  })
  const bodyText = await response.text()
  if (!response.ok) throw new Error(formatOAuthError('Falha no OAuth', response.status, bodyText))
  return parseJsonObject(bodyText)
}

async function refreshCodexOAuthToken(refreshToken: string) {
  const data = await postTokenForm({
    grant_type: 'refresh_token',
    client_id: CODEX_CLIENT_ID,
    refresh_token: refreshToken,
  })

  const accessToken = typeof data.access_token === 'string' ? data.access_token : ''
  if (!accessToken) throw new Error('Refresh OAuth inválido: access_token ausente.')
  const nextRefreshToken = typeof data.refresh_token === 'string' ? data.refresh_token : refreshToken
  const idToken = typeof data.id_token === 'string' ? data.id_token : await getSecret('CODEX_OAUTH_ID_TOKEN') ?? undefined
  const expiresIn = normalizeTokenLifetimeSeconds(data.expires_in)

  const payload: TokenResponse = { access_token: accessToken, refresh_token: nextRefreshToken }
  if (idToken) payload.id_token = idToken
  if (expiresIn !== undefined) payload.expires_in = expiresIn
  await persistOauthTokens(payload)
  return accessToken
}

export async function getCodexOAuthAccessToken() {
  const token = await getSecret('CODEX_OAUTH_TOKEN')
  const expiresAtRaw = await getSecret('CODEX_OAUTH_EXPIRES_AT')
  const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : NaN

  if (token && (!Number.isFinite(expiresAt) || Date.now() < (expiresAt - OAUTH_REFRESH_SKEW_MS))) {
    return token
  }

  const refreshToken = await getSecret('CODEX_OAUTH_REFRESH_TOKEN')
  if (!refreshToken) return token

  try {
    return await refreshCodexOAuthToken(refreshToken)
  } catch (error) {
    if (token) return token
    throw new Error(`Não foi possível renovar o token OAuth: ${toErrorMessage(error)}`)
  }
}

export async function getCodexOAuthCredentials() {
  const accessToken = await getCodexOAuthAccessToken()
  let apiKey = await getSecret('CODEX_API_KEY_TOKEN')
  const idToken = await getSecret('CODEX_OAUTH_ID_TOKEN')
  if (!apiKey && idToken) {
    try {
      apiKey = await exchangeCodexIdTokenForApiKey(idToken)
      await setSecret('CODEX_API_KEY_TOKEN', apiKey)
    } catch {}
  }
  const accountId = await getSecret('CODEX_ACCOUNT_ID') ?? parseChatgptAccountId(idToken) ?? parseChatgptAccountId(accessToken)
  if (accountId) await setSecret('CODEX_ACCOUNT_ID', accountId)
  return { accessToken, apiKey: apiKey ?? accessToken, accountId }
}

async function askHidden(question: string) {
  if (!process.stdin.isTTY) {
    const rl = readline.createInterface({ input, output })
    try {
      return await rl.question(question)
    } finally {
      rl.close()
    }
  }

  return new Promise<string>((resolve) => {
    const stdin = process.stdin
    const stdout = process.stdout
    let value = ''

    stdout.write(question)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    const onData = (char: string) => {
      if (char === '\u0003') {
        stdout.write('\n')
        stdin.setRawMode(false)
        stdin.off('data', onData)
        resolve('')
        return
      }
      if (char === '\r' || char === '\n') {
        stdout.write('\n')
        stdin.setRawMode(false)
        stdin.off('data', onData)
        resolve(value)
        return
      }
      if (char === '\u007f' || char === '\b') {
        value = value.slice(0, -1)
        return
      }
      value += char
    }

    stdin.on('data', onData)
  })
}

export async function configureApiKey(provider: ProviderConfig) {
  if (provider.id === 'codex-oauth') {
    return configureCodexOAuth()
  }
  if (!provider.apiKeyEnv) return `${provider.name} não usa API key configurável neste adapter.`
  const key = await askHidden(`Cole a API key para ${provider.name} (${provider.apiKeyEnv}): `)
  if (!key.trim()) return 'Configuração cancelada.'
  const backend = await setSecret(provider.apiKeyEnv, key.trim())
  return `API key salva com segurança em ${backend} para ${provider.apiKeyEnv}.`
}
