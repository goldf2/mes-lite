# 当前状态

最后更新：2026-09-04 12:17 CST

## 项目阶段

生产维护中。当前候选版本为 `v0.1.454`，尚未推送候选分支、合入 `main` 或完成 Con01 生产验证。

## 本次已完成

1. 锯切成本保存默认改为关联已有物料，临时成本对象仍保留。
2. 物料全景按 `SawingCostScenario.materialId` 补充查询对应成本对象，未加入 BOM 的已绑定成本也可展示。
3. 保留可选 BOM 关联：成本对象与原始锯切方案同时写入草稿 BOM；已发布版本不修改。
4. 全景卡片把 `SAWING_COST` 显示为“锯切加工成本”，展示单件材料、人工、机时、直接费和 BOM 使用关系。

## 当前验证结果

```text
npm run verify:cost-domain-services  通过
npm run verify:sawing-cost-module    通过
npm run verify:material-bom-modules  通过
npx tsc --noEmit                      通过
定向 next lint                        0 warning / 0 error
npm run verify:release-notes          通过
git diff --check                      通过
```

## 已知问题与风险

| 优先级 | 问题 | 影响 | 处理 |
| --- | --- | --- | --- |
| P1 | 候选 CI 尚未执行 | 不能进入 `main` | 推送 `ci/0.1.454` 并核对精确 SHA |
| P1 | Con01 生产页面尚未验证 | 用户可见结果未闭环 | CI 通过后发布并验证版本与真实流程 |
| P2 | 物料全景最多显示最近 20 个成本对象 | 极多历史方案可能不在首屏 | 当前沿用现有上限，后续按真实使用量决定分页 |

## 接手建议

1. 阅读根目录 `AGENTS.md` 与本目录 `RUNBOOK.md`。
2. 从 `NEXT_ACTIONS.md` 的 P1 发布门禁继续。
3. 不在原始脏工作树覆盖用户文件；本次隔离工作树是 `/private/tmp/mes-lite-sawing-cost-v01454`。
