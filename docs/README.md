# MES-lite 文档中心

本目录是 MES-lite 的统一知识入口。第一次接触系统时，不建议从发布记录或单个专题开始阅读；先通过总手册建立整体认知，再进入对应领域。

当前事实基线：`v0.1.323` / 2026-08-10。

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
| 一个功能发布在哪个页面、使用什么权限和接口 | [功能、页面、权限与接口矩阵](./architecture/功能页面权限接口矩阵.md) |
| 前端、API、权限、数据库和文件如何连接 | [系统结构图](./architecture/系统结构图.md)、[系统时序图](./architecture/系统时序图.md) |
| 当前数据表和核心关系 | [数据库结构](./architecture/数据库结构.md) |
| 未来租户化数据模型 | [目标数据模型草案](./minierp/data-model.md) |
| MES、MRP-lite、ERP-lite 如何分工 | [MES-MRP-ERP 功能矩阵](./architecture/MES-MRP-ERP功能矩阵.md) |
| 人员、权限组和页面如何分配 | [人员权限组与页面矩阵](./architecture/人员权限组与页面矩阵.md) |
| 页面为什么要使用公共骨架 | [公共前端模块使用指南](./minierp/公共前端模块使用指南.md) |
| 新代码应该放在哪里 | [代码目录与模块边界规范](./architecture/code-directory-and-module-boundary.md) |
| 如何本地启动和部署 | [系统开发与理解手册](./开发文档.md)、[Coolify 部署说明](./deployment/coolify.md) |

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
- [系统功能与流程总览](./minierp/system-function-flow.md)
- [领域模型](./minierp/domain-model.md)
- [当前系统建模与结构审查](./minierp/当前系统建模与结构审查.md)
- [功能、页面、权限与接口矩阵](./architecture/功能页面权限接口矩阵.md)

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

- [人员权限组与页面矩阵](./architecture/人员权限组与页面矩阵.md)
- [MES Agent 规范](./ai-agent/MES-Agent规范.md)
- [业务单据打印与归档](./product/业务单据打印与归档.md)
- [Coolify 部署说明](./deployment/coolify.md)

## 4. 决策、规划、版本和归档

- `docs/adr/`：重要决策及其理由。
- [目标数据模型草案](./minierp/data-model.md)：面向租户化的目标字段，不代表当前 Prisma Schema。
- [SaaS 数据与存储目标架构](./architecture/saas-data-and-storage-architecture.md)：PostgreSQL、对象存储和多租户的阶段目标。
- `docs/plans/`：模块化、PostgreSQL、OSS 和工作区实验等未来计划。
- [版本更新记录](./releases/README.md)：逐版本变更证据。
- `docs/archive/`：已失效或被取代的历史文档。

## 5. 维护规则

1. 总手册只解释系统全貌，不复制字段级专题内容。
2. 当前事实、目标设计和历史方案必须明确标注，不能混写。
3. 页面、权限和入口变化同步更新功能页面权限接口矩阵。
4. Prisma、流程、接口、权限或页面骨架变化，按仓库 `AGENTS.md` 同步对应专题文档。
5. 发布前运行 `npm run verify:development-docs` 和 `npm run verify:release-notes`。
