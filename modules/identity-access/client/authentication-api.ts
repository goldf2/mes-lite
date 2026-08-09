async function readJson(response: Response, fallback: string) {
  const payload = await response.json().catch(() => ({})) as { data?: unknown; error?: string; message?: string }
  if (!response.ok) throw new Error(payload.error || fallback)
  return payload
}

export async function loadCurrentOperator<T>() {
  const response = await fetch('/api/auth/me')
  if (!response.ok) return null
  return (await readJson(response, '读取当前账号失败')).data as T
}

export async function logoutOperator() {
  await readJson(await fetch('/api/auth/logout', { method: 'POST' }), '退出登录失败')
}

export async function loginOperator(input: { username: string; password: string }) {
  await readJson(await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }), '登录失败')
}

export async function registerOperatorAccount(input: { username: string; password: string; name: string; phone: string }) {
  return readJson(await fetch('/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }), '注册失败')
}

export async function loadWeChatLoginEnabled() {
  const response = await fetch('/api/auth/wechat/status')
  if (!response.ok) return false
  const payload = await response.json() as { data?: { enabled?: boolean } }
  return Boolean(payload.data?.enabled)
}
