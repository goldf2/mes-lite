# MES-lite 应用级恢复演练记录

> 证据范围：由本轮截图演示数据复制并通过库存完整性预检的本地合成候选，不是生产备份。原截图数据库、原附件和在线生产均未改写；报告不包含业务明细、附件名称、账号或密码。

## 1. 演练信息

| 项目 | 结果 |
| --- | --- |
| 环境 | local-synthetic-macos |
| 操作人 | Codex（本机授权演练） |
| 开始时间 | 2026-08-14T11:30:43.681Z |
| 应用验收完成时间 | 2026-08-14T11:31:08.409Z |
| 应用版本 | v0.1.372 |
| 源候选 SHA-256 | 0c9740e883fbfccea1f09e3a41cb8529862dbc2f8046f438e12ac9a6687c7c3a |
| 源附件文件数 | 1 |
| 隔离候选目录 | /Volumes/project/开发中/mes-lite/.runtime/drills/v0.1.372/application-candidate-valid |

## 2. 应用验收

| 检查 | 结论 | 耗时（毫秒） | 说明 |
| --- | --- | ---: | --- |
| stageCandidate | PASS | 39 | 通过 |
| migrations | PASS | 959 | 通过 |
| candidateIntegrity | PASS | 75 | 通过 |
| temporaryAdministrator | PASS | 90 | 通过 |
| readiness | PASS | 4578 | 通过 |
| administratorLogin | PASS | 237 | 通过 |
| businessReadOnlySmoke | PASS | 331 | 通过 |
| attachmentFileSmoke | PASS | 15145 | 通过 |
| temporaryAdministratorCleanup | PASS | 1783 | 通过 |

抽查统计仅记录数量：物料 4、库存 4、生产订单 2、有效附件 1。附件原文件通过 API 返回并与源文件 SHA-256 一致；隔离临时管理员已清理。

预检先在独立副本中补齐 1 个缺失的零库存余额，随后 `findStockIntegrityIssues` 返回 0 个问题；该处理只用于建立满足当前版本约束的合成恢复源，不是生产数据修复记录。

## 3. RPO / RTO

| 指标 | 实际 | 目标 | 结论 |
| --- | ---: | ---: | --- |
| RPO | 13.301 秒 | ≤ 86400 秒 | PASS |
| 完整应用 RTO | 24.728 秒 | ≤ 3600 秒 | PASS |

完整应用 RTO 从演练开始计算，包含候选复制、全附件哈希、迁移、生产构建启动、readiness、管理员登录、业务只读抽查、附件原文件抽查和临时账号清理。它不包含真实 Coolify 挂载切换。

结论：v0.1.372 本地合成候选的隔离应用恢复验收通过。它证明当前构建可完成候选复制、迁移、启动和只读抽查，不证明 2026-08-14 在线生产备份已恢复；异地副本、真实 Coolify 挂载切换和企业真实岗位审批仍需独立验收。
