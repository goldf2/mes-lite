# Debug 记录

## BUG-20260905-01：兼容 MAT- 编码混列及改码关联失效

- 时间：2026-09-05 12:00 CST；状态：源码及定向回归通过，待生产数据执行与用户验收。
- 现象：选择器出现 Material.code 与 MAT-Product.sku 两套编码；工艺/BOM 查询可能因改码或真实 MAT- 前缀混淆身份。
- 根因：Product 创建另加前缀、复用不补 materialId、改码不联动，显示/扫码又无条件去前缀。
- 修复：Material.code 为唯一业务编码，Product 保留 ID 并显式绑定；跨领域复用身份查询，锯切选项仅主档；维护工具预览和执行兼容编码统一；目标占用/歧义不猜测。
- 回归：旧扫码实现先复现真实 MAT- 被截断；修复后匹配严格区分。实际 updateMaterial 测试覆盖正常同步、SKU 占用和事务内归一化回滚；BOM/成本/日报/全景改码关联保持。
- 边界：不删除 Product、不改变 BOM/库存/历史快照，不运行自动 SQL。生产待解锁 Mac 后读取预览、备份、执行和复核。
- 归档：尚未获用户确认，不提前在支持文档/修复报告归档为已验收。

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

### 发布门禁记录

- 首次候选 CI：run `33836782479`，head SHA `01779b09b5e0c4ee90b39b33a88aa667d4b70a65`。
- 结果：业务回归执行至 SOP 门禁时失败；原因是 `sop/change-impact.json` 仍声明 `0.1.453`，与 `package.json` 的 `0.1.454` 不一致。
- 处理：同步 SOP 影响声明版本；本次不改变已有操作步骤，因此影响等级保持 `none`。修复候选必须重新运行完整 CI。
