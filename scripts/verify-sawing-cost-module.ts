import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildSawingScenarioInput,
  calculateSawingMaterial,
  calculateSawingScale,
  calculateSawingShift,
  createCurrentSawingMixRow,
  defaultSawingMaterialForm,
  defaultSawingScaleForm,
  defaultSawingShiftForm,
  mergeSawingProductOptions,
  resolveSawingScenarioName,
} from '../modules/operations-tools/model/sawing-cost'

const sourceRoot = process.cwd()
const requiredModuleFiles = [
  'modules/operations-tools/client/sawing-cost-api.ts',
  'modules/operations-tools/contracts/sawing-cost.ts',
  'modules/operations-tools/model/sawing-cost.ts',
  'modules/operations-tools/ui/SaveSawingCostPanel.tsx',
  'modules/operations-tools/ui/SawingCostCalculatorPageModule.tsx',
]
for (const path of requiredModuleFiles) assert.ok(existsSync(join(sourceRoot, path)), `运维工具领域缺少锯切成本模块文件：${path}`)

const pageSource = readFileSync(join(sourceRoot, 'modules/operations-tools/ui/SawingCostCalculatorPageModule.tsx'), 'utf8')
const registrySource = readFileSync(join(sourceRoot, 'app/components/shell/WorkspacePageRendererRegistry.tsx'), 'utf8')
assert.ok(pageSource.split('\n').length <= 420, '锯切成本协调页应保持在 420 行内')
assert.doesNotMatch(pageSource, /\bfetch\(/, '锯切成本页不得直接调用 fetch')
assert.match(pageSource, /calculateSawingMaterial\(/, '锯切成本页必须调用独立材料计算规则')
assert.match(pageSource, /loadSawingCostWorkspace\(/, '锯切成本页必须通过运维工具 client 读取数据')
assert.match(registrySource, /SawingCostCalculatorPageModule/, '锯切成本页必须通过运维工具模块公开入口加载')
assert.equal(existsSync(join(sourceRoot, 'app/components/SawingCostCalculatorPage.tsx')), false, '根组件目录不得保留锯切成本领域页')

const closeTo = (actual: number, expected: number, message: string) => {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${message}：期望 ${expected}，实际 ${actual}`)
}

const form = defaultSawingMaterialForm()
const shift = defaultSawingShiftForm()
const scale = defaultSawingScaleForm()
const material = calculateSawingMaterial(form)
assert.equal(material.quantity, 23, '默认 6 米材料应按锯缝计算出 23 件')
closeTo(material.utilization, 95.83333333333334, '材料利用率应按成品重量占比计算')
assert.ok(material.netMaterialCost < material.rawCost, '净材料成本应扣除废屑和余料回收')

const shiftResult = calculateSawingShift(form, material, shift)
assert.equal(shiftResult.laborHours, 16)
assert.equal(shiftResult.quantity, 160)
assert.equal(shiftResult.machineHours, 8)

const row = createCurrentSawingMixRow(form, material, shift, shiftResult, scale.plannedShifts)
assert.equal(row.quantity, 3200)
const scaleResult = calculateSawingScale([row], scale, shift)
closeTo(scaleResult.laborLoad, 100, '默认计划人工负荷')
closeTo(scaleResult.machineLoad, 100, '默认计划机时负荷')
closeTo(scaleResult.requiredShifts, 20, '默认计划所需班次')

const products = mergeSawingProductOptions(
  [{ id: 'material-1', sku: 'MAT-001', name: '圆管', unit: '件' }],
  [{ id: 'material-1', sku: 'MAT-001', name: '圆管新名称', unit: '件' }],
)
assert.equal(products.length, 1, '物料候选必须按 id 去重')
assert.equal(products[0].name, '圆管新名称', '后加载的物料候选应覆盖旧快照')
const name = resolveSawingScenarioName('', 'EXISTING', 'material-1', products, form, material)
assert.equal(name, 'MAT-001 圆管新名称 锯切成本')

const payload = buildSawingScenarioInput({
  name,
  productKind: 'EXISTING',
  selectedProductId: 'material-1',
  bomProductId: '',
  selectedProcessIds: ['process-1'],
  form,
  material,
  shift,
  shiftResult,
  scale,
  scaleResult,
})
assert.equal(payload.productId, 'material-1')
assert.deepEqual(payload.processTemplateIds, ['process-1'])
assert.equal(payload.costItems.length, 3)
closeTo(payload.fullCost, scaleResult.totalCost, '保存输入应使用规模总成本')

console.log('锯切成本模块验证通过：页面边界、材料/班次/规模计算、候选合并和保存输入均符合预期。')
