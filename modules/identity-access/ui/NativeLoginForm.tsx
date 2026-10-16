'use client'

import {FormEvent, useEffect, useState} from 'react'
import {loadWeChatLoginEnabled, loginOperator, loginNativeAdministrator} from '../client/authentication-api'

export default function NativeLoginForm({ onSuccess, onMessage, recovery = false }: { onSuccess: () => void; onMessage: (msg: string) => void; recovery?: boolean }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [wechatEnabled, setWechatEnabled] = useState(false)
  const [wechatChecked, setWechatChecked] = useState(false)

  useEffect(() => {
    if (recovery) return
    loadWeChatLoginEnabled()
      .then(setWechatEnabled)
      .catch(() => setWechatEnabled(false))
      .finally(() => setWechatChecked(true))
  }, [recovery])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    try {
      await (recovery ? loginNativeAdministrator : loginOperator)({ username, password })
      onMessage('登录成功')
      onSuccess()
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '登录请求失败，请检查网络或服务器状态')
    } finally {
      setPassword('')
      setLoading(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div>
        <label htmlFor="login-username" className="block text-sm font-medium text-gray-700 mb-2">账号</label>
        <input id="login-username" name="username" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-4 py-2 border border-gray-200 rounded-lg" />
      </div>
      <div>
        <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-2">密码</label>
        <input id="login-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2 border border-gray-200 rounded-lg" />
      </div>
      <button type="submit" disabled={loading || !username || !password} className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
        {loading ? '登录中...' : recovery ? '管理员登录' : '登录'}
      </button>
      {!recovery && <><div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-xs text-gray-400">或</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          if (!wechatEnabled) {
            onMessage('微信登录未配置，请先在服务器环境变量中配置 AppID 和 AppSecret')
            return
          }
          window.location.href = '/api/auth/wechat/login'
        }}
        disabled={!wechatChecked}
        className={`w-full px-4 py-3 rounded-lg font-medium transition ${
          wechatEnabled
            ? 'bg-green-600 text-white hover:bg-green-700'
            : 'bg-gray-100 text-gray-400'
        } disabled:opacity-50`}
      >
        {wechatChecked ? (wechatEnabled ? '微信扫码登录' : '微信登录未配置') : '检查微信登录配置...'}
      </button></>}
    </form>
  )
}
