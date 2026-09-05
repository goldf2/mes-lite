import { defineResourceSearchCatalog, resourceAdvancedFields, resourceKeywordProfile } from '@/lib/resource-search'
import type { ProcessRoute, ProcessRouteForm, ProcessStepForm, ProcessTemplate, ProcessTemplateForm } from '../contracts/production-engineering'

export const processCategoryOptions = [
  ['SAWING', '锯切'], ['DRILLING', '钻孔'], ['TURNING', '车削'], ['MILLING', '铣削'], ['GRINDING', '磨削'],
  ['HEAT_TREATMENT', '热处理'], ['SURFACE_TREATMENT', '表面处理'], ['ASSEMBLY', '装配'], ['INSPECTION', '检验'], ['OTHER', '其他'],
] as const

export const processCategoryLabel: Record<string, string> = Object.fromEntries(processCategoryOptions)

export const emptyProcessTemplateForm = (): ProcessTemplateForm => ({
  code: '', name: '', category: 'SAWING', defaultTime: 0, workstation: '', description: '', materialIds: [],
  standardBatchQty: 1000, setupTimeMinutes: 0, cycleTimeSeconds: 0, peopleCount: 1, laborRatePerHour: 0,
  machineCount: 1, machineRatePerHour: 0, energyCostPerHour: 0, consumableCostPerBatch: 0, yieldRate: 100,
})

export const emptyProcessStep = (): ProcessStepForm => ({
  stepNo: 1, name: '', defaultTime: 0, workstation: '', workCenterId: '', description: '', templateId: '', templateCode: '',
  standardBatchQty: 1000, setupTimeMinutes: 0, cycleTimeSeconds: 0, peopleCount: 1, laborRatePerHour: 0,
  machineCount: 1, machineRatePerHour: 0, energyCostPerHour: 0, consumableCostPerBatch: 0, yieldRate: 1,
})

export const emptyProcessRouteForm = (): ProcessRouteForm => ({ productId: '', name: '', isDefault: true, steps: [emptyProcessStep()] })

export function processCostPerThousand(template: ProcessTemplate | ProcessStepForm) {
  const batches = 1000 / Math.max(1, template.standardBatchQty)
  const runHours = (1000 / Math.max(0.000001, template.yieldRate)) * template.cycleTimeSeconds / 3600
  const setupHours = template.setupTimeMinutes / 60 * batches
  const laborHours = (runHours + setupHours) * template.peopleCount
  const machineHours = (runHours + setupHours) * template.machineCount
  const cost = laborHours * template.laborRatePerHour + machineHours * template.machineRatePerHour + runHours * template.energyCostPerHour + batches * template.consumableCostPerBatch
  return { laborHours, machineHours, cost }
}

export function routeCostPerThousand(route: ProcessRoute) {
  return route.steps.reduce((sum, step) => {
    const value = processCostPerThousand(step)
    return { laborHours: sum.laborHours + value.laborHours, machineHours: sum.machineHours + value.machineHours, cost: sum.cost + value.cost }
  }, { laborHours: 0, machineHours: 0, cost: 0 })
}

export const displayMaterialCode = (code?: string | null) => code || ''

export const processTemplateSearchCatalog = defineResourceSearchCatalog<ProcessTemplate>('process-template.default', [
  { key: 'code', label: '编码', type: 'text', read: (item) => item.code, weight: 10, operators: ['equals', 'startsWith'] },
  { key: 'name', label: '名称', type: 'text', read: (item) => item.name, weight: 8 },
  { key: 'category', label: '类别', type: 'select', read: (item) => [item.category, processCategoryLabel[item.category]], options: processCategoryOptions.map(([value, label]) => ({ value, label })) },
  { key: 'workstation', label: '工位', type: 'text', read: (item) => item.workstation },
  { key: 'materials', label: '关联物料', type: 'text', read: (item) => item.materials.flatMap((material) => [material.code, material.name]) },
])
export const processTemplateSearchProfile = resourceKeywordProfile(processTemplateSearchCatalog)
export const processTemplateAdvancedFields = resourceAdvancedFields(processTemplateSearchCatalog)

export const processRouteSearchCatalog = defineResourceSearchCatalog<ProcessRoute>('process-route.default', [
  { key: 'material', label: '物料', type: 'text', read: (item) => [item.material?.code || item.product?.sku, item.material?.name || item.product?.name], weight: 10 },
  { key: 'name', label: '路线名称', type: 'text', read: (item) => item.name, weight: 8 },
  { key: 'steps', label: '工序', type: 'text', read: (item) => item.steps.flatMap((step) => [step.name, step.workstation, step.description]) },
  { key: 'default', label: '默认路线', type: 'select', read: (item) => item.isDefault ? ['yes', '是'] : ['no', '否'], options: [{ value: 'yes', label: '是' }, { value: 'no', label: '否' }] },
  { key: 'stepCount', label: '工序数量', type: 'number', read: (item) => item.steps.length },
])
export const processRouteSearchProfile = resourceKeywordProfile(processRouteSearchCatalog)
export const processRouteAdvancedFields = resourceAdvancedFields(processRouteSearchCatalog)
