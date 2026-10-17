'use client'
import {AuthFrame} from '@oaktech/web-auth/auth-frame'
import type {PublicLoginMethod} from '../client/authentication-api'
import AppButton from '@/app/components/AppButton'
const loginMessages: Record<string, string> = {
  CASDOOR_BINDING_REQUIRED: '身份登录已完成，请联系管理员将此身份关联到已有的有效 MES 账号。',
  OPERATOR_NOT_ACTIVE: '关联的 MES 账号当前不可用，请联系管理员。',
  LOGIN_EXPIRED: '登录请求已过期，请重新登录。',
  LOGIN_CONFIGURATION_CHANGED: '登录配置已变更，请重新登录。',
  CASDOOR_LOGIN_FAILED: '统一账号登录未完成，请重试。',
  LOCAL_LOGOUT_COMPLETE: '已退出登录。',
  PROVIDER_LOGOUT_PENDING: '正在退出统一账号…',
  PROVIDER_LOGOUT_COMPLETE: '已退出 MES 和当前浏览器的统一账号。',
  PROVIDER_LOGOUT_UNCONFIRMED: 'MES 已退出，但统一账号退出未完成。请重试；身份中心会话可能仍然有效。',
}
export default function CasdoorLoginView({method, message = '', onRetryLogout}: {method: PublicLoginMethod|null; message?: string; onRetryLogout?: () => void}) {
  const ready = method?.mode === 'casdoor' && method.ready
  const pending = message === 'PROVIDER_LOGOUT_PENDING'
  const signedOut = message.endsWith('LOGOUT_COMPLETE') || message === 'PROVIDER_LOGOUT_UNCONFIRMED'
  const waiting = message === 'CASDOOR_BINDING_REQUIRED' || message === 'OPERATOR_NOT_ACTIVE'
  return <AuthFrame appName="MES Lite" settingsHref="/settings/login" title={waiting ? '等待业务账号关联' : ready ? '统一账号登录' : '登录暂不可用'} description={ready ? '使用统一身份登录，业务访问仍按已有 MES 账号权限开放。' : '登录配置暂不可用，请联系管理员核对。'} actions={[
    ...(ready && !pending ? [{href: '/api/auth/casdoor/login?next=%2F', label: signedOut ? '重新登录' : '使用 Casdoor 登录', primary: true}] : []),
    {href: '/admin-login', label: '管理员恢复登录'},
  ]}>{message && <p role="status">{loginMessages[message] || '登录未完成，请重新登录。'}</p>}{message === 'PROVIDER_LOGOUT_UNCONFIRMED' && onRetryLogout && <AppButton onClick={onRetryLogout}>重试退出统一账号</AppButton>}</AuthFrame>
}
