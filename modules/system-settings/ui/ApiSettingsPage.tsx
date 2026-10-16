'use client'

import { useCallback, useEffect, useState } from 'react'
import AppButton from '@/app/components/AppButton'
import type { DirectoryDiagnostics } from '@/modules/platform-integration'
import { loadBusinessDirectoryDiagnostics } from '../client/business-directory-api'
import SystemSettingsPageShell from './SystemSettingsPageShell'

export default function ApiSettingsPage({ onMessage }: { onMessage: (message: string) => void }) {
  const [status, setStatus] = useState<DirectoryDiagnostics | null>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    setStatus(null)
    try { setStatus(await loadBusinessDirectoryDiagnostics()) }
    catch (error) { onMessage(error instanceof Error ? error.message : '读取 API 接入状态失败') }
    finally { setLoading(false) }
  }, [onMessage])
  useEffect(() => { void load() }, [load])
  return (
    <SystemSettingsPageShell resourceKey="apiSettings" title="API 接入" description="查看客户目录的只读接口、来源范围与委托状态。">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">企业业务目录</h2>
        <AppButton size="sm" onClick={() => void load()} disabled={loading}>刷新状态</AppButton>
      </div>
      {loading && <p className="mt-4 text-sm text-gray-500">正在读取接入状态…</p>}
      {status && <>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-gray-500">服务状态</dt><dd>{status.ready ? '就绪' : status.enabled ? '配置待完成' : '未启用'}</dd></div>
          <div><dt className="text-gray-500">访问密钥</dt><dd>{status.credentialConfigured ? '已配置（不显示内容）' : '未配置或格式无效'}</dd></div>
          <div><dt className="text-gray-500">委托账号</dt><dd>{status.delegate.active ? '有效' : '未配置、已停用或不存在'}；客户资料读取{status.delegate.canReadCustomers ? '允许' : '不允许'}</dd></div>
          <div><dt className="text-gray-500">接口规范</dt><dd>{status.schemaVersion}</dd></div>
          <div><dt className="text-gray-500">委托有效期</dt><dd>{status.expiresAt || '未配置'}{status.expired ? '（已过期）' : ''}</dd></div>
        </dl>
        {status.source && <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-gray-500">来源实例</dt><dd className="break-all">{status.source.instanceId}</dd></div>
          <div><dt className="text-gray-500">来源企业标签</dt><dd className="break-all">{status.source.tenantId}</dd></div>
          <div><dt className="text-gray-500">来源空间标签</dt><dd className="break-all">{status.source.workspaceId}</dd></div>
        </dl>}
        <p className="mt-4 text-sm text-gray-600">来源标签由部署配置明确指定；MES 当前仍是独立单实例数据库，不代表库中已有企业／空间隔离模型。</p>
        <div className="mt-5 space-y-3">{status.resources.map((resource) => <article key={resource.resource} className="rounded-lg border border-gray-200 p-3">
          <h3 className="font-medium">{({ enterprises: '企业（客户资料）', contacts: '联系人（原客户联系字段）', locations: '地点（原客户地址）' })[resource.resource]}</h3>
          <code className="mt-2 block break-all text-xs">GET {resource.path}</code>
          <p className="mt-2 text-sm text-gray-500">查询：q、enterpriseId、limit（1–100）、offset；返回 records 与分页信息。</p>
        </article>)}</div>
        <p className="mt-4 text-sm text-gray-600">仅提供来源投影：不自动合并客户，不新增、修改或删除记录；联系人未拆成独立档案，地址没有坐标时返回空坐标。服务端每次检查委托人员当前的客户资料读取权限。</p>
        {status.missingConfiguration.length > 0 && <p className="mt-3 break-all text-sm text-amber-700">待配置：{status.missingConfiguration.join('、')}</p>}
      </>}
    </SystemSettingsPageShell>
  )
}
