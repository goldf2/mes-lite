import type { WorkspaceFunctionKey } from '@/lib/workspace'

const defaultWorkspaceUrl = 'https://fix.xiangshu.me/workspaces/local/default'

const definitions = [
  { key: 'dataCustomers', label: '客户档案', path: '/data/customers', groupKey: 'customerData', groupLabel: '客户管理', resource: 'customers', icon: '客', description: '打开数据平台的正式客户档案、详情和维护页面' },
  { key: 'dataContacts', label: '联系人管理', path: '/data/contacts', groupKey: 'customerData', groupLabel: '客户管理', resource: 'customers', icon: '联', description: '打开统一联系人清单，查询和维护姓名、电话及客户归属' },
  { key: 'dataSites', label: '客户地点', path: '/data/sites', groupKey: 'customerData', groupLabel: '客户管理', resource: 'customers', icon: '址', description: '打开客户的实际地址、地点和坐标资料' },
  { key: 'dataDevices', label: '客户设备', path: '/devices', groupKey: 'customerService', groupLabel: '客户服务', resource: 'equipment', icon: '设', description: '打开数据平台客户设备档案；与本厂生产设备台账分别管理' },
  { key: 'dataDeviceModels', label: '客户设备型号', path: '/data/models', groupKey: 'customerService', groupLabel: '客户服务', resource: 'equipment', icon: '型', description: '打开客户设备的型号和技术规格资料' },
  { key: 'dataInstallations', label: '客户安装记录', path: '/data/installations', groupKey: 'customerService', groupLabel: '客户服务', resource: 'equipment', icon: '装', description: '打开客户设备的安装记录及实际地点关联' },
  { key: 'dataCustomerMap', label: '客户地图', path: '/data/customers?map=1&layers=customers', groupKey: 'businessAnalysis', groupLabel: '经营分析', resource: 'customers', icon: '图', description: '打开数据平台客户清单及右侧地图，显示同一份客户和地点资料' },
  { key: 'dataDeviceMap', label: '客户设备地图', path: '/devices?map=1&layers=devices', groupKey: 'businessAnalysis', groupLabel: '经营分析', resource: 'equipment', icon: '景', description: '打开客户设备与地图视图；此入口不表示 MES 订单统计已经接入' },
] as const

export interface DataPlatformFunction {
  key: WorkspaceFunctionKey
  label: string
  groupKey: string
  groupLabel: string
  resource: string
  icon: string
  description: string
  externalHref: string
  sourceLabel: string
}

/** Only navigation crosses applications. The destination retains its own login and business authorization. */
export function buildDataPlatformFunctions(configuredUrl: string | undefined): DataPlatformFunction[] {
  const value = configuredUrl === undefined ? defaultWorkspaceUrl : configuredUrl.trim()
  if (!value) return []
  let workspace: URL
  try { workspace = new URL(value) } catch { return [] }
  if (workspace.protocol !== 'https:' || workspace.username || workspace.password || workspace.search || workspace.hash
    || !/^\/workspaces\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/?$/.test(workspace.pathname)) return []
  const basePath = workspace.pathname.replace(/\/$/, '')
  return definitions.map(({ path, ...definition }) => {
    const destination = new URL('/login', workspace.origin)
    // The explicit local next preserves the exact feature through the target's existing Casdoor login.
    destination.searchParams.set('next', `${basePath}${path}`)
    return { ...definition, externalHref: destination.toString(), sourceLabel: '数据平台' }
  })
}
