# MES-lite 文档中心

本目录是 MES-lite 的统一知识入口。第一次接触系统时，不建议从发布记录或单个专题开始阅读；先通过总手册建立整体认知，再进入对应领域。

当前事实基线：`v0.1.388` / 2026-08-16。

## 1. 推荐阅读路径

```text
系统开发与理解手册
  -> 功能、页面、权限与接口矩阵
  -> 系统结构图 / 时序图 / 数据库结构
  -> 具体领域或界面规范
  -> ADR（为什么这样设计）
  -> plans（未来准备怎么做）
```

| 你想了解的问题 | 首选文档 |
| --- | --- |
| 这个系统是什么、能做什么、不能做什么 | [系统开发与理解手册](./开发文档.md) |
| 如何认识主界面、页面模式和常用按钮 | [MES-lite 主界面导览](./operations/user-guide/MES-lite主界面导览-v0.1.388.md)；可运行 `npm run tutorial:build:main-interface` 生成 1080p 中文解说视频 |
| 当前单厂产品边界、唯一主档和旧模型如何退出 | [单厂 MES 产品边界与核心模型收敛](./architecture/单厂MES产品边界与核心模型收敛.md) |
| 一个功能发布在哪个页面、使用什么权限和接口 | [功能、页面、权限与接口矩阵](./architecture/功能页面权限接口矩阵.md) |
| 前端、API、权限、数据库和文件如何连接 | [系统结构图](./architecture/系统结构图.md)、[系统时序图](./architecture/系统时序图.md) |
| 当前数据表和核心关系 | [数据库结构](./architecture/数据库结构.md) |
| 暂停的未来租户化候选 | [目标数据模型草案](./minierp/data-model.md) |
| MES 主体与计划、经营辅助能力如何分工 | [MES-lite 混合系统功能边界矩阵](./architecture/MES-MRP-ERP功能矩阵.md) |
| 作为 MES 还缺什么、接下来按什么顺序补齐 | [MES 核心能力缺口与建设路线](./architecture/MES核心能力缺口与建设路线.md) |
| 如何按界面完成当前已交付的业务流程 | 站内“帮助中心”或顶部问号；快捷帮助和完整帮助都可新开全屏页面。当前同源文件见 [Markdown](./operations/user-guide/MES-lite全流程作业指导书-v0.1.388.md)；DOCX、PDF 和离线 Web 按 [SOP 生成与发布策略](./operations/SOP生成与发布策略.md)在最终交付时一次性生成，PDF/DOCX 可由一个外部对象存储地址下载并受控登记到站内文档库，不进入 Git/Docker 发布树 |
| 如何登记并核对生产实绩的设备和作业文件版本 | [生产实绩执行上下文操作与回滚](./operations/生产实绩执行上下文操作与回滚.md) |
| 如何登记设备开停机、故障和恢复 | [设备运行事件操作与回滚](./operations/设备运行事件操作与回滚.md) |
| 如何建立并执行周期设备点检 | [设备点检操作与回滚](./operations/设备点检操作与回滚.md) |
| 如何执行保养、维修和备件领用 | [设备维保与备件领用操作与回滚](./operations/设备维保与备件领用操作与回滚.md) |
| 如何维护检验标准、执行逐项检验并查看趋势 | [质量检验标准、抽样与趋势操作及回滚](./operations/质量检验标准抽样与趋势操作及回滚.md) |
| 如何按物料启用来料自动送检并安全红冲 | [来料自动检验与红冲回滚](./operations/来料自动检验与红冲回滚.md) |
| 来料批次如何进入生产并正反追溯 | [来料到生产批次谱系操作与回滚](./operations/来料到生产批次谱系操作与回滚.md) |
| 如何执行生产产出质检、放行和冻结 | [生产产出批次质检与库存状态](./operations/生产产出批次质检与库存状态.md) |
| 如何追溯客户发货批次并处理退货质检 | [发货退货批次追溯与质检操作](./operations/发货退货批次追溯与质检操作.md) |
| 当前系统已经能执行哪些流程、由谁操作 | [当前功能 HTML 流程与泳道](../public/mes-current-workflow.html)、[MES 当前功能流程与泳道](./architecture/MES当前功能流程与泳道.md) |
| 从需求到交付由哪些角色参与、如何交接 | [HTML 泳道展示](../public/mes-business-swimlane.html)、[MES 业务泳道与角色参与矩阵](./architecture/MES业务泳道与角色参与矩阵.md) |
| 人员、权限组和页面如何分配 | [人员权限组与页面矩阵](./architecture/人员权限组与页面矩阵.md) |
| 页面为什么要使用公共骨架 | [公共前端模块使用指南](./minierp/公共前端模块使用指南.md) |
| 新代码应该放在哪里 | [代码目录与模块边界规范](./architecture/code-directory-and-module-boundary.md) |
| 如何本地启动和部署 | [系统开发与理解手册](./开发文档.md)、[Coolify 部署说明](./deployment/coolify.md) |
| 如何备份、校验、恢复和做灾备演练 | [备份、恢复与灾备演练](./operations/备份恢复与灾备演练.md) |
| 如何审计生产库物理 Schema 并生成非覆盖收敛候选 | [生产 Schema 漂移审计与收敛候选](./operations/生产Schema漂移审计与收敛候选.md) |
| 如何审计、确认并回填 Product→Material | [Product 到 Material 映射与回填](./operations/Product到Material映射与回填.md) |
| 当前恢复候选上的 Product→Material 缺口是什么 | [2026-08-14 恢复候选只读审计与预检证据](./operations/drills/2026-08-14-product-material-preflight-v0.1.368.md) |
| 最近一次恢复演练留下了什么证据 | [2026-08-13 Coolify 生产恢复候选记录](./operations/drills/2026-08-13-coolify-production-candidate-v0.1.361.md) |
| 恢复候选能否启动应用、登录并读取业务和附件 | [2026-08-13 生产候选应用级隔离演练](./operations/drills/2026-08-13-local-production-candidate-application-v0.1.366.md) |
| 当前版本能否完成隔离应用恢复 | [2026-08-14 v0.1.373 本地合成候选应用级演练](./operations/drills/2026-08-14-local-synthetic-v0.1.373.md) |
| 生产候选是否已收敛到当前迁移基线 | [2026-08-15 Schema 收敛与应用恢复证据](./operations/drills/2026-08-15-schema-reconciliation-candidate-v0.1.377.md) |
| 商业交付如何签署范围、流程和发布门禁 | [单厂 MES 商业交付验收基线](./delivery/单厂MES商业交付验收基线.md) |

## 2. 文档状态怎么判断

| 类型 | 含义 | 使用方式 |
| --- | --- | --- |
| 当前说明 | 描述当前已经实现的系统 | 可用于理解和开发，但仍以运行代码、迁移和 API 为最终事实 |
| 规范 | 新增或修改代码时必须遵守 | 与仓库 `AGENTS.md` 一起执行 |
| ADR | 已接受的重要技术或产品决策 | 解释为什么这样设计，不等同于所有阶段都已实现 |
| 规划 | 尚未全部实现的目标方案 | 不能当作当前功能对外承诺 |
| 发布记录 | 某个版本当时发生的变化 | 用于追溯，不保证仍代表最新结构 |
| 归档 | 已被新文档取代的历史内容 | 仅用于追溯，禁止作为新开发依据 |

## 3. 当前说明与规范

### 系统与业务

- [系统开发与理解手册](./开发文档.md)
- [单厂 MES 产品边界与核心模型收敛](./architecture/单厂MES产品边界与核心模型收敛.md)
- [系统功能与流程总览](./minierp/system-function-flow.md)
- [领域模型](./minierp/domain-model.md)
- [当前系统建模与结构审查](./minierp/当前系统建模与结构审查.md)
- [功能、页面、权限与接口矩阵](./architecture/功能页面权限接口矩阵.md)
- [MES 当前功能流程与泳道](./architecture/MES当前功能流程与泳道.md)
- [MES 核心能力缺口与建设路线](./architecture/MES核心能力缺口与建设路线.md)
- [MES 业务泳道与角色参与矩阵](./architecture/MES业务泳道与角色参与矩阵.md)

### 架构与数据

- [系统结构图](./architecture/系统结构图.md)
- [系统时序图](./architecture/系统时序图.md)
- [数据库结构](./architecture/数据库结构.md)
- [代码目录与模块边界规范](./architecture/code-directory-and-module-boundary.md)

### 页面与交互

- [系统交互与设计规范](./minierp/系统交互与设计规范.md)
- [界面开发规则](./minierp/界面开发规则.md)
- [桌面端界面开发规范](./minierp/桌面端界面开发规范.md)
- [移动端界面开发规范](./minierp/移动端界面开发规范.md)
- [响应式断点与验收矩阵](./minierp/响应式断点与验收矩阵.md)
- [公共前端模块使用指南](./minierp/公共前端模块使用指南.md)
- [页面模块分类与接入清单](./minierp/页面模块分类与接入清单.md)

### 权限、AI、附件与运维

- MES-lite 全流程作业指导书（与站内帮助同源）：[Markdown](./operations/user-guide/MES-lite全流程作业指导书-v0.1.388.md)；[SOP 生成与发布策略](./operations/SOP生成与发布策略.md)
- [生产实绩执行上下文操作与回滚](./operations/生产实绩执行上下文操作与回滚.md)
- [来料自动检验与红冲回滚](./operations/来料自动检验与红冲回滚.md)
- [质量检验标准、抽样与趋势操作及回滚](./operations/质量检验标准抽样与趋势操作及回滚.md)
- [设备维保与备件领用操作与回滚](./operations/设备维保与备件领用操作与回滚.md)
- [设备点检操作与回滚](./operations/设备点检操作与回滚.md)
- [设备运行事件操作与回滚](./operations/设备运行事件操作与回滚.md)
- [单厂 MES 商业交付验收基线](./delivery/单厂MES商业交付验收基线.md)
- [来料到生产批次谱系操作与回滚](./operations/来料到生产批次谱系操作与回滚.md)
- [生产产出批次质检与库存状态](./operations/生产产出批次质检与库存状态.md)
- [发货退货批次追溯与质检操作](./operations/发货退货批次追溯与质检操作.md)
- [人员权限组与页面矩阵](./architecture/人员权限组与页面矩阵.md)
- [MES Agent 规范](./ai-agent/MES-Agent规范.md)
- [业务单据打印与归档](./product/业务单据打印与归档.md)
- [Coolify 部署说明](./deployment/coolify.md)
- [备份、恢复与灾备演练](./operations/备份恢复与灾备演练.md)
- [生产 Schema 漂移审计与收敛候选](./operations/生产Schema漂移审计与收敛候选.md)
- [Product 到 Material 映射与回填](./operations/Product到Material映射与回填.md)

## 4. 决策、规划、版本和归档

- `docs/adr/`：重要决策及其理由。
- [目标数据模型草案](./minierp/data-model.md)：暂停的租户化长期候选，不代表当前产品合同或 Prisma Schema。
- [SaaS 数据与存储目标架构](./architecture/saas-data-and-storage-architecture.md)：暂停的 PostgreSQL、对象存储和多租户长期候选。
- `docs/plans/`：模块化、PostgreSQL、OSS 和工作区实验等未来计划。
- [MES 系统分阶段治理总目标](./plans/MES系统分阶段治理总目标.md)：当前正在执行的安全、模型、业务闭环、导航与商业交付治理路线。
- [版本更新记录](./releases/README.md)：逐版本变更证据。
- `docs/archive/`：已失效或被取代的历史文档。

## 5. 维护规则

1. 总手册只解释系统全貌，不复制字段级专题内容。
2. 当前事实、目标设计和历史方案必须明确标注，不能混写。
3. 页面、权限和入口变化同步更新功能页面权限接口矩阵。
4. Prisma、流程、接口、权限或页面骨架变化，按仓库 `AGENTS.md` 同步对应专题文档。
5. 发布前运行 `npm run verify:development-docs` 和 `npm run verify:release-notes`。
6. 业务代码变化必须更新 `sop/change-impact.json`；流程变化继续更新 `sop/manifest.json`、验证版本和真实截图，先运行 `npm run sop:build` 生成站内帮助、Markdown、DOCX、PDF 和离线 Web，再运行 `npm run verify:sop`。CI 会用 Git 差异阻止业务代码变了但未声明 SOP 影响的提交。
