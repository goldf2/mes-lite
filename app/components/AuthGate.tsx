'use client'

import { FormEvent, useEffect, useState } from 'react'
import AppLoadingIndicator from './AppLoadingIndicator'
import NativeLoginForm from '@/modules/identity-access/ui/NativeLoginForm'
import CasdoorLoginView from '@/modules/identity-access/ui/CasdoorLoginView'
import {
  loadCurrentOperator,
  loadLoginMethod,
  type PublicLoginMethod,
  loadPublicRegistrationEnabled,
  logoutOperator,
  registerOperatorAccount,
} from '@/modules/identity-access/client/authentication-api'

export interface CurrentOperator {
  id: string
  username: string
  name: string
  phone?: string
  role: 'OPERATOR' | 'AUDITOR' | 'ADMIN'
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'DISABLED'
  createdAt?: string
  approvedAt?: string
  permissions?: Record<string, {
    canRead: boolean
    canCreate: boolean
    canUpdate: boolean
    canDelete: boolean
    canGrant?: boolean
  }>
}

interface AuthGateProps {
  children: (operator: CurrentOperator, onLogout: () => void) => React.ReactNode
}

const roleLabels: Record<string, string> = {
  OPERATOR: '提交',
  AUDITOR: '审核',
  ADMIN: '管理',
}

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0'

const wechatLoginMessages: Record<string, string> = {
  not_configured: '微信登录未配置，请先在服务器环境变量中配置 AppID 和 AppSecret',
  missing_code: '微信授权返回缺少 code，请重试',
  state_invalid: '微信登录状态已失效，请重新扫码',
  pending: '微信登录已提交，请等待管理员审核',
  rejected: '该微信账号审核未通过',
  disabled: '该微信账号已停用',
  failed: '微信登录失败，请稍后重试',
}

export default function AuthGate({ children }: AuthGateProps) {
  const [operator, setOperator] = useState<CurrentOperator | null>(null)
  const [checked, setChecked] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [message, setMessage] = useState('')
  const [registrationEnabled, setRegistrationEnabled] = useState(false)
  const [loginMethod, setLoginMethod] = useState<PublicLoginMethod | null>(null)
  const [methodChecked, setMethodChecked] = useState(false)

  useEffect(() => {
    fetchMe()
    loadLoginMethod().then(method => {
      setLoginMethod(method)
      if (method.mode === 'builtin' && method.ready) loadPublicRegistrationEnabled().then(setRegistrationEnabled).catch(() => setRegistrationEnabled(false))
    }).catch(() => setLoginMethod(null)).finally(() => setMethodChecked(true))
    const params = new URLSearchParams(window.location.search)
    const casdoorStatus = params.get('casdoor_login')
    if (casdoorStatus) {
      setMessage(casdoorStatus)
      params.delete('casdoor_login')
      window.history.replaceState(null, '', window.location.pathname + (params.size ? '?' + params.toString() : ''))
    }
    const wechatStatus = params.get('wechat_login')
    if (wechatStatus) {
      setMessage(wechatLoginMessages[wechatStatus] || '微信登录失败，请重试')
      params.delete('wechat_login')
      const nextQuery = params.toString()
      const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname
      window.history.replaceState(null, '', nextUrl)
    }
  }, [])

  const fetchMe = async () => {
    try {
      setOperator(await loadCurrentOperator<CurrentOperator>())
    } catch (error) {
      setOperator(null)
    } finally {
      setChecked(true)
    }
  }

  const handleLogout = async () => {
    await logoutOperator()
    setOperator(null)
    setMode('login')
    setMessage('LOCAL_LOGOUT_COMPLETE')
    loadLoginMethod().then(setLoginMethod).catch(() => setLoginMethod(null))
  }

  if (!checked || !methodChecked) {
    return <AppLoadingIndicator fullScreen label="正在加载 MES-lite..." />
  }

  if (operator) {
    return <>{children(operator, handleLogout)}</>
  }

  if (loginMethod?.mode !== 'builtin' || !loginMethod.ready) return <CasdoorLoginView method={loginMethod} message={message} />

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
        <div className="mb-6">
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-4">
            <span className="text-white font-bold text-xl">M</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">MES-lite</h1>
          <div className="mt-1 text-xs font-medium text-gray-400">v{appVersion}</div>
          <p className="text-sm text-gray-500 mt-1">
            {registrationEnabled ? '操作人员需要注册并审核通过后使用' : '请使用管理员分配并审核通过的账号登录'}
          </p>
        </div>

        <div className={`grid ${registrationEnabled ? 'grid-cols-2' : 'grid-cols-1'} gap-2 bg-gray-100 p-1 rounded-lg mb-5`}>
          <button
            type="button"
            onClick={() => { setMode('login'); setMessage('') }}
            className={`py-2 rounded-md text-sm font-medium ${mode === 'login' ? 'bg-white shadow text-blue-700' : 'text-gray-600'}`}
          >
            登录
          </button>
          {registrationEnabled && (
            <button
              type="button"
              onClick={() => { setMode('register'); setMessage('') }}
              className={`py-2 rounded-md text-sm font-medium ${mode === 'register' ? 'bg-white shadow text-blue-700' : 'text-gray-600'}`}
            >
              注册
            </button>
          )}
        </div>

        {message && (
          <div role="status" aria-live="polite" className={`mb-4 p-3 rounded-lg text-sm ${message.includes('成功') || message.includes('提交') || message.includes('自动') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message === 'LOCAL_LOGOUT_COMPLETE' ? '已退出本站。' : message}
          </div>
        )}

        {mode === 'login' || !registrationEnabled ? (
          <NativeLoginForm onSuccess={fetchMe} onMessage={setMessage} />
        ) : (
          <RegisterForm onRegistered={() => setMode('login')} onMessage={setMessage} />
        )}

        <nav className="mt-5 flex flex-wrap gap-4 text-sm"><a href="/settings/login" className="text-blue-700 hover:underline">登录设置</a><a href="/admin-login" className="text-blue-700 hover:underline">管理员恢复登录</a></nav>

        <div className="mt-5 border-t pt-4 text-xs text-gray-500 space-y-1">
          <div>角色说明：</div>
          <div>提交：录入和提交业务内容</div>
          <div>审核：审核注册与业务内容</div>
          <div>管理：人员、权限和系统管理</div>
        </div>
      </div>
    </div>
  )
}

function RegisterForm({ onRegistered, onMessage }: { onRegistered: () => void; onMessage: (msg: string) => void }) {
  const [form, setForm] = useState({ username: '', password: '', name: '', phone: '' })
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    try {
      const data = await registerOperatorAccount(form)
      onMessage(data.message || '注册已提交')
      setForm({ username: '', password: '', name: '', phone: '' })
      onRegistered()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '注册请求失败，请检查网络或服务器状态')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div>
        <label htmlFor="register-username" className="block text-sm font-medium text-gray-700 mb-2">账号</label>
        <input id="register-username" name="username" autoComplete="username" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" placeholder="如 lufeng 或 陆峰" />
      </div>
      <div>
        <label htmlFor="register-name" className="block text-sm font-medium text-gray-700 mb-2">姓名</label>
        <input id="register-name" name="name" autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" />
      </div>
      <div>
        <label htmlFor="register-phone" className="block text-sm font-medium text-gray-700 mb-2">手机号</label>
        <input id="register-phone" name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" />
      </div>
      <div>
        <label htmlFor="register-password" className="block text-sm font-medium text-gray-700 mb-2">密码</label>
        <input id="register-password" name="password" type="password" autoComplete="new-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" />
        <p className="mt-1 text-xs text-gray-500">至少 10 位</p>
      </div>
      <button type="submit" disabled={loading || !form.username || !form.password || !form.name} className="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">
        {loading ? '提交中...' : '提交注册'}
      </button>
    </form>
  )
}

export function OperatorBadge({ operator }: { operator: CurrentOperator }) {
  return (
    <div className="text-xs text-gray-500">
      {operator.name} · {roleLabels[operator.role] || operator.role}
    </div>
  )
}
