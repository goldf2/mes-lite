'use client'
import {useState} from 'react'
import {AuthFrame} from '@oaktech/web-auth/auth-frame'
import NativeLoginForm from './NativeLoginForm'
export default function NativeAdminLoginPage() {
  const [message, setMessage] = useState('')
  return <AuthFrame appName="MES Lite" settingsHref="/settings/login" title="管理员恢复登录" description="使用已有的有效 MES 管理员账号和密码。此入口不创建账号，也不改变业务权限。" actions={[{href:'/',label:'返回普通登录'}]}>
    {message && <p role="status" className="mb-4 text-sm text-red-700">{message}</p>}
    <NativeLoginForm recovery onMessage={setMessage} onSuccess={() => window.location.assign('/')} />
  </AuthFrame>
}
