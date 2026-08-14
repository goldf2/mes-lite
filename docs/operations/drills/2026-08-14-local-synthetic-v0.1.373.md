# MES-lite 应用级恢复演练记录

> 证据范围：由既有本地合成候选复制并升级到 v0.1.373 的隔离副本，不是在线生产备份。源候选、原附件和在线生产均未改写；报告不包含业务明细、附件名称、账号或密码。

## 1. 演练信息

| 项目 | 结果 |
| --- | --- |
| 环境 | local-synthetic-macos |
| 操作人 | Codex（本机授权演练） |
| 开始时间 | 2026-08-14T13:35:34.106Z |
| 应用验收完成时间 | 2026-08-14T13:35:53.977Z |
| 应用版本 | v0.1.373 |
| 源候选 SHA-256 | 0c9740e883fbfccea1f09e3a41cb8529862dbc2f8046f438e12ac9a6687c7c3a |
| 源附件文件数 | 1 |
| 隔离候选目录 | /Volumes/project/开发中/mes-lite/.runtime/drills/v0.1.373/application-candidate-valid |

## 2. 应用验收

| 检查 | 结论 | 耗时（毫秒） | 说明 |
| --- | --- | ---: | --- |
| stageCandidate | PASS | 221 | 通过 |
| migrations | PASS | 11913 | 通过 |
| candidateIntegrity | PASS | 150 | 通过 |
| temporaryAdministrator | PASS | 86 | 通过 |
| readiness | PASS | 4028 | 通过 |
| administratorLogin | PASS | 343 | 通过 |
| businessReadOnlySmoke | PASS | 603 | 通过 |
| attachmentFileSmoke | PASS | 1996 | 通过 |
| temporaryAdministratorCleanup | PASS | 87 | 通过 |

抽查统计仅记录数量：物料 4、库存 4、生产订单 2、有效附件 1。附件原文件通过 API 返回并与源文件 SHA-256 一致；隔离临时管理员已清理。

## 3. RPO / RTO

| 指标 | 实际 | 目标 | 结论 |
| --- | ---: | ---: | --- |
| RPO | 7503.726 秒 | ≤ 86400 秒 | PASS |
| 完整应用 RTO | 19.871 秒 | ≤ 3600 秒 | PASS |

完整应用 RTO 从演练开始计算，包含候选复制、全附件哈希、迁移、生产构建启动、readiness、管理员登录、业务只读抽查、附件原文件抽查和临时账号清理。它不包含真实 Coolify 挂载切换。

演练显式配置旧合成候选的上传根目录，使旧本机绝对路径按相同相对路径映射到隔离候选；这验证了附件兼容重定位，不代表生产路径已经变化。

结论：v0.1.373 本地合成候选的隔离应用恢复验收通过。它证明当前构建可以完成第 81 个迁移、readiness、登录、业务与附件只读抽查和临时账号清理，不证明在线生产备份已经恢复；异地副本、真实 Coolify 挂载切换和企业真实岗位审批仍需独立验收。
