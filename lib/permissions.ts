import { NextResponse } from 'next/server'
import { prisma } from './prisma'
import { getCurrentOperator } from './auth'

export const permissionRoles = [
  { key: 'OPERATOR', label: '录入' },
  { key: 'AUDITOR', label: '审核' },
  { key: 'ADMIN', label: '管理' },
] as const

export const permissionActions = [
  { key: 'canRead', label: '查' },
  { key: 'canCreate', label: '增' },
  { key: 'canUpdate', label: '改' },
  { key: 'canDelete', label: '归档' },
  { key: 'canGrant', label: '授权' },
] as const

export const permissionResources = [
  { key: 'dashboard', label: '仪表盘' },
  { key: 'aiAssistant', label: 'AI 协作助手' },
  { key: 'orders', label: '生产订单' },
  { key: 'materials', label: '物料管理' },
  { key: 'workInstructions', label: '产品文档' },
  { key: 'equipment', label: '设备管理' },
  { key: 'materialIn', label: '来料管理' },
  { key: 'dispatch', label: '派工管理' },
  { key: 'stocks', label: '库存管理' },
  { key: 'salesOrder', label: '销售订单' },
  { key: 'shipment', label: '发货管理' },
  { key: 'return', label: '退货管理' },
  { key: 'stats', label: '统计分析' },
  { key: 'flowTransfers', label: '流程转移' },
  { key: 'quality', label: '质量任务查看' },
  { key: 'qualityDecision', label: '质量判定' },
  { key: 'qualityDisposition', label: '复检、返工与报废处置' },
  { key: 'qualityRelease', label: '让步与解冻放行' },
  { key: 'productionOrderRelease', label: '生产订单发布' },
  { key: 'productionActualEntry', label: '生产实绩草稿登记' },
  { key: 'productionActualConfirm', label: '生产实绩确认过账' },
  { key: 'productionActualReverse', label: '生产实绩冲销' },
  { key: 'sawingCost', label: '锯切成本' },
  { key: 'scanPrint', label: '扫码打单' },
  { key: 'bom', label: 'BOM 结构与版本' },
  { key: 'bomCost', label: 'BOM 成本' },
  { key: 'suppliers', label: '供应商资料' },
  { key: 'customers', label: '客户资料' },
  { key: 'employees', label: '员工资料' },
  { key: 'locations', label: '库位配置' },
  { key: 'units', label: '单位配置' },
  { key: 'documentCategories', label: '文档类别' },
  { key: 'workCenters', label: '工作中心' },
  { key: 'processTemplates', label: '加工工艺' },
  { key: 'processRoutes', label: '物料路线' },
  { key: 'businessSettings', label: '企业与业务规则' },
  { key: 'displaySettings', label: '显示设置' },
  { key: 'navigationSettings', label: '导航与工作区' },
  { key: 'aiSettings', label: 'AI 服务配置' },
  { key: 'archive', label: '归档记录' },
  { key: 'auditLogs', label: '操作记录' },
  { key: 'dataTools', label: '数据工具' },
  { key: 'operators', label: '人员管理' },
  { key: 'system', label: '旧系统管理（升级兼容）' },
  { key: 'permissionUsers', label: '人员权限控制' },
  { key: 'permissionGroups', label: '组权限控制' },
  { key: 'permissions', label: '旧权限管理（升级兼容）' },
  { key: 'attachments', label: '原始单据附件' },
] as const

export const permissionResourceSections = [
  { key: 'common', label: '公共入口', resources: ['dashboard', 'aiAssistant', 'attachments'] },
  { key: 'production', label: '生产、质量与统计', resources: ['orders', 'productionOrderRelease', 'productionActualEntry', 'productionActualConfirm', 'productionActualReverse', 'dispatch', 'flowTransfers', 'stats', 'quality', 'qualityDecision', 'qualityDisposition', 'qualityRelease'] },
  { key: 'engineering', label: '物料、工艺与设备', resources: ['materials', 'bom', 'bomCost', 'workInstructions', 'documentCategories', 'equipment', 'units', 'workCenters', 'processTemplates', 'processRoutes', 'sawingCost', 'scanPrint'] },
  { key: 'fulfillment', label: '来料、库存与销售', resources: ['materialIn', 'stocks', 'salesOrder', 'shipment', 'return', 'suppliers', 'customers', 'locations'] },
  { key: 'administration', label: '人员、配置与运维', resources: ['employees', 'operators', 'businessSettings', 'displaySettings', 'navigationSettings', 'aiSettings', 'archive', 'auditLogs', 'dataTools', 'permissionUsers', 'permissionGroups'] },
  { key: 'legacy', label: '升级兼容资源', resources: ['system', 'permissions'] },
] as const

export function permissionResourceSection(resource: string) {
  return permissionResourceSections.find((section) => (section.resources as readonly string[]).includes(resource))?.label || '其他'
}

export type PermissionRole = (typeof permissionRoles)[number]['key']
export type PermissionResource = (typeof permissionResources)[number]['key']
export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'grant'
export type PermissionSubject = { id?: string; role: string }

export type PermissionFlags = {
  canRead: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  canGrant: boolean
}

export type PermissionMap = Record<string, PermissionFlags>

const allOn: PermissionFlags = { canRead: true, canCreate: true, canUpdate: true, canDelete: true, canGrant: true }
const readOnly: PermissionFlags = { canRead: true, canCreate: false, canUpdate: false, canDelete: false, canGrant: false }
const readCreate: PermissionFlags = { canRead: true, canCreate: true, canUpdate: false, canDelete: false, canGrant: false }
const readCreateUpdate: PermissionFlags = { canRead: true, canCreate: true, canUpdate: true, canDelete: false, canGrant: false }
const none: PermissionFlags = { canRead: false, canCreate: false, canUpdate: false, canDelete: false, canGrant: false }

const operatorDefaults: PermissionMap = {
  dashboard: readOnly,
  aiAssistant: readOnly,
  orders: readCreate,
  materials: readOnly,
  workInstructions: readOnly,
  equipment: readOnly,
  materialIn: readCreate,
  dispatch: readCreate,
  stocks: readOnly,
  salesOrder: readCreate,
  shipment: readCreate,
  return: readCreate,
  stats: readCreateUpdate,
  flowTransfers: readCreateUpdate,
  quality: none,
  qualityDecision: none,
  qualityDisposition: none,
  qualityRelease: none,
  productionOrderRelease: none,
  productionActualEntry: none,
  productionActualConfirm: none,
  productionActualReverse: none,
  sawingCost: readCreate,
  scanPrint: readCreateUpdate,
  bom: readCreate,
  bomCost: none,
  suppliers: none,
  customers: none,
  employees: none,
  locations: none,
  units: none,
  documentCategories: readOnly,
  workCenters: none,
  processTemplates: none,
  processRoutes: none,
  businessSettings: none,
  displaySettings: none,
  navigationSettings: none,
  aiSettings: none,
  archive: none,
  auditLogs: none,
  dataTools: none,
  operators: none,
  system: none,
  permissionUsers: none,
  permissionGroups: none,
  permissions: none,
  attachments: readCreate,
}

const auditorDefaults: PermissionMap = {
  dashboard: readOnly,
  aiAssistant: readOnly,
  orders: readCreateUpdate,
  materials: readOnly,
  workInstructions: readCreateUpdate,
  equipment: readCreateUpdate,
  materialIn: readCreateUpdate,
  dispatch: readCreateUpdate,
  stocks: { canRead: true, canCreate: false, canUpdate: true, canDelete: false, canGrant: false },
  salesOrder: readCreateUpdate,
  shipment: readCreateUpdate,
  return: readCreateUpdate,
  stats: readCreateUpdate,
  flowTransfers: readCreateUpdate,
  quality: readCreateUpdate,
  qualityDecision: readCreateUpdate,
  qualityDisposition: readCreateUpdate,
  qualityRelease: readCreateUpdate,
  productionOrderRelease: readCreateUpdate,
  productionActualEntry: readCreateUpdate,
  productionActualConfirm: readCreateUpdate,
  productionActualReverse: readCreateUpdate,
  sawingCost: readCreateUpdate,
  scanPrint: readCreateUpdate,
  bom: readCreateUpdate,
  bomCost: none,
  suppliers: none,
  customers: none,
  employees: none,
  locations: none,
  units: none,
  documentCategories: readCreateUpdate,
  workCenters: none,
  processTemplates: none,
  processRoutes: none,
  businessSettings: none,
  displaySettings: none,
  navigationSettings: none,
  aiSettings: none,
  archive: none,
  auditLogs: none,
  dataTools: none,
  operators: { canRead: true, canCreate: false, canUpdate: true, canDelete: false, canGrant: false },
  system: none,
  permissionUsers: none,
  permissionGroups: none,
  permissions: none,
  attachments: readCreate,
}

export const defaultPermissionMap: Record<PermissionRole, PermissionMap> = {
  OPERATOR: operatorDefaults,
  AUDITOR: auditorDefaults,
  ADMIN: Object.fromEntries(permissionResources.map((resource) => [resource.key, allOn])),
}

function flags(value: string): PermissionFlags {
  return {
    canRead: value.includes('R'),
    canCreate: value.includes('C'),
    canUpdate: value.includes('U'),
    canDelete: value.includes('A'),
    canGrant: value.includes('G'),
  }
}

function permissionPreset(values: Record<string, string>): PermissionMap {
  return Object.fromEntries(permissionResources.map((resource) => [
    resource.key,
    flags(values[resource.key] || ''),
  ]))
}

export const defaultPermissionGroups = [
  { code: 'basic_entry', name: '基础录入组', description: '兼容旧版录入角色的权限组；新账号优先使用基础访问组和岗位组。', settings: operatorDefaults },
  { code: 'business_audit', name: '业务审核组', description: '兼容旧版审核角色的权限组；新账号应按岗位分配独立命令权限。', settings: auditorDefaults },
  { code: 'base_access', name: '基础访问组', description: '所有正式账号的公共只读入口，不包含业务写入。', settings: permissionPreset({ dashboard: 'R', aiAssistant: 'R', materials: 'R', bom: 'R', workInstructions: 'R', equipment: 'R', attachments: 'R' }) },
  { code: 'production_executor', name: '生产执行组', description: '操作工查看任务、登记实绩草稿、扫码和流程转移；不发布、不确认过账、不冲销。', settings: permissionPreset({ orders: 'R', productionActualEntry: 'U', dispatch: 'R', flowTransfers: 'RCU', stocks: 'R', equipment: 'R', scanPrint: 'RCU' }) },
  { code: 'production_lead', name: '生产管理组', description: '班组长和生产主管发布订单、确认实绩并执行受控冲销。', settings: permissionPreset({ orders: 'RCUA', productionOrderRelease: 'U', productionActualEntry: 'UA', productionActualConfirm: 'U', productionActualReverse: 'U', dispatch: 'RCUA', flowTransfers: 'RCU', stats: 'R', stocks: 'R', employees: 'R', locations: 'R', workCenters: 'R', scanPrint: 'RCU' }) },
  { code: 'warehouse_executor', name: '仓库作业组', description: '仓管员处理来料、收发退、移库、库存和扫码作业。', settings: permissionPreset({ materials: 'R', materialIn: 'RCU', stocks: 'RU', shipment: 'RU', return: 'RU', flowTransfers: 'RCU', locations: 'R', scanPrint: 'RCU' }) },
  { code: 'warehouse_lead', name: '仓库管理组', description: '仓库主管在仓库作业基础上维护库位和受控归档。', settings: permissionPreset({ materials: 'R', materialIn: 'RCUA', stocks: 'RU', shipment: 'RU', return: 'RU', flowTransfers: 'RCU', suppliers: 'R', locations: 'RCUA', scanPrint: 'RCU' }) },
  { code: 'quality_inspector', name: '质量检验组', description: '质检员查看质量任务并记录客观判定；不自动获得返工报废或授权放行。', settings: permissionPreset({ materials: 'R', workInstructions: 'R', quality: 'R', qualityDecision: 'U', orders: 'R', materialIn: 'RU', stocks: 'R', return: 'R' }) },
  { code: 'quality_disposition', name: '质量处置组', description: '质量工程师执行复检、返工和报废，不自动获得让步或解冻放行。', settings: permissionPreset({ quality: 'R', qualityDisposition: 'U', orders: 'R', stocks: 'R', return: 'R' }) },
  { code: 'quality_release', name: '质量授权放行组', description: '质量负责人执行让步与解冻放行，应限制为少量经批准人员。', settings: permissionPreset({ quality: 'R', qualityRelease: 'U', orders: 'R', stocks: 'R', return: 'R' }) },
  { code: 'process_engineer', name: '工艺技术组', description: '工艺与 BOM 工程师维护物料、BOM、工艺、单位和技术文档。', settings: permissionPreset({ materials: 'RCU', bom: 'RCUA', workInstructions: 'RCU', documentCategories: 'R', units: 'RCUA', workCenters: 'RCUA', processTemplates: 'RCUA', processRoutes: 'RCUA', sawingCost: 'RCU' }) },
  { code: 'production_planner', name: '生产计划组', description: '计划员建立和发布生产订单、安排派工；不确认现场实绩或冲销库存。', settings: permissionPreset({ orders: 'RCUA', productionOrderRelease: 'U', dispatch: 'RCU', flowTransfers: 'R', stats: 'R', materials: 'R', bom: 'R', equipment: 'R', materialIn: 'R', stocks: 'R', salesOrder: 'R', suppliers: 'R', units: 'R', workCenters: 'R', processTemplates: 'R', processRoutes: 'R' }) },
  { code: 'equipment_maintenance', name: '设备维护组', description: '设备管理员维护设备台账并读取工作中心和技术文档。', settings: permissionPreset({ equipment: 'RCUA', workCenters: 'R', workInstructions: 'R' }) },
  { code: 'document_control', name: '文档管理组', description: '文控人员维护产品文档、类别、版本和附件。', settings: permissionPreset({ workInstructions: 'RCUA', documentCategories: 'RCUA', attachments: 'RCUA' }) },
  { code: 'sales_fulfillment', name: '销售发运组', description: '销售、跟单与发运人员维护客户、订单、发货和退货。', settings: permissionPreset({ materials: 'R', stocks: 'R', salesOrder: 'RCUA', shipment: 'RCUA', return: 'RCUA', suppliers: 'RCU', customers: 'RCU' }) },
  { code: 'personnel_manager', name: '人员管理组', description: '人事与账号审核人员维护员工档案和账号状态，不获得业务权限。', settings: permissionPreset({ employees: 'RCUA', operators: 'RU' }) },
  { code: 'permission_admin', name: '权限管理员组', description: '指定安全管理员维护人员赋权和权限组，不自动获得业务或系统维护能力。', settings: permissionPreset({ operators: 'R', permissionUsers: 'RUG', permissionGroups: 'RCUAG' }) },
  { code: 'system_admin', name: '系统管理组', description: '系统内置管理权限组，默认拥有全部功能权限。', settings: defaultPermissionMap.ADMIN },
] as const

export const permissionResourceLegacySources: Partial<Record<PermissionResource, PermissionResource>> = {
  flowTransfers: 'stats',
  bom: 'bomCost',
  suppliers: 'system',
  customers: 'system',
  employees: 'system',
  locations: 'system',
  units: 'system',
  documentCategories: 'workInstructions',
  workCenters: 'system',
  processTemplates: 'system',
  processRoutes: 'system',
  businessSettings: 'system',
  displaySettings: 'system',
  navigationSettings: 'system',
  aiSettings: 'system',
  archive: 'system',
  auditLogs: 'system',
  dataTools: 'system',
}

const actionField: Record<PermissionAction, keyof PermissionFlags> = {
  read: 'canRead',
  create: 'canCreate',
  update: 'canUpdate',
  delete: 'canDelete',
  grant: 'canGrant',
}

function cloneFlags(flags: PermissionFlags): PermissionFlags {
  return {
    canRead: flags.canRead,
    canCreate: flags.canCreate,
    canUpdate: flags.canUpdate,
    canDelete: flags.canDelete,
    canGrant: flags.canGrant,
  }
}

export function defaultFlagsFor(role: string, resource: string): PermissionFlags {
  const typedRole = permissionRoles.some((item) => item.key === role) ? (role as PermissionRole) : 'OPERATOR'
  return cloneFlags(defaultPermissionMap[typedRole][resource] || none)
}

let ensureDefaultPermissionsPromise: Promise<void> | null = null

async function insertMissingDefaultPermissions() {
  const savedRoleSettings = await prisma.permissionSetting.findMany()
  const savedRoleKeys = new Set(savedRoleSettings.map((setting) => `${setting.role}:${setting.resource}`))
  const savedRoleSettingByKey = new Map(savedRoleSettings.map((setting) => [`${setting.role}:${setting.resource}`, setting]))
  const missingRoleSettings = permissionRoles.flatMap((role) => permissionResources
    .filter((resource) => !savedRoleKeys.has(`${role.key}:${resource.key}`))
    .map((resource) => {
      const legacyResource = permissionResourceLegacySources[resource.key]
      const inherited = legacyResource ? savedRoleSettingByKey.get(`${role.key}:${legacyResource}`) : null
      return {
        role: role.key,
        resource: resource.key,
        ...(inherited ? cloneFlags(inherited) : defaultFlagsFor(role.key, resource.key)),
      }
    }))
  if (missingRoleSettings.length > 0) await prisma.permissionSetting.createMany({ data: missingRoleSettings })

  for (const group of defaultPermissionGroups) {
    const existingGroup = await prisma.permissionGroup.findUnique({
      where: { code: group.code },
      include: { settings: true },
    })
    const savedGroup = await prisma.permissionGroup.upsert({
      where: { code: group.code },
      create: {
        code: group.code,
        name: group.name,
        description: group.description,
        isSystem: true,
      },
      update: {
        name: group.name,
        description: group.description,
        isSystem: true,
      },
    })

    const savedGroupSettings = await prisma.permissionGroupSetting.findMany({
      where: { groupId: savedGroup.id },
      select: { resource: true },
    })
    const savedResources = new Set(savedGroupSettings.map((setting) => setting.resource))
    const existingSettingByResource = new Map(existingGroup?.settings.map((setting) => [setting.resource, setting]))
    const missingGroupSettings = permissionResources
      .filter((resource) => !savedResources.has(resource.key))
      .map((resource) => {
        const legacyResource = permissionResourceLegacySources[resource.key]
        const inherited = existingGroup && legacyResource ? existingSettingByResource.get(legacyResource) : null
        return {
          groupId: savedGroup.id,
          resource: resource.key,
          ...(inherited ? cloneFlags(inherited) : (group.settings[resource.key] || none)),
        }
      })
    if (missingGroupSettings.length > 0) await prisma.permissionGroupSetting.createMany({ data: missingGroupSettings })
  }

  const builtinCodes = new Set<string>(defaultPermissionGroups.map((group) => group.code))
  const customGroups = await prisma.permissionGroup.findMany({
    where: { code: { notIn: Array.from(builtinCodes) } },
    include: { settings: true },
  })
  for (const group of customGroups) {
    const settingByResource = new Map(group.settings.map((setting) => [setting.resource, setting]))
    const missingSettings = permissionResources.flatMap((resource) => {
      if (settingByResource.has(resource.key)) return []
      const legacyResource = permissionResourceLegacySources[resource.key]
      const inherited = legacyResource ? settingByResource.get(legacyResource) : null
      return [{
        groupId: group.id,
        resource: resource.key,
        ...(inherited ? cloneFlags(inherited) : cloneFlags(none)),
      }]
    })
    if (missingSettings.length > 0) await prisma.permissionGroupSetting.createMany({ data: missingSettings })
  }

  const savedOverrides = await prisma.operatorPermissionOverride.findMany()
  const overrideByKey = new Map(savedOverrides.map((override) => [`${override.operatorId}:${override.resource}`, override]))
  const inheritedOverrides = savedOverrides.flatMap((override) => permissionResources.flatMap((resource) => {
    if (permissionResourceLegacySources[resource.key] !== override.resource) return []
    if (overrideByKey.has(`${override.operatorId}:${resource.key}`)) return []
    return [{ operatorId: override.operatorId, resource: resource.key, ...cloneFlags(override) }]
  }))
  if (inheritedOverrides.length > 0) await prisma.operatorPermissionOverride.createMany({ data: inheritedOverrides })
}

export async function ensureDefaultPermissions() {
  if (!ensureDefaultPermissionsPromise) {
    ensureDefaultPermissionsPromise = insertMissingDefaultPermissions().catch((error) => {
      ensureDefaultPermissionsPromise = null
      throw error
    })
  }
  return ensureDefaultPermissionsPromise
}

export async function getRolePermissionMap(role: string): Promise<PermissionMap> {
  await ensureDefaultPermissions()
  const settings = await prisma.permissionSetting.findMany({ where: { role } })
  const map: PermissionMap = {}

  for (const resource of permissionResources) {
    map[resource.key] = defaultFlagsFor(role, resource.key)
  }

  for (const setting of settings) {
    map[setting.resource] = {
      canRead: setting.canRead,
      canCreate: setting.canCreate,
      canUpdate: setting.canUpdate,
      canDelete: setting.canDelete,
      canGrant: setting.canGrant,
    }
  }

  return map
}

export async function getEffectivePermissionMap(subject: PermissionSubject | string): Promise<PermissionMap> {
  const current = typeof subject === 'string' ? { role: subject } : subject
  const map: PermissionMap = {}

  for (const resource of permissionResources) {
    map[resource.key] = cloneFlags(none)
  }

  if (current.role === 'ADMIN') {
    return getRolePermissionMap('ADMIN')
  }

  if (!current.id) return getRolePermissionMap(current.role)

  const validResources = new Set<string>(permissionResources.map((resource) => resource.key))
  const groupLinks = await prisma.operatorPermissionGroup.findMany({
    where: { operatorId: current.id },
    include: { group: { include: { settings: true } } },
  })

  if (groupLinks.length === 0) {
    Object.assign(map, await getRolePermissionMap(current.role))
  }

  for (const link of groupLinks) {
    for (const setting of link.group.settings) {
      if (!validResources.has(setting.resource)) continue
      const currentFlags = map[setting.resource] || cloneFlags(none)
      map[setting.resource] = {
        canRead: currentFlags.canRead || setting.canRead,
        canCreate: currentFlags.canCreate || setting.canCreate,
        canUpdate: currentFlags.canUpdate || setting.canUpdate,
        canDelete: currentFlags.canDelete || setting.canDelete,
        canGrant: currentFlags.canGrant || setting.canGrant,
      }
    }
  }

  const overrides = await prisma.operatorPermissionOverride.findMany({
    where: { operatorId: current.id },
  })

  for (const override of overrides) {
    if (!validResources.has(override.resource)) continue
    map[override.resource] = {
      canRead: override.canRead,
      canCreate: override.canCreate,
      canUpdate: override.canUpdate,
      canDelete: override.canDelete,
      canGrant: override.canGrant,
    }
  }

  return map
}

export async function hasResourcePermission(subject: PermissionSubject | string, resource: PermissionResource, action: PermissionAction) {
  const current = typeof subject === 'string' ? { role: subject } : subject
  if (current.role === 'ADMIN') return true
  const permissions = await getEffectivePermissionMap(current)
  return Boolean(permissions[resource]?.[actionField[action]])
}

export async function hasAnyResourcePermission(subject: PermissionSubject | string, resources: PermissionResource[], action: PermissionAction) {
  const current = typeof subject === 'string' ? { role: subject } : subject
  if (current.role === 'ADMIN') return true
  const permissions = await getEffectivePermissionMap(current)
  return resources.some((resource) => Boolean(permissions[resource]?.[actionField[action]]))
}

export async function requireResourcePermission(resource: PermissionResource, action: PermissionAction) {
  const current = await getCurrentOperator()
  if (!current || !(await hasResourcePermission(current, resource, action))) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }
  return null
}

export async function requireAnyResourcePermission(resources: PermissionResource[], action: PermissionAction) {
  const current = await getCurrentOperator()
  if (!current || !(await hasAnyResourcePermission(current, resources, action))) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }
  return null
}
