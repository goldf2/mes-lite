# 当前状态

最后更新：2026-09-04 14:50 CST

## 项目阶段

生产维护中。当前候选版本为 `v0.1.455`；代码和迁移已完成本地验证，尚待候选分支精确 SHA CI、`main` 推进及 Con01 生产验证。远端 `main` 当前源码版本为 `v0.1.454`（提交 `2c0fbea`）；其生产可见部署状态未在本会话确认。

## 本次已完成

1. 发货草稿允许数量超过所选库位可用库存，页面显示预计欠库。
2. 只有确认发货可形成负库存；生产领料、调拨、普通调整和非可用状态库存仍保持严格约束。
3. 发货时已有可用量照常冻结批次与成本，差额保存为 `ShipmentStockShortage`。
4. 后续同物料、同库位可用入库或质量放行按欠库时间自动补齐批次、核算量和成本，并保存 `ShipmentStockShortageSettlement`。
5. 发货详情显示待补库存；欠库未补齐时拒绝客户退货；整单冲销同时恢复原发货和欠库补账。
6. 数据一致性检查只接受由开放发货欠库支撑的负数，超过欠库或没有来源的负数仍判为阻塞问题。

## 当前验证结果

```text
npx prisma validate                         通过
npx prisma generate                         通过
npx tsc --noEmit                            通过
npm run verify:shipment-negative-stock      通过
npm run verify:shipment-reversal            通过
npm run verify:shipment-multi-item           通过
npm run verify:shipment-return-lots          通过
npm run verify:inventory-transaction-ledger  通过
npm run verify:data-integrity                通过
npm run verify:receiving-module              通过
```

## 已知问题与风险

| 优先级 | 问题 | 影响 | 处理 |
| --- | --- | --- | --- |
| P1 | 候选 CI 尚未执行 | 不能推进 `main` | 推送 `ci/0.1.455` 并核对精确 SHA |
| P1 | Con01 迁移和生产流程未验证 | 尚不能承诺线上可用 | CI 通过后推进同一 SHA，由 Coolify 部署并核对版本、数据库迁移和真实流程 |
| P2 | 欠库只按原发货库位自动补齐 | 其他库位入库不会隐式抵销 | 先按正常转移流程移到原发货库位；保持位置事实明确 |
| P2 | 欠库补齐前发货成本不完整 | 期间毛利只能视为暂定 | 详情显示“待补库存”，补齐后更新实际成本 |

## 接手建议

1. 阅读根目录 `AGENTS.md`、ADR-0049 和本目录 `RUNBOOK.md`。
2. 从 `NEXT_ACTIONS.md` 的候选发布门禁继续，不跳过精确 SHA CI。
3. 原始工作树含用户未提交内容，不得覆盖；本次隔离工作树为 `/private/tmp/mes-lite-negative-stock-v01455.9a9F1c`。
