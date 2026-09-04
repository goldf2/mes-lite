# Debug 记录

## BUG-20260904-01：绑定物料的锯切成本未出现在物料全景

- 状态：已修复待生产验证
- 优先级：P1
- 首次发现：2026-09-04 CST
- 最近更新：2026-09-04 12:17 CST
- 关联版本：v0.1.454

### 现象与复现

- 在锯切成本工具保存成本对象并关联已有物料，但不选择加入 BOM。
- 保存事务成功，`SawingCostScenario.materialId` 和来源成本对象都存在。
- 打开该物料全景时，成本对象区域没有这条锯切成本。

### 根因

物料全景只查 `CostObject.sourceType = MATERIAL/sourceId = material.id`，或经 BOM 明细反向关联的成本对象。锯切成本为保留计算来源而使用 `sourceType = SAWING_COST_SCENARIO/sourceId = scenario.id`，因此绑定物料但未加入 BOM 的合法记录被漏查。

### 修改

- `modules/materials/server/material-panorama-query-service.ts`：先取该物料的锯切方案 ID，再把对应来源成本对象并入全景查询。
- `modules/operations-tools/ui/SawingCostCalculatorPageModule.tsx`：保存默认优先关联已有物料。
- `modules/operations-tools/ui/SaveSawingCostPanel.tsx`：明确物料关联和可选草稿 BOM 关联语义。
- `modules/materials/ui/material-panorama/MaterialPanoramaOperationsModules.tsx`：显示中文锯切加工成本类型和单件成本字段。

### 回归验证

- `npm run verify:cost-domain-services`：先用新增断言复现失败，修复后通过；同时验证 BOM 项同时保存 `costObjectId` 与 `sawingScenarioId`，发布 BOM 不变并派生唯一草稿版本。
- 其余静态与领域验证见 `CURRENT_STATE.md`。
- 用户确认：待生产部署后确认。
- 剩余风险：生产环境真实页面与数据写入尚未验收。
