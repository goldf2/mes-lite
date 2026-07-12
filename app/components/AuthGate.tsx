'use client'

import { useEffect, useState } from 'react'

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

export default function AuthGate({ children }: AuthGateProps) {
  const [operator, setOperator] = useState<CurrentOperator | null>(null)
  const [checked, setChecked] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchMe()
  }, [])

  const fetchMe = async () => {
    const res = await fetch('/api/auth/me')
    if (res.ok) {
      const data = await res.json()
      setOperator(data.data)
    }
    setChecked(true)
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setOperator(null)
    setMode('login')
  }

  if (!checked) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">加载中...</div>
  }

  if (operator) {
    return <>{children(operator, handleLogout)}</>
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
        <div className="mb-6">
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-4">
            <span className="text-white font-bold text-xl">M</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">MES-lite</h1>
          <p className="text-sm text-gray-500 mt-1">操作人员需要注册并审核通过后使用</p>
        </div>

        <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-lg mb-5">
          <button
            onClick={() => { setMode('login'); setMessage('') }}
            className={`py-2 rounded-md text-sm font-medium ${mode === 'login' ? 'bg-white shadow text-blue-700' : 'text-gray-600'}`}
          >
            登录
          </button>
          <button
            onClick={() => { setMode('register'); setMessage('') }}
            className={`py-2 rounded-md text-sm font-medium ${mode === 'register' ? 'bg-white shadow text-blue-700' : 'text-gray-600'}`}
          >
            注册
          </button>
        </div>

        {message && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${message.includes('成功') || message.includes('提交') || message.includes('自动') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message}
          </div>
        )}

        {mode === 'login' ? (
          <LoginForm onSuccess={fetchMe} onMessage={setMessage} />
        ) : (
          <RegisterForm onRegistered={() => setMode('login')} onMessage={setMessage} />
        )}

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

function LoginForm({ onSuccess, onMessage }: { onSuccess: () => void; onMessage: (msg: string) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setLoading(true)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await res.json()
    if (res.ok) {
      onMessage('登录成功')
      onSuccess()
    } else {
      onMessage(data.error || '登录失败')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">账号</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-4 py-2 border border-gray-200 rounded-lg" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">密码</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2 border border-gray-200 rounded-lg" />
      </div>
      <button onClick={submit} disabled={loading || !username || !password} className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
        {loading ? '登录中...' : '登录'}
      </button>
    </div>
  )
}

function RegisterForm({ onRegistered, onMessage }: { onRegistered: () => void; onMessage: (msg: string) => void }) {
  const [form, setForm] = useState({ username: '', password: '', name: '', phone: '' })
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setLoading(true)
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (res.ok) {
      onMessage(data.message || '注册已提交')
      setForm({ username: '', password: '', name: '', phone: '' })
      onRegistered()
    } else {
      onMessage(data.error || '注册失败')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">账号</label>
        <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" placeholder="如 lufeng 或 陆峰" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">姓名</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">手机号</label>
        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">密码</label>
        <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" />
      </div>
      <button onClick={submit} disabled={loading || !form.username || !form.password || !form.name} className="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">
        {loading ? '提交中...' : '提交注册'}
      </button>
    </div>
  )
}

export function OperatorBadge({ operator }: { operator: CurrentOperator }) {
  return (
    <div className="text-xs text-gray-500">
      {operator.name} · {roleLabels[operator.role] || operator.role}
    </div>
  )
}
