import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  configurableWorkspaceFunctionKeys,
  createDefaultWorkspaceNavigationConfig,
  enabledNavigationWorkspaces,
  navigationWorkspaceIds,
  normalizeWorkspaceNavigationConfig,
  workspaceNavigationGroupKeys,
  workspaceContainsFunction,
  workspaceFunctionLabel,
  workspaceOwnerOfFunction,
} from '../lib/workspace-navigation-config'

const defaults = createDefaultWorkspaceNavigationConfig()
assert.equal(workspaceContainsFunction(defaults, 'mes', 'orders'), true)
assert.equal(workspaceContainsFunction(defaults, 'mes', 'dispatch'), true)
assert.equal(workspaceContainsFunction(defaults, 'mes', 'bomUsage'), true)
assert.equal(workspaceContainsFunction(defaults, 'mes', 'salesOrders'), true)
assert.equal(workspaceContainsFunction(defaults, 'mes', 'shipment'), true)
assert.equal(workspaceContainsFunction(defaults, 'mes', 'helpCenter'), true, '帮助中心必须在 MES 工作区可见')
assert.equal(workspaceContainsFunction(defaults, 'mes', 'equipmentInspections'), true, '设备点检必须在 MES 工作区可见')
assert.equal(workspaceContainsFunction(defaults, 'mes', 'equipmentMaintenance'), true, '设备维保必须在 MES 工作区可见')
assert.deepEqual(enabledNavigationWorkspaces(defaults), ['mes'])
assert.deepEqual(defaults.moduleButtons, {
  mes: { visible: true, label: 'MES-lite' },
  mrp: { visible: true, label: 'MRP' },
  erp: { visible: true, label: 'ERP' },
})
for (const functionKey of configurableWorkspaceFunctionKeys) {
  const owners = navigationWorkspaceIds.filter((workspace) => workspaceContainsFunction(defaults, workspace, functionKey))
  assert.deepEqual(owners, ['mes'], `${functionKey} 必须统一归入 MES 工作台`)
}
for (const workspace of navigationWorkspaceIds) {
  assert.deepEqual(defaults.workspaces[workspace].groupOrder, workspaceNavigationGroupKeys)
}

const configured = normalizeWorkspaceNavigationConfig({
  defaultWorkspace: 'erp',
  moduleButtons: {
    mes: { visible: false, label: '制造中心' },
    mrp: { visible: false, label: '物料计划' },
    erp: { visible: true, label: '经营协同' },
  },
  workspaces: {
    mes: { enabled: true, items: [{ functionKey: 'orders', label: '生产任务' }] },
    mrp: {
      enabled: true,
      groupOrder: ['system', 'materials'],
      items: [{ functionKey: 'orders', label: '计划订单' }, { functionKey: 'bomUsage', label: '物料用量' }],
    },
    erp: {
      enabled: true,
      items: [
        { functionKey: 'orders', label: '生产订单' },
        { functionKey: 'orders', label: '重复项' },
        { functionKey: 'salesOrders', label: '客户订单' },
      ],
    },
  },
})

assert.equal(workspaceFunctionLabel(configured, 'mes', 'orders', '生产订单'), '生产任务')
assert.equal(workspaceFunctionLabel(configured, 'mes', 'bomUsage', 'BOM 用量'), '物料用量')
assert.equal(workspaceFunctionLabel(configured, 'mes', 'salesOrders', '销售订单'), '客户订单')
assert.equal(workspaceOwnerOfFunction(configured, 'orders'), 'mes', '旧配置必须收敛到统一 MES 工作台')
assert.equal(workspaceOwnerOfFunction(configured, 'bomUsage'), 'mes', '旧 MRP 页面必须合并到 MES 工作台')
assert.equal(workspaceOwnerOfFunction(configured, 'salesOrders'), 'mes', '旧 ERP 页面必须合并到 MES 工作台')
assert.equal(workspaceContainsFunction(configured, 'mes', 'materialManagement'), true, '缺失的新增页面必须按系统默认归属补回')
assert.equal(configured.workspaces.mrp.enabled, false)
assert.equal(configured.workspaces.erp.enabled, false)
assert.deepEqual(configured.moduleButtons, {
  mes: { visible: true, label: '制造中心' },
  mrp: { visible: false, label: '物料计划' },
  erp: { visible: true, label: '经营协同' },
})
assert.deepEqual(configured.workspaces.mrp.items, [])
assert.deepEqual(configured.workspaces.erp.items, [])
assert.equal(new Set(configured.workspaces.mes.groupOrder).size, workspaceNavigationGroupKeys.length, '一级菜单顺序必须自动补齐且不重复')

const allDisabled = normalizeWorkspaceNavigationConfig({
  defaultWorkspace: 'erp',
  workspaces: {
    mes: { enabled: false, items: [] },
    mrp: { enabled: false, items: [] },
    erp: { enabled: false, items: [] },
  },
})
assert.deepEqual(enabledNavigationWorkspaces(allDisabled), ['mes'])
assert.equal(allDisabled.defaultWorkspace, 'mes')

const root = process.cwd()
const shellSource = readFileSync(join(root, 'app/HomeApp.tsx'), 'utf8')
const applicationNavigationSource = readFileSync(join(root, 'app/components/shell/useApplicationNavigationController.tsx'), 'utf8')
const settingsSource = readFileSync(join(root, 'modules/system-settings/ui/WorkspaceNavigationSettings.tsx'), 'utf8')
const routeSource = readFileSync(join(root, 'app/api/system/workspace-navigation/route.ts'), 'utf8')
const moduleButtonsSource = readFileSync(join(root, 'app/components/navigation/CapabilityModuleButtons.tsx'), 'utf8')
assert.equal((shellSource.match(/<WorkspaceDomainTabs/g) || []).length, 0, '应用壳不得再显示 MES/MRP/ERP 工作区切换')
assert.equal((shellSource.match(/<CapabilityModuleButtons/g) || []).length, 3, '标准管理、画布工作和移动菜单必须显示共享模块按钮')
assert.equal((shellSource.match(/onOpenHome=\{\(\) => navigateToTab\('dashboard'\)\}/g) || []).length, 3, '三种外壳槽位的主模块按钮必须统一返回仪表盘首页')
assert.match(shellSource, /data-navigation-workspace=\{activeWorkspace\}/, '应用壳必须暴露当前工作区状态')
assert.doesNotMatch(shellSource, /生产系统 · v\{appVersion\}/, '模块按钮必须替代原产品名和版本副标题')
assert.equal((shellSource.match(/系统版本 v\{appVersion\}/g) || []).length, 2, '桌面侧栏与移动菜单必须在左下角显示系统版本')
assert.match(moduleButtonsSource, /disabled=\{!active\}/, 'MRP/ERP 预留按钮必须禁止切换')
assert.match(moduleButtonsSource, /onClick=\{active \? onOpenHome : undefined\}/, 'MES-lite 主模块按钮必须提供返回首页动作')
assert.doesNotMatch(moduleButtonsSource, /onChange/, '模块按钮不得携带工作区切换动作')
assert.match(applicationNavigationSource, /configuredGroupOrder/, '桌面侧栏、顶部导航和移动菜单必须读取工作区一级菜单顺序')
assert.match(applicationNavigationSource, /navigationGroups\.sort/, '账号与权限必须与其他统一一级菜单一起参与排序')
assert.doesNotMatch(settingsSource, /所属工作区/, '配置页不得再要求 MES/MRP/ERP 页面归属')
assert.match(settingsSource, /统一 MES 工作台/, '配置页必须说明混合系统的统一导航边界')
assert.match(settingsSource, /顶部模块按钮/, '配置页必须允许管理预留模块按钮')
assert.match(settingsSource, /按钮名称/, '配置页必须允许修改模块按钮名称')
assert.match(settingsSource, /仅预留展示，不启用独立工作区/, '配置页必须明确预留按钮不启用工作区')
assert.match(settingsSource, /一级菜单顺序/, '配置页必须允许调整当前工作区一级菜单顺序')
assert.match(settingsSource, /账号与权限/, '一级菜单顺序必须覆盖账号与权限入口')
assert.match(settingsSource, /显示名称留空时使用系统名称/, '配置页必须说明页面显示名称的继承规则')
assert.match(settingsSource, /内部页面 ID、路由、权限和业务数据/, '配置页必须说明重命名不会改变内部语义')
assert.match(routeSource, /requireResourcePermission\('navigationSettings', 'update'\)/, '发布工作区配置必须受导航设置更新权限保护')
assert.match(routeSource, /moduleButtons: z\.object/, '接口必须校验模块按钮配置')
assert.match(routeSource, /workspaceNavigationGroupKeys/, '接口必须校验一级菜单顺序')

console.log('统一 MES 工作台、主模块返回首页、可配置预留模块按钮、历史三工作区配置合并、菜单顺序与别名验证通过')
