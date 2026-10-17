'use client'
import {useCallback, useEffect, useState} from 'react'
import AppButton from '@/app/components/AppButton'
import {loadLoginMethod, type PublicLoginMethod} from '../client/authentication-api'
import {loadLoginSettings, type LoginSettingsDiagnostics} from '../client/login-settings-api'
export function LoginSettingsContent({method, status, message = '', loading = false, onRefresh}: {method: PublicLoginMethod|null; status: LoginSettingsDiagnostics|null; message?: string; loading?: boolean; onRefresh: () => void}) {
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-medium">当前登录方式</h2><AppButton size="sm" onClick={onRefresh} disabled={loading}>刷新状态</AppButton></div>
    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-gray-500">普通登录</dt><dd>{method?.mode === 'casdoor' ? 'Casdoor 统一账号' : method?.mode === 'builtin' ? 'MES 原有账号' : '配置不可用'}</dd></div><div><dt className="text-gray-500">配置状态</dt><dd>{method?.ready ? '已就绪' : loading ? '正在读取…' : '待管理员检查'}</dd></div></dl>
    {message && <p role="status" className="mt-4 text-sm text-gray-600">{message}</p>}
    {status && <><h3 className="mt-6 font-medium">管理员连接诊断</h3><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">{([
      ['身份服务',status.issuer],['客户端 ID',status.clientId],['应用',status.application],['身份组织',status.organization],['精确回调地址',status.callbackUrl],['客户端密钥',status.clientSecretConfigured?'已配置，内容不显示':'未配置'],
    ] as const).map(([label,value])=><div key={label}><dt className="text-gray-500">{label}</dt><dd className="break-all">{value || '未配置'}</dd></div>)}</dl><p className="mt-4 text-sm text-gray-600">配置由服务器运行环境管理。身份只关联已明确登记且有效的 MES 账号，不按邮箱自动合并或创建账号。</p></>}
    <div className="mt-6 space-y-3 text-sm"><p>管理员恢复使用已有的有效管理员账号和密码；普通登录不可用时仍可手动进入恢复入口。</p><p>退出会先结束 MES 会话，再前往身份中心退出当前浏览器的统一账号。统一账号退出未确认时可重试，身份中心会话可能仍然有效；管理员恢复登录仅退出本站。</p><nav className="flex flex-wrap gap-4"><a href="/" className="text-blue-700 hover:underline">返回 MES</a><a href="/admin-login" className="text-blue-700 hover:underline">管理员恢复登录</a>{method?.mode === 'casdoor' && method.ready && <a href="/api/auth/casdoor/login?next=%2F" className="text-blue-700 hover:underline">使用 Casdoor 登录</a>}</nav></div>
  </>
}
export default function LoginSettingsPage() {
  const [method,setMethod]=useState<PublicLoginMethod|null>(null),[status,setStatus]=useState<LoginSettingsDiagnostics|null>(null),[message,setMessage]=useState(''),[loading,setLoading]=useState(true)
  const load=useCallback(async()=>{
    setLoading(true);setMessage('');setStatus(null)
    const [publicResult,privateResult]=await Promise.allSettled([loadLoginMethod(),loadLoginSettings()])
    setMethod(publicResult.status==='fulfilled'?publicResult.value:null)
    if(privateResult.status==='fulfilled')setStatus(privateResult.value)
    else setMessage(privateResult.reason instanceof Error?privateResult.reason.message:'详细连接参数仅对管理员开放。')
    setLoading(false)
  },[])
  useEffect(()=>{void load()},[load])
  return <LoginSettingsContent method={method} status={status} message={message} loading={loading} onRefresh={()=>void load()}/>
}
