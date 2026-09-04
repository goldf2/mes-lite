# MES-lite 代码目录与模块边界规范

状态：目标规范，按增量迁移执行
日期：2026-08-08

## 1. 目的

本规范用于解决三个问题：

1. 让业务领域、公共框架、应用外壳和基础设施在目录上可识别。
2. 让不同 Worktree / AI 任务尽量修改不同目录，降低并行开发时的合并冲突。
3. 阻止 `app/page.tsx`、`app/components/` 根目录和扁平 `lib/` 继续承载新的无关职责。

本规范不要求一次性搬迁全部代码。已有功能按“修改到哪里，迁移到哪里”的方式逐步收敛；禁止为了目录整齐进行没有业务收益的大规模改名。

## 2. 当前代码扫描结论

首次扫描基线：`origin/main`，提交 `5c78233`。当前增量复核已包含来料领域垂直拆分。

| 现状 | 扫描结果 | 判断 |
| --- | ---: | --- |
| `app/page.tsx` | 5 行 | 已收敛为应用入口；应用壳继续由 `HomeApp.tsx` 承担 |
| `app/HomeApp.tsx` | 522 行 | 权限菜单、工作区过滤、页面连续性、偏好和桌面导航状态均已提取；当前只承担应用壳 JSX 装配与少量全局弹层状态 |
| `app/components/shell/` | 9 个文件 | 已建立账号菜单、导航图标、页面宿主、渲染适配器和四类状态控制器的公共应用壳边界 |
| `lib/page-registry.ts` | 45 个页面定义 | 页面元数据、权限资源、工作区入口、系统分区、打开方式和渲染键已集中为单一事实源 |
| `app/components/` 根目录 | 44 个文件 | 根级 `*Page.tsx` 只剩 31 行的 `SystemPage` 兼容分派层；业务单据打印/详情及此前领域实现均已迁入对应模块，根目录继续只承载无领域含义的公共组件和应用壳兼容入口 |
| `modules/materials/ui/MaterialPage.tsx` | 709 行 | 数据契约、HTTP client、详情、编辑、导入、集合视图、页内选项、显示偏好、双形态工具栏、BOM 工作区和草稿编辑均已拆出；当前只保留物料/BOM 页面协调 |
| `SystemPage.tsx` | 38 行 | 已收敛为业务配置、系统设置、运维工具和生产工程的纯领域分派兼容层 |
| `modules/receiving/ui/MaterialInPage.tsx` | 684 行 | 集合、编辑和详情任务已拆出；主页只协调查询、分页与任务弹窗 |
| `modules/documents/ui/WorkInstructionPage.tsx` | 647 行 | 只保留文档读写、搜索、分页与子模块状态协调；批量元数据动作、工具栏、集合、表单、详情/附件和全屏查看已分离 |
| `modules/materials/ui/MaterialPanoramaPage.tsx` | 187 行 | 契约、视图模型、六组业务展示任务、布局弹层和文件查看器均已拆出，只保留协调职责 |
| `prisma/schema.prisma` | 2355 行 | 当前继续作为单一事实源，不为目录整齐强拆 Schema |
| `lib/` | 50 个根文件 | 平台基础设施、格式化工具和少量跨领域兼容能力仍有混放；原 715 行库存事务实现已迁入库存模块，旧路径只保留 15 行兼容出口 |
| `modules/` | 555 个 TypeScript/TSX 文件 | 当前有 17 个领域与平台模块；库存模块承载仓库数字孪生白板和独立盘点校准，并将批次收货、FIFO 消耗/恢复、发货欠库补账、生产投入分配、发货/退货批次、统一收发过账和库位转移收敛到独立内部服务；外部领域通过库存模块公开出口调用。生产模块提供可被流程转移页与仓库白板共同复用的转移录入/快捷确认组件并承载 BOM 快捷生产日报，销售模块独立承载发货状态与批次追溯组件，文档模块承载批量导入、分类字段和同类别批量修改，附件模块统一承载表格直览与 CAD 派生预览，运维工具模块承载数据故障明细导出，系统设置模块管理多引擎切换 |
| `app/api/` | 164 个 `route.ts` | 全部为薄 HTTP 适配层；仓库全景新增只读查询适配器，直接访问 Prisma 的路由仍为零 |

已有的 `app/components/resource`、`relations`、`layout`、`navigation` 和 `page-modules` 是正确方向，应保留并归入公共框架层，而不是重新创建平行实现。

## 3. 总体原则

### 3.1 领域优先，领域内部再分层

物料、BOM、来料、生产、文档、库存、销售等代码先按业务领域归组；一个领域内部再区分 UI、客户端访问、契约、领域规则和服务端实现。

不采用全项目级的 `pages/`、`hooks/`、`services/` 大筐式目录。否则同一业务功能仍会散落在多个远距离目录中，Worktree 也无法形成清晰任务边界。

### 3.2 公共代码必须真正跨领域

只有满足以下至少一项的代码可以进入公共目录：

- 已被两个以上领域稳定复用。
- 属于全系统页面骨架、无障碍、响应式、权限或基础设施能力。
- 已有明确的第二调用方，并且抽象不会丢失领域语义。

只服务于一个领域的组件、Hook、类型和格式化函数留在该领域，不得因为“以后可能复用”提前放入公共目录。

### 3.3 路由是适配层，不是业务层

`app/api/**/route.ts` 只负责：

- 解析 HTTP 请求。
- 调用鉴权和参数校验。
- 调用领域服务或应用用例。
- 将结果转换为 HTTP 响应。

事务、库存变化、成本、状态流转、BOM 展开等规则必须进入对应模块的 `server/`、`application/` 或 `domain/`，不能继续增长在路由文件中。

### 3.4 不建立第二套公共框架

现有 `resource`、`relations`、`layout`、`navigation` 和页面模块契约继续作为唯一公共框架。迁移目录时移动或包装现有实现，禁止另起一套 `common-v2`、`new-components` 或 `shared2`。

## 4. 目标目录

```text
mes-lite/
├── app/                              # Next.js 路由与应用入口
│   ├── api/                          # 薄 HTTP 适配器，保持 URL 资源结构
│   ├── components/
│   │   ├── ui/                       # 无领域含义的按钮、字段、弹窗、反馈
│   │   ├── framework/                # 页面骨架、资源、关系、布局、工具栏
│   │   │   ├── page-modules/
│   │   │   ├── resource/
│   │   │   ├── relations/
│   │   │   ├── layout/
│   │   │   └── toolbar/
│   │   └── shell/                    # 顶部栏、侧栏、账户、AI、全局弹窗
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                      # 只装配应用壳，不放领域实现
├── modules/                          # 按业务领域组织的垂直切片
│   ├── workspace/
│   ├── materials/
│   ├── bom/
│   ├── inbound/
│   ├── production/
│   ├── documents/
│   ├── equipment/
│   ├── inventory/
│   ├── sales/
│   ├── business-config/
│   ├── system-settings/
│   ├── identity-access/
│   ├── analytics/
│   ├── attachments/
│   ├── ai-assistant/
│   └── operations-tools/
├── lib/                              # 跨领域基础设施和无业务工具
│   ├── db/                           # Prisma Client 与事务基础设施
│   ├── auth/                         # 会话、鉴权基础设施
│   ├── audit/                        # 审计基础设施
│   ├── search/                       # 公共搜索表达式与解析
│   ├── files/                        # 通用文件类型、存储接口、预览底座
│   └── shared/                       # 纯函数：排序、CSV、内部编码等
├── services/                         # 与 Web 进程隔离、可独立部署的内部服务
│   └── cad-preview/                  # DWG/DXF 转只读 PDF；不访问业务数据库
├── prisma/
│   ├── schema.prisma                 # 当前继续保持单一事实源
│   ├── migrations/
│   └── seed.ts
├── scripts/
│   ├── verify/                       # 稳定、可重复的契约验证
│   ├── maintenance/                  # 显式运行的数据维护脚本
│   └── build/                        # 构建准备与依赖同步
├── docs/
│   ├── architecture/
│   ├── product/
│   ├── ui/
│   ├── plans/
│   ├── operations/
│   ├── adr/
│   ├── releases/
│   └── archive/
└── platforms/                        # 未来 Tauri / Capacitor 薄壳，未启用不建空目录
```

目录是目标状态，不允许一次提交只创建大量空文件夹。只有代码实际迁入时才创建对应目录。

## 5. 领域模块内部结构

每个 `modules/<domain>/` 使用以下可选结构：

```text
modules/materials/
├── index.ts                 # 唯一公开出口
├── contracts/               # DTO、查询参数、可跨客户端/服务端共享的类型
├── domain/                  # 不依赖 React、Next.js、Prisma 的业务规则
├── application/             # 用例编排，例如新建、归档、确认、冲销
├── server/                  # Prisma 仓储、事务、服务端查询
├── client/                  # fetch 封装、客户端查询键和数据转换
├── ui/                      # 页面、领域组件、表单和领域 Hooks
└── __tests__/               # 领域规则和模块契约测试
```

并非每个模块都必须拥有全部子目录：

- 只有 UI 的轻模块可以只有 `ui/`、`contracts/` 和 `index.ts`。
- 没有独立领域规则时不要创建空 `domain/`。
- 只有服务端使用的类型放 `server/`，不要通过 `index.ts` 暴露给客户端。
- 页面专用组件放 `ui/components/`，页面专用 Hook 放 `ui/hooks/`。
- `modules/<domain>/ui` 属于正式界面源码；Tailwind 的 `content` 必须持续扫描 `modules/**/*.{js,ts,jsx,tsx,mdx}`。迁移 UI 时不得只移动组件而遗漏样式生成范围。

## 6. 依赖方向

允许的依赖方向：

```text
app/page.tsx
  -> app/components/shell
  -> modules/* 的公开页面注册

app/api/**/route.ts
  -> modules/<domain>/application 或 server
  -> lib/auth、lib/audit 等基础设施

modules/<domain>/ui
  -> 本模块 contracts、client、domain
  -> app/components/ui、app/components/framework

modules/<domain>/application
  -> 本模块 domain、server
  -> 其他模块公开 contracts/application

modules/<domain>/domain
  -> 纯 TypeScript；不依赖 React、Next.js、Prisma
```

禁止的依赖：

- 公共 UI 或公共框架反向导入具体业务模块。
- 客户端组件导入 Prisma、服务端密钥、仓储或 Node 专用库。
- 模块 A 直接导入模块 B 的内部文件；必须从 B 的 `index.ts` 公开出口访问。
- `lib/` 导入 `app/` 或业务页面。
- API 路由导入领域 UI。
- 通过跨越三层以上的相对路径访问其他模块，例如 `../../../materials/server/...`。

## 7. 现有代码归属映射

| 现有代码 | 目标模块 |
| --- | --- |
| `MaterialPage.tsx`、`MaterialPanoramaPage.tsx`、`app/api/materials` | `modules/materials` |
| `BomOverviewPage.tsx`、BOM 编辑区、`app/api/boms`、`bom-*` | `modules/bom` |
| `MaterialInPage.tsx`、`app/api/material-ins`、`material-in-*` | `modules/receiving` |
| 生产订单、派工、班后实绩、流程转移 | `modules/production` |
| `WorkInstructionPage.tsx`、文档类别、在线正文 | `modules/documents` |
| 附件上传、缩略图、Office/PDF/CAD 预览、存储适配 | `modules/attachments`；通用文件底座及 CAD 转换适配放在 `lib/files` |
| 设备、工作中心归属 | `modules/equipment` |
| 库存、库位余额、调整、包装穿透、成本层 | `modules/inventory` |
| 销售订单、发货、退货 | `modules/sales` |
| 客户、供应商、员工、单位、库位目录、编码规则 | `modules/business-config` |
| 显示、AI 服务配置、系统集成 | `modules/system-settings` |
| 登录账号、角色、权限 | `modules/identity-access` |
| 统计页与工作台指标 | `modules/analytics`、`modules/workspace` |
| 数据一致性、归档、审计查看、图片优化 | `modules/operations-tools` |
| `app/components/resource`、`relations`、`layout`、`navigation` | `app/components/framework` |
| `AppButton`、`FormField`、`ModalDialog`、加载与提示 | `app/components/ui` |
| 顶部栏、侧栏、页面注册和账号菜单 | `app/components/shell` |

一个功能可能使用多个模块，但必须有唯一“规则所有者”。例如文档页面调用附件模块，附件存储规则仍由附件模块所有，文档模块不能复制 MIME、存储或缩略图规则。

## 8. 文件与命名规则

- 目录使用小写 `kebab-case`，例如 `business-config`。
- React 组件使用 `PascalCase.tsx`；Hook 使用 `useXxx.ts`；纯函数和服务使用 `kebab-case.ts`。
- `Page` 后缀只用于页面级领域组件；公共骨架使用 `Shell`、`Workspace`、`Panel`、`Dialog` 等准确名称。
- 每个模块只允许一个公开 `index.ts`；模块内部禁止为了缩短路径建立多层无约束 barrel export。
- `types.ts` 只放小范围共享类型；类型较多时按语义拆成 `contracts/query.ts`、`contracts/record.ts`。
- 不使用 `utils.ts`、`helpers.ts`、`common.ts` 承载无关函数；文件名必须表达职责。
- 不建立 `new`、`v2`、`temp`、`misc`、`other` 作为长期目录。

## 9. 文件规模与拆分触发线

行数不是唯一质量指标，但用于阻止巨型文件继续无边界增长：

| 文件类型 | 建议规模 | 强制评审触发线 |
| --- | ---: | ---: |
| `app/page.tsx`、应用入口 | 200 行以内 | 400 行 |
| API `route.ts` | 150 行以内 | 300 行 |
| 普通 React 组件 | 300 行以内 | 500 行 |
| 领域页面编排组件 | 500 行以内 | 800 行 |
| 领域服务/纯规则文件 | 300 行以内 | 500 行 |

超过触发线时，新需求必须先说明为什么不能拆分，或在同一变更中提取至少一个稳定职责。禁止通过删除空行、压缩 JSX 或堆入自定义 Hook 来规避。

优先按以下职责拆分：

1. 数据请求与页面状态。
2. 工具栏和搜索配置。
3. 列表/卡片/详情视图。
4. 新建/编辑表单。
5. 领域计算和状态流转。
6. 类型、常量和格式化。

## 10. Worktree 与并行任务规范

### 10.1 一个 Worktree 一个主要所有权目录

每个并行任务开始时声明主要所有权，例如：

```text
任务：文档附件预览
主要目录：modules/documents、modules/attachments
允许公共修改：app/components/framework/toolbar
禁止修改：modules/inventory、modules/sales
```

同一 Worktree 不同时承担两个无关领域。任务需要修改公共框架时，应先判断：

- 能否通过现有扩展点完成。
- 是否应先建立独立公共框架任务并合并，再让各领域 Worktree 更新基线。

### 10.2 分支与目录命名

```bash
git worktree add ../mes-lite-worktrees/documents-preview \
  -b feat/documents-preview origin/main

git worktree add ../mes-lite-worktrees/inventory-fix \
  -b fix/inventory-consistency origin/main
```

推荐前缀：`feat/`、`fix/`、`refactor/`、`docs/`、`chore/`。

### 10.3 运行环境隔离

Git 只隔离代码和索引，不隔离运行资源。并行任务必须分别设置：

- 开发端口。
- SQLite 文件或测试数据库 Schema。
- 上传/缩略图临时目录。
- `.next`、测试输出和日志目录。
- 可能产生写入的第三方服务测试空间。

不得让两个 Worktree 同时写同一 SQLite 开发库或同一上传目录。只读观察可以共享，涉及迁移、种子、上传、归档和库存写入时必须隔离。

### 10.4 集成规则

- `main` Worktree 只负责集成、发布和紧急验证，不直接承载长期功能开发。
- 同一时间建议最多 2–3 个活跃功能 Worktree。
- 公共框架、Prisma Schema、导航注册和版本文件属于高冲突区域，由单一集成任务串行修改。
- 功能分支合并前先更新到最新 `main`，在自己的 Worktree 解决冲突并运行验证。
- 合并后使用 `git worktree remove <path>` 正常移除，不直接删除目录。

## 11. 增量迁移顺序

### 阶段 1：拆应用壳

目标：将 `app/page.tsx` 收敛为入口和壳装配。

1. 提取导航注册、页面注册和当前页面解析。
2. 提取桌面/移动应用壳、账户菜单、二维码和 AI 全局入口。
3. 将仪表盘展示迁入 `modules/workspace` 或 `modules/analytics`。
4. 页面切换改为读取稳定注册表，不继续增加条件分支。

### 阶段 2：迁移最大领域页面

建议顺序：

1. `materials` 与 `bom`。
2. `business-config` 与 `system-settings`。
3. `documents` 与 `attachments`。
4. `inbound`。
5. `production`、`inventory`、`sales`。

每次只迁移一个可运行垂直切片，不进行全仓库机械搬家。

### 阶段 3：路由变薄与领域服务归位

从超过 300 行或含事务/库存变更的路由开始，把业务规则迁入模块服务；路由保留 HTTP 语义和权限入口。

### 阶段 4：建立自动约束

目录稳定后再增加校验：

- 禁止客户端导入 Prisma 和 server-only 模块。
- 禁止公共框架导入业务模块。
- 检查新增根级领域组件和扁平 `lib` 文件。
- 输出超过规模触发线的文件清单，不直接以行数替代代码评审。

上述边界已经由 `npm run verify:module-boundaries` 自动执行。校验会阻止新增根级领域页面、模块间越过公开出口、领域 UI 导入 Prisma/server、公共框架反向导入业务模块，并锁定现有巨型页面和巨型路由不得继续增长。

## 12. 新功能放置决策

新增文件前按顺序判断：

1. 它属于哪个业务领域？放入 `modules/<domain>`。
2. 它是否已被两个以上领域稳定复用？是则考虑公共框架或 `lib`。
3. 它是否只是 HTTP 入口？放 `app/api`，业务规则仍归模块。
4. 它是否只负责应用全局导航和布局？放 `app/components/shell`。
5. 它是否是无领域视觉原语？放 `app/components/ui`。
6. 无法判断归属时，先留在最具体的调用领域，不放公共 `utils`。

## 13. 模块迁移完成定义

一个领域完成目录迁移至少满足：

- 页面、领域组件、客户端访问和服务端规则已归入同一模块。
- 其他模块只从公开出口访问，不导入内部路径。
- API 路由不再复制核心业务规则。
- 公共视觉和页面骨架继续复用现有公共组件。
- 原路径没有遗留重复实现或兼容文件；确需兼容时记录移除条件。
- 类型检查、领域验证、生产构建和目标页面响应式验证通过。
- 对应业务、数据模型、接口或界面文档已同步。

## 14. 当前立即生效的限制

在尚未完成搬迁前，以下规则立即生效：

- `app/components/` 根目录不再新增领域页面；新增领域代码直接进入 `modules/<domain>`。
- `lib/` 根目录不再新增含领域语义的文件；先放对应模块。
- `app/page.tsx` 不再增加新的业务请求、表单、列表、卡片或领域计算。
- 超过 800 行的现有页面只允许修复；新增功能必须伴随职责提取。
- 新增 API 路由可以保留 Next.js 所需文件，但事务和规则必须由模块服务提供。
- 公共框架变更必须检查全部调用方，不能只验证提出需求的页面。

## 15. 首批增量迁移结果

首批领域边界已经落地：

- `modules/workspace` 拥有工作台指标、负荷、状态分布与预警页面状态。
- `modules/production` 拥有生产订单查询、创建、详情、实绩入口、单据 PDF，以及加工工艺和物料路线工程主数据。
- `modules/inventory` 拥有库存查询、筛选、视图、数据一致性提示和库存调整状态。
- `modules/configuration` 拥有客户、供应商、单位、库位、文档类别以及企业与业务规则配置页；工作中心仅保留菜单分派，页面与规则归 `modules/equipment`。
- `modules/materials` 拥有物料管理与物料全景，物料契约、HTTP client 和 UI 已分层。
- `modules/bom` 拥有 BOM 全览、BOM 契约和 HTTP client；物料页对 BOM 的访问只经过该模块公开出口。
- `modules/operations-tools` 拥有数据检查、图片优化、物料编码规范化、归档恢复/永久删除和审计记录页面。
- `modules/system-settings` 拥有显示、导航和 AI 设置页；各页面只读取自身所需设置，并通过模块 client 访问 API。
- 八个模块均以根目录 `index.ts` 作为应用层公开出口，页面注册层不越过公开出口导入领域 UI。
- 模块 UI 继续复用 `app/components` 中现有公共搜索、工具栏、视图、表格、弹窗、附件和打印能力；本阶段不复制公共框架。

本次迁移只改变代码所有权和导入边界，不改变 API、Prisma 模型、权限资源、业务状态流转或页面布局。其余领域继续按增量原则迁移。

## 16. 应用壳与页面注册增量结果

应用壳前两步已经落地：

- `app/page.tsx` 只负责装配 `HomeApp`，不包含业务实现。
- `app/components/shell` 已拥有账号菜单、导航字符图标、页面宿主和页面渲染适配器。
- `lib/page-registry.ts` 是页面名称、类型、路由状态、权限资源、工作区入口、系统分区、打开方式和渲染键的唯一事实源。
- `app/app-navigation.ts`、`lib/page-modules.ts` 和 `HomeApp.tsx` 只从注册表派生菜单、页面定义和当前页面，不再维护平行页面清单。
- React 动态加载留在客户端渲染适配层，避免基础注册表依赖 React 或 Next.js；适配器键由注册表约束并通过脚本检查完整性。

应用壳状态控制器第四步已经落地：

- `usePageNavigationController.ts` 统一管理当前页面、物料子页、BOM 编辑目标、URL 同步、页面连续性和滚动位置恢复。
- `useWorkspacePreferenceController.ts` 统一管理工作台布局偏好、固定入口和功能使用次数上报。
- `useDesktopNavigationController.ts` 统一管理导航显示偏好、工作区形态、自动隐藏、侧栏尺寸、拖动和键盘调整。
- `useApplicationNavigationController.tsx` 统一管理权限过滤、工作区菜单、一级顺序、页面跳转和移动端快捷入口；宽屏、窄屏和画布导航从同一分组模型派生。
- `HomeApp.tsx` 不再直接读写页面连续性、工作区偏好、桌面导航存储或权限菜单组装，行数从 1233 行降至 522 行。
- `verify:shell-controllers`、`verify:page-modules`、`verify:workspace-navigation` 和 `verify:responsive-navigation` 阻止这些职责重新回流应用壳，并把 `HomeApp.tsx` 的当前规模上限固定为 600 行。

下一步应继续拆分统计、库存和物料协调页的稳定业务视图，并逐步把剩余巨型 API 中的事务规则迁入领域服务；页面注册与菜单分类仍只使用现有单一事实源。

## 17. 物料编辑与导入状态归属

- `MaterialEditDialog.tsx` 自己持有表单、单位选项、保存中状态和 `saveMaterial` 动作，主页面不再因增减物料字段而同时修改列表、BOM 和详情状态。
- `MaterialImportDialog.tsx` 自己持有文件、覆盖模式、导入中状态和逐行错误，导入成功后只通过回调要求主页面刷新资料源。
- `model/material-options.ts` 统一维护分类和计量方式选项，列表、搜索、详情和编辑器不再各自复制标签映射。
- 两个切片仍复用公共 `ModalDialog`、`ModalActions` 和 `SearchableSelect`，没有创建平行弹窗或字段组件。

## 18. 物料详情读取与附件归属

- `MaterialDetailDialog.tsx` 接收列表选中项后自行重新读取最新物料详情，主页面不再理解详情加载失败回退规则。
- 库存摘要、单位与成本信息、销售价和图片附件统一归属详情切片；附件变更仅通过回调请求主页面刷新列表。
- 编辑和全景仍由主页面负责页面级协调，详情切片只上报当前最新物料，不直接操作页面导航状态。

## 19. 物料集合视图归属

- `MaterialCardView.tsx` 和 `MaterialTableView.tsx` 只接收已经查询完成的物料、可见字段、BOM 简况和动作契约，不读取 API 或页面导航状态。
- `MaterialPagination.tsx` 统一物料集合的分页摘要和翻页控件，卡片与表格不再复制分页实现。
- `model/material-view.ts` 集中视图字段、排序、列宽、BOM 摘要和动作类型，页内选项与两个视图共享同一事实源。
- 原先位于不可达分支中的 BOM 工作区行选中判断已删除；BOM 工作区继续使用自己的专用列表，不再与物料集合视图混合。

## 20. 物料页内选项与显示偏好归属

- `useMaterialViewPreferences.ts` 统一拥有可见字段、BOM 简况字段、列宽持久化、拖动监听和卸载清理，表格只消费稳定的 `MaterialColumnControls` 契约。
- `MaterialPageOptions.tsx` 组合公共 `PageOptionsDialog` 与 `ToolbarOrderSettings`，负责物料排序、字段显示和 BOM 简况配置，不读取业务 API 或控制页面导航。
- `MaterialPage.tsx` 不再读写物料视图的 `localStorage`，只把偏好结果传给卡片和表格，并继续拥有查询、业务动作与页面级弹窗协调。
- `verify:material-bom-modules` 固定上述职责边界和文件规模，防止偏好状态、列宽拖动或页内选项重新回流主页面。

## 21. 运维工具模块归属

- `modules/operations-tools` 是数据工具、归档记录和操作记录的唯一前端所有者，通过根目录 `index.ts` 向应用层公开 `OperationsToolsSectionPage`。
- `DataToolsPage.tsx` 组合既有 `DataIntegrityPanel`、`ImageOptimizationPanel` 和公共 `AppButton`，不复制数据检查、图片优化或按钮骨架。
- `ArchiveRecordsPage.tsx` 与 `AuditLogPage.tsx` 共用模块内工具栏适配器，并继续复用公共顶部工具栏、视图切换、排序表头和响应式断点能力。
- `SystemPage.tsx` 只负责把系统分区委派给业务配置、系统设置、运维工具或生产工程，不再实现任何领域页面、请求、表单或计算。

## 22. 系统设置模块归属

- `modules/configuration/ui/BusinessSettingsPage.tsx` 拥有企业资料和物料编码自然排序，明确归入会影响业务数据与导出的业务配置。
- `modules/system-settings` 拥有显示、导航、文件预览和 AI 四个设置分区，并通过统一 `SystemSettingsPageShell` 保持页面层级与布局一致；CAD 页面只负责设置与状态展示，转换实现仍属于隔离服务。
- `DisplaySettingsPage.tsx` 只读取对比度服务端设置；浏览器级工作区、导航与弹窗偏好继续复用公共偏好 Hook。
- `AiSettingsPage.tsx` 只读取 AI 外观，AI 连接表单通过独立 client 封装 `/api/ai/config`，UI 不直接调用 `fetch`。
- `verify:configuration-modules` 与 `verify:system-settings-modules` 阻止业务设置和系统设置重新回流 `SystemPage.tsx`。

## 23. 生产工程模块归属

- `modules/production/ProductionEngineeringSectionPage.tsx` 统一挂载加工工艺和物料路线，并继续复用公共手工排序入口。
- `contracts/production-engineering.ts` 统一工艺模板、路线、工序与编辑表单契约；`client/production-engineering-api.ts` 封装工程主数据接口。
- `model/production-engineering.ts` 集中工艺类别、默认表单、千件成本计算和两类搜索配置，页面不再复制工程规则。
- `ProcessTemplatePage.tsx` 与 `ProcessRoutePage.tsx` 共用 `ProductionEngineeringPageShell`，继续复用公共资源页、高级搜索、卡片/列表、物料选择和弹窗。
- `contracts/production-engineering-schema.ts` 集中写入校验和默认值；`server/production-engineering-service.ts` 拥有事务、排序、物料兼容映射、单一默认路线和工序软删除规则。
- `app/api/process-templates/route.ts` 与 `app/api/process-routes/route.ts` 分别收敛至 53 行和 58 行，只处理权限、请求解析、审计、错误与 HTTP 响应。
- `verify:production-engineering-modules` 阻止请求、成本模型和页面实现重新回流 `SystemPage.tsx`；`verify:production-engineering-server` 同时校验 Schema、薄 API 边界，并支持在临时完整数据库中验证事务规则。

## 24. 自动模块边界守卫

- `verify:module-boundaries` 检查所有领域模块都有公开 `index.ts`，跨模块调用不得导入其他模块内部路径。
- 模块 UI 禁止导入 Prisma 或 `server/`，公共框架禁止反向导入领域模块，API 路由禁止导入 UI。
- 现有超过 800 行的页面和超过 300 行的路由作为递减基线：允许拆小，不允许继续增长；新增文件一旦越过触发线直接失败。
- `app/components/` 根目录的 13 个领域页面被登记为待迁移存量，不允许再新增根级 `*Page.tsx`。

## 25. 物料服务端模块归属

- `contracts/material-schema.ts` 集中物料新建、修改、高级搜索、分页和排序请求契约，并显式声明需要 BOM 权限的查询形态。
- `server/material-query-service.ts` 拥有智能多关键词、字段式高级搜索、自然编码排序、BOM 简况排序、分页和主图装配。
- `server/material-command-service.ts` 拥有配置单位校验、编码唯一性、物料与库存原子创建、单位版本递增和单位变更事务审计。
- `app/api/materials/route.ts` 从 549 行降至 73 行，只处理权限、请求解析、审计、错误映射和 HTTP 响应；该路由已从巨型路由递减基线移除。
- `verify:material-server` 支持无数据库边界校验和临时完整数据库集成验证，测试数据不会写入本机常用库或服务器正式库。

## 26. 作业文档垂直模块归属

- `modules/documents` 通过唯一 `index.ts` 向页面注册层公开作业文档页；根级领域页面从 16 个降至 15 个。
- `contracts/work-instruction-schema.ts` 与 `contracts/work-instruction.ts` 分别拥有服务端请求约束和前端数据契约。
- `client/documents-api.ts` 封装文档、类别、产品、工作中心和附件请求，`WorkInstructionPage.tsx` 不再直接调用 `fetch`。
- `model/work-instruction-view.ts` 集中状态、文件类型、空表单、显示标签与本地格式化规则，同类视图不再重复定义。
- `WorkInstructionCollectionView.tsx`、`WorkInstructionCreateDialog.tsx`、`WorkInstructionDetailDialog.tsx` 与 `WorkInstructionFullscreenViewer.tsx` 分别拥有集合展示、新建、详情/附件和全屏查看用户任务。
- 新建与详情编辑共用 `WorkInstructionFormFields.tsx`，并继续调用公共弹窗、一对多关联、在线正文、附件预览和排序表头。
- `server/work-instruction-query-service.ts` 拥有分类层级、智能多关键词、附件名称/类型、高级字段搜索和列表附件摘要装配。
- `server/work-instruction-command-service.ts` 拥有上海时区自动标题、结构化正文规范化、成品/类别/工作中心校验、关联替换和归档事务。
- `app/api/work-instructions/route.ts` 从 551 行降至 78 行并移出巨型路由基线；文档主页面从 1497 行降至 591 行，已移出 800 行巨型页面基线。
- `verify:document-server` 要求主页不超过 650 行且必须编排上述四个子模块，同时在完整临时 SQLite 库中验证文档交易规则，不读写服务器正式数据。

## 27. 来料垂直模块归属

- `modules/receiving` 通过唯一 `index.ts` 向页面注册层公开来料页；根级领域页面从 15 个降至 14 个。
- `contracts/material-in.ts` 与 `contracts/material-in-schema.ts` 分别拥有前端数据契约和服务端请求约束，页面与路由不再重复声明来料结构。
- `client/material-in-api.ts` 封装来料查询、创建、归档以及供应商、物料和库位请求，来料页面不再直接调用 `fetch`。
- `MaterialInCollectionView.tsx`、`MaterialInEditorDialog.tsx` 与 `MaterialInDetailDialog.tsx` 分别拥有集合、编辑和详情用户任务，并继续调用公共页面骨架、弹窗、附件、业务单据详情与异步可搜索选择器。
- `server/material-in-service.ts` 拥有多关键词查询、多明细原子创建、数量/计量/计价换算和归档规则；`app/api/material-ins/route.ts` 只保留权限、HTTP 参数、审计与错误映射。
- `MaterialInPage.tsx` 从 1,679 行降至 684 行，`app/api/material-ins/route.ts` 从 295 行降至 90 行；两者均已退出对应巨型基线。
- `verify:receiving-module` 锁定薄 API、领域服务、公共异步选择器和页面规模，并能在临时完整 SQLite 库中验证创建、查询、归档和无效供应商规则，不读写服务器正式数据。

## 28. 物料全景任务模块归属

- `contracts/material-panorama.ts` 集中物料全景响应、附件查看和布局配置契约；展示模块不再各自猜测 API 数据结构。
- `model/material-panorama-view.ts` 拥有模块顺序、宽度、密度、状态标签、格式化、工艺成本和关联路线归并等纯视图规则。
- `material-panorama/` 按档案与库存、库位与文档、BOM 与工艺、成本、工单与领料、来料与库存记录六组稳定用户认知拆分，不按任意行数制造无语义小组件。
- `MaterialPanoramaLayoutDialog.tsx` 与 `MaterialPanoramaViewer.tsx` 分别拥有显示偏好和文件查看任务，主页面只传递稳定动作契约。
- 全景读取和附件方向保存统一进入 `client/materials-api.ts`，协调页和纯展示子模块均不得直接调用 `fetch`。
- `MaterialPanoramaPage.tsx` 从 1,485 行降至 187 行并退出巨型页面基线；`verify:material-bom-modules` 将协调页上限固定为 250 行，并检查所有稳定任务持续存在。

## 29. 完整生产实绩与 BOM 快捷日报边界

- 生产订单详情中的 `ProductionOrderActualPanel` 是完整生产实绩入口，覆盖人员、设备、作业文件、投入、多产出、待检批次、谱系、确认和冲销。
- 旧 `StatsPage.tsx` 自生产订单实绩闭环上线后已不在页面注册、导航或应用壳中，继续拆分只会维护第二套不可达交互，因此删除其 936 行前端实现。
- 工作台功能键删除失效的 `stats` 快捷入口，历史浏览器偏好中的该键在规范化时自动丢弃；权限资源 `stats` 只保留统计接口兼容。自 `v0.1.360` 起流程转移页面使用 `flowTransfers`，自 `v0.1.375` 起确认和冲销再分别使用独立命令资源，不与工作台键混为一谈。
- `v0.1.433` 通过 `DailyProductionPage` / `DailyProductionBomEntry` 和专用 `daily-production-shortcut` 薄接口复用 `DailyProductionReport`，形成不带人员、设备、工序和质检的正式 BOM 快捷转换；旧通用创建接口继续返回 410，避免恢复已删除的大型旧页面。
- `v0.1.435` 将快捷日报的选择顺序改为“投入物料 → 正式 BOM／主产出”；`model/daily-production-bom-selection.ts` 以纯视图规则从已发布 BOM 投入明细建立反查候选，页面仍通过原有领域 client 读取工作区并复用同一原子过账服务，不新增平行接口或数据库模型。
- 根级存量领域页面从 14 个降至 13 个，超过 800 行的页面从 3 个降至 2 个。

## 30. 库存前端垂直模块归属

- `contracts/stock.ts` 集中库存、库位、包装穿透、客户、一致性问题和调整草稿契约，页面与子任务不再复制响应结构。
- `client/stock-api.ts` 封装库存查询、缺失库存补齐、客户与库位选项以及库存调整提交，协调页不再直接调用 `fetch`。
- `model/stock-view.ts` 集中分类标签、数量格式、占用库位、展示名称、调整草稿和调整后总量等纯规则。
- `StockCollectionView.tsx`、`StockDetailPanel.tsx`、`StockAdjustmentDialog.tsx` 与 `StockIntegrityAlert.tsx` 分别拥有集合、详情、调整和一致性处理任务。
- `DailyInventoryCountPage.tsx` 是库存菜单下的独立盘点页面：复用库存 client、物料库存候选和库位选项，把多物品实盘数整单提交到库存命令服务；不承载 BOM 生产事实。
- `StockPageModule.tsx` 从 853 行降至 304 行，只保留筛选与 URL 状态、任务协调、自动补齐编排和选择态；库存页退出 800 行巨型页面基线。
- `verify:inventory-module` 锁定 350 行协调层上限、无直接 HTTP、四个稳定任务和领域 client/model 边界；系统当前只剩 1 个超过 800 行的页面。

## 31. 物料双形态页面任务拆分

- `MaterialWorkspaceToolbar.tsx` 统一装配物料管理与 BOM 工作区的公共搜索、高级搜索、视图、页内选项和动作槽；门户工具栏与外部工具栏回调不再复制两套结构。
- `MaterialBomWorkspace.tsx` 拥有已有 BOM 列表、选中态、投入/产出摘要和右侧草稿编辑器装配，仍通过 `BomDraftController` 接收状态与动作。
- `MaterialPage.tsx` 从 887 行降至 709 行，保留物料查询、BOM 数据协调、URL/偏好、快速 BOM 和领域弹窗编排，退出巨型页面基线。
- `verify:material-bom-modules` 将主页面上限收紧到 750 行，并锁定两个纯展示任务不得访问 HTTP 或承载草稿状态。
- 模块边界统计当前为 0 个超过 800 行的页面；后续优化以职责与调用方为依据，不再为了行数机械切割。

## 32. 库存服务端垂直模块归属

- `contracts/stock-route.ts` 统一库存查询参数与库位调整请求校验，HTTP 路由不再手工解释筛选字段。
- `domain/stock-integrity.ts` 以纯函数表达总量、预留、可用量、核算量和库位合计不变式，可在不连接数据库时回归验证。
- `server/stock-query-service.ts` 拥有库存筛选、主图、包装 BOM 穿透、库位关键词和归档零余额显示规则。
- `server/stock-integrity-service.ts` 负责读取异常记录和受控补齐缺失的零余额；`server/stock-command-service.ts` 统一修复、单条库存调整和生产日报多物品盘点入口，盘点整单复用相同保护规则并原子写入流水与审计。
- `app/api/stocks/route.ts` 从 449 行降至 79 行，只保留权限、HTTP 解析、审计和错误映射，并退出巨型路由递减基线。
- `verify:inventory-module` 同时锁定前端协调层、薄 API、服务调用和库存不变式样例；系统超过 300 行的存量 API 从 6 个降至 5 个。

## 33. BOM 服务端垂直模块归属

- `contracts/bom-schema.ts` 集中投入、产出和方案保存请求约束；`server/bom-select.ts` 统一列表与保存返回选择集。
- `domain/bom-structure.ts` 以纯函数约束唯一主产出、投入/产出不重复、包装单产出和投入产出互斥，`domain/bom-version.ts` 负责默认版本递增。
- `server/bom-query-service.ts` 拥有兼容产品映射、默认 BOM 选择、主图与库存摘要装配。
- `server/bom-command-service.ts` 拥有单位换算、产出映射、版本唯一性、默认方案切换以及投入/产出的原子替换事务。
- `app/api/boms/route.ts` 从 464 行降至 45 行，只保留权限、请求解析、审计和错误映射，并退出巨型路由递减基线。
- `verify:material-bom-modules` 增加薄 API、服务边界、版本递增和 BOM 结构不变式样例；系统超过 300 行的存量 API从 6 个降至 4 个。

## 34. 物料全景服务端聚合归属

- `server/material-panorama-select.ts` 集中全景内重复使用的产品、默认工艺路线和工序选择集。
- `server/material-panorama-attachments.ts` 统一物料图片、历史作业文档、普通附件分类，以及正式作业文档附件计数与 URL 装配。
- `server/material-panorama-query-service.ts` 统一编排物料、库存/库位、BOM/成本、工单/领料、来料/流水、工艺和文档聚合，并保持在 220 行守卫内。
- `app/api/materials/[id]/panorama/route.ts` 从 412 行降至 20 行，只保留物料读取权限、404 和 HTTP 错误映射。
- `verify:material-bom-modules` 增加薄全景 API、查询服务、附件分类与规模回归；系统超过 300 行的存量 API 从 6 个降至 3 个。

## 35. 物料批量导入归属

- `contracts/material-import.ts` 集中导入模式、客户候选、行数据和汇总契约。
- `domain/material-import-parser.ts` 以纯函数处理 CSV 表头、中文分类/计量/成本别名、双单位、销售价、客户匹配和逐行错误，不连接数据库。
- `server/material-import-service.ts` 拥有客户候选查询、已有编码/归档检查、单位变更锁定、缺失客户创建以及物料和零库存原子写入。
- `app/api/materials/import/route.ts` 从 398 行降至 36 行，只保留创建/修改权限、文件尺寸、审计和 HTTP 错误映射。
- `verify:material-bom-modules` 增加真实 CSV 行、中文别名、薄路由和事务服务守卫；系统超过 300 行的存量 API 从 6 个降至 2 个。

## 36. 身份权限管理归属

- `contracts/permission-admin.ts` 集中权限资源、权限组设置、人员分组和创建权限组契约；`contracts/operator-admin.ts` 统一人员角色、状态和更新输入。
- `domain/permission-admin.ts` 维护管理员判断、授权能力判断和权限组编码规范化纯规则。
- `client/identity-access-api.ts` 统一人员、权限组和授权请求；人员管理页和权限管理页从根组件迁入 `ui/`，不再直接调用 `fetch`。
- `server/permission-admin-service.ts` 拥有权限管理查询、资源级授权校验、可分配权限组校验以及权限组/人员组原子写入；`server/operator-admin-service.ts` 统一人员筛选、角色/状态更新、当前账号保护和会话失效。
- `app/api/permissions/route.ts` 从 350 行降至 79 行，只保留会话入口、请求解析、服务调用、审计和错误映射。
- `app/api/operators/route.ts` 降至 41 行 HTTP 适配层；`verify:identity-access-module` 同时锁定两个页面、client、两类契约、薄路由、授权规则、事务边界和请求级审计；根级存量领域页从 11 个降至 9 个。

## 37. BOM 成本计算归属

- `contracts/bom-cost.ts` 集中成本快照输入和成本明细写入契约。
- `domain/bom-cost.ts` 以纯函数处理库存/计价单位成本、BOM 产出折算、损耗、成本对象、锯切方案、固定分摊和总成本汇总。
- `server/bom-cost-query-service.ts` 装配可计算物料、默认 BOM 与最近成本快照；`bom-cost-command-service.ts` 负责物料映射、有效 BOM 校验和成本快照写入。
- `app/api/bom-costs/route.ts` 从 340 行降至 45 行，只保留权限、请求解析、服务调用、审计和错误映射。
- `verify:bom-cost-module` 锁定薄路由、查询/命令服务和材料、人工、机时、直接费用、固定分摊纯计算样例；系统超过 300 行的页面与 API 均已清零。

## 38. 派工前端垂直模块归属

- `contracts/dispatch.ts` 集中派工单、可派工工单、客户、工序、状态和优先级契约。
- `client/dispatch-api.ts` 统一派工筛选查询、工单/客户/工序候选、新建和状态流转 HTTP 调用。
- `ui/DispatchPageModule.tsx` 从根级 `app/components` 迁入生产领域，并从 730 行降至 646 行；页面不再直接拼接接口请求，继续协调列表、详情、新建、附件、AI 识别和 PDF。
- 页面渲染注册通过 `modules/production/index.ts` 公开出口加载派工页；宽屏、窄屏和弹窗不再拥有平行入口。
- `verify:dispatch-module` 与既有单据打印、原始凭据和附件管理守卫共同锁定派工边界；根级存量领域页从 13 个降至 12 个。

## 39. BOM 成本保留页面归属

- `client/bom-cost-api.ts` 统一成本工作区、成本数据、计算快照和创建成本对象的 HTTP 调用。
- `contracts/bom-cost.ts` 补充成本页产品、快照、明细、成本对象和工艺展示契约；`model/bom-cost-view.ts` 承接金额/数量/时间格式与千件工艺成本纯计算。
- 未注册到页面注册表的 `BomCostPage.tsx` 不擅自恢复入口，而是迁为 `ui/BomCostPageModule.tsx` 供未来评审后启用；页面从 720 行降至 490 行且不再直接调用 `fetch`。
- `verify:bom-cost-module` 同时锁定成本页面、client、API、查询/命令服务和纯领域规则；根级存量领域页从 12 个降至 11 个。

## 40. 销售订单前端归属

- `contracts/sales-order.ts` 集中客户、销售物料、订单/明细、新建草稿和调价契约。
- `client/sales-order-api.ts` 统一订单查询、候选项、创建、状态流转和调价 HTTP 调用。
- `model/sales-order-view.ts` 维护状态展示、日期/数量/金额格式和空草稿创建纯规则。
- `ui/SalesOrderPageModule.tsx` 从根组件迁入销售领域，从 686 行降至 586 行且不再直接调用 `fetch`；附件、AI 识别、PDF、精确搜索和受控调价交互保持不变。
- `verify:sales-module` 锁定销售页面、client、契约、视图规则和公开入口；根级存量领域页从 9 个降至 8 个。

## 41. 销售履约前端归属

- `contracts/fulfillment.ts` 集中发货、退货、客户、库位、发货物料和退货物料契约，并明确两类物料候选的字段差异。
- `client/fulfillment-api.ts` 统一发货/退货列表、候选项、创建和状态流转 HTTP 调用。
- `ui/ShipmentPageModule.tsx`、`ShipmentCreateDialog.tsx` 和 `ReturnPageModule.tsx` 从根组件迁入销售领域；页面与弹窗不再直接调用 `fetch`。
- 页面注册表只通过 `modules/sales/index.ts` 加载销售订单、发货和退货，宽窄屏与弹窗继续复用相同注册入口。
- `verify:sales-module` 扩展为销售履约边界守卫；根级存量领域页从 8 个降至 6 个。

## 42. 流程转移前端归属

- `contracts/flow-transfer.ts` 集中转移单、表单、物料、库位、员工和状态契约。
- `client/flow-transfer-api.ts` 统一列表及候选项、草稿保存、确认和冲销 HTTP 调用；`model/flow-transfer-view.ts` 承接空表单、状态展示和格式化纯规则。
- `ui/FlowTransferPageModule.tsx` 从根组件迁入生产领域，从 591 行降至 485 行且不再直接调用 `fetch`。
- 页面注册表只通过 `modules/production/index.ts` 加载流程转移；`verify:flow-transfer` 同时锁定模块边界和同物料、同数量、跨库位、总库存/总成本不变及冲销原子性。
- 根级存量页面从 6 个降至 5 个，其中 `SystemPage` 是刻意保留的 31 行兼容分派层。

## 43. 设备资源前端归属

- 新建 `modules/equipment`，由 `contracts/equipment.ts` 集中设备、工作中心和编辑表单契约。
- `client/equipment-api.ts` 统一设备列表、工作中心候选、保存和归档 HTTP 调用；`model/equipment-view.ts` 维护状态展示和空表单。
- `ui/EquipmentPageModule.tsx` 从根组件迁入设备领域，从 246 行降至 210 行且不再直接调用 `fetch`；页面继续复用公共资源页、搜索、视图、排序和弹窗骨架。
- `verify:equipment` 同时锁定前端模块边界，以及工作中心、设备和工艺文档适用关系；根级存量页面从 5 个降至 4 个。

## 44. 员工业务资料前端归属

- `contracts/employee.ts` 集中员工、可选登录账号和编辑表单契约；`model/employee-view.ts` 维护空表单与账号状态/角色展示。
- `client/employee-api.ts` 统一员工/可绑定账号读取和员工保存 HTTP 调用。
- `ui/EmployeePageModule.tsx` 从根组件迁入业务配置，从 263 行降至 214 行且不再直接调用 `fetch`；员工档案仍不拥有账号权限。
- `verify:employees` 同时锁定前端模块边界，以及自动编码、账号一对一绑定、在职校验、业务关联与历史姓名快照；根级存量页面从 4 个降至 3 个。

## 45. 扫码打印与锯切成本工具归属

- 扫码打印的页面、标签视图、Honeywell 设备配置、请求契约和 HTTP client 统一进入 `modules/operations-tools`；协调页从 553 行降至 415 行且不再直接调用 `fetch`。
- 锯切成本的页面、保存面板、请求契约和 HTTP client 统一进入运维工具领域；协调页从 558 行降至 363 行且不再直接调用 `fetch`。
- 材料利用率、锯缝损耗、班次产能、混合规模、负荷和保存快照输入从 React 页面提取为纯计算规则，由 `verify:sawing-cost-module` 使用确定样例验证。
- `verify:scan-print` 增加页面边界、公开入口和根目录回流守卫；模块边界校验现只允许根目录保留 31 行的 `SystemPage` 兼容分派层，不再存在待迁移根级领域页。

## 46. 业务配置参考资料访问层

- `contracts/reference-data.ts` 集中供应商/客户、库位、单位和文档类别的读取与编辑契约；工作中心契约已迁入设备领域。
- `client/reference-data-api.ts` 统一参考资料读取、保存、归档、删除和设为默认等 HTTP 调用，并集中处理 JSON 响应与服务端错误。
- 供应商和客户继续复用一个参数化 `PartySettingsPage`；库位和单位复用公共 `ResourcePage`；树形文档类别复用 `ResourcePageShell`；工作中心由配置分派层通过设备模块公开入口挂载。
- 配置自有页面与工作中心页面均不直接调用 `fetch`，API 路径只存在于各自领域 client；`verify:configuration-modules` 阻止工作中心实现重新回流配置领域。

## 47. 运维维护工具访问层

- `contracts/maintenance.ts` 集中归档记录、操作记录和物料编码规范化契约；页面不再内嵌接口响应类型。
- `client/maintenance-api.ts` 统一归档读取/恢复/永久删除、审计读取和编码规范化请求，并保留冲突响应中的预检结果。
- `model/archive-records.ts` 将九类归档数据映射为统一记录并按归档时间排序，映射逻辑脱离 React 后由确定样例验证。
- 归档、审计和数据工具 3 个页面不再直接调用 `fetch`；页面级直连请求现只剩公共页内选项、生产订单和工作台。

## 48. 页面访问层清零

- 公共 `PageOptionsDialog` 不再自行访问业务单位目录；物料/BOM 页内选项从 `modules/configuration` 公开出口注入读取能力，公共框架继续不依赖任何领域模块。
- 生产订单新增 `contracts/production-order.ts`、`client/production-order-api.ts` 和 `model/production-order-view.ts`；列表、候选、详情和创建请求集中到 client，订单分组和创建输入成为纯规则，协调页从 535 行降至 448 行。
- 工作台新增统计契约、client 和归一化/指标装配模型，并把五类稳定展示面板提取到 `DashboardPanels.tsx`；协调页从 397 行降至 74 行。
- 所有 `*Page` / `*PageModule` 已清除直接 `fetch`；`verify:module-boundaries` 现在把页面请求回流作为全局失败条件。

## 49. 工作台查询服务归属

- `domain/dashboard-production.ts` 拥有生产订单/班后实绩数量和确认主产出值的确定性装配与舍入规则，替代扁平 `lib/dashboard.ts`。
- `server/dashboard-query-service.ts` 拥有日/月时间窗口、并行统计、状态分布、待处理事项和库存预警过滤。
- `app/api/stats/dashboard/route.ts` 从 141 行降至 17 行，只保留权限、查询服务调用和 HTTP 错误映射，不再直接导入 Prisma。
- `verify:dashboard-production-flows` 同时锁定前端页面/client、纯统计规则、查询服务和薄路由边界。

## 50. 生产订单主接口服务归属

- `contracts/production-order-schema.ts` 集中多行和旧单行创建请求校验；单张订单最多 50 项，页面与服务不再各自猜测输入结构。
- `domain/production-order-numbering.ts` 拥有可确定测试的组号和组内行号规则；生产订单编号不再由 Route Handler 内联拼接。
- `server/production-order-query-service.ts` 集中状态、客户、空格分隔多关键词、分页和关联资料装配；`server/production-order-command-service.ts` 集中物料兼容映射、启用 BOM、唯一主产出、BOM 快照、成组创建事务和软归档。
- `app/api/orders/route.ts` 从 257 行降至 84 行，只保留权限、Schema 调用、服务调用、请求级归档审计和 HTTP 错误映射，不再直接访问 Prisma。
- `verify:production-order-module` 同时使用纯规则样例和临时完整 SQLite 验证多行原子创建、编号、BOM 快照、智能查询和归档，不读取本机或服务器正式数据。

## 51. 生产订单详情与状态服务归属

- `server/production-order-query-service.ts` 继续拥有详情关联、同组订单、默认路线、当前待报工工序和启用 BOM 候选项归组；详情与候选 Route Handler 分别降至 24 行和 17 行。
- `domain/production-order-status.ts` 以纯规则表达草稿确认目标状态、重复确认、已完成/已入库/已取消的取消限制；领域错误不再由某一个命令服务私有。
- `server/production-order-status-service.ts` 拥有确认和取消事务。取消时原子恢复已领料成本与库位余额，或释放未领料的总库存/库位预留，同时作废报工并写入取消原因。
- 确认与取消 API 分别降至 23 行和 22 行，只保留权限、Schema、服务调用和错误映射；四个相邻路由均不再直接访问 Prisma。
- 临时完整 SQLite 回归验证详情、候选、确认、重复确认、取消、总库存与库位预留释放、重复取消和追溯保留。

## 52. 生产实绩服务端垂直模块归属

- `contracts/production-order-actual-schema.ts` 集中草稿、确认和冲销输入契约；`domain/production-order-bom-snapshot.ts`、`production-order-actual-cost-snapshot.ts` 与 `production-order-actual-numbering.ts` 分别拥有 BOM 快照、成本层快照和日期编号纯规则。
- `server/production-order-actual-lines.ts` 将订单冻结 BOM 作为可选预设：有快照时计算标准共同投入和多产出，没有快照时接受临时转换；两种模式都校验实际投入、实际产出和库位可用量。与 BOM 对应的明细保留来源 ID，人工增补项来源 ID 为空；`production-order-actual-totals.ts` 统一重算订单完工、废料和状态。
- `server/production-order-actual-service.ts` 拥有工作区查询、草稿创建和删除；`production-order-actual-status-service.ts` 拥有确认投入/产出过账、成本快照、冲销库存/成本层恢复及状态事务。
- 四条实绩 Route Handler 现为 26–43 行，只保留权限、Schema、操作人、领域服务调用、审计和 HTTP 错误映射；扁平 `lib/production-order-actual.ts` 已删除，直接访问 Prisma 的 API 从 82 个降至 78 个。
- 实绩输入/产出界面复用公共 `OneToManyRelationField`、关系搜索和身份展示骨架，不另建生产专用多行控件。实绩编号改为读取当日最大历史序号，删除中间草稿后不会复用已存在编号。`verify:production-order-module` 锁定边界、无 BOM 订单和纯规则，`verify:production-order-actuals` 在运行后删除的临时完整 SQLite 中覆盖 BOM 预设偏差、临时输入/输出、无 BOM 转换、说明门禁、确认、冲销、删除、断号、多产出和库存成本一致性。

## 53. 通用附件生命周期模块归属

- `modules/attachments/contracts` 集中附件所有者、上传、封面/旋转动作和草稿附件输入契约；`domain` 拥有存储片段、扩展名、物料图片判断、权限资源映射及领域错误。
- `server/attachment-query-service.ts` 统一有效附件查询和展示 URL 装配；`attachment-command-service.ts` 统一上传落盘、缩略图/展示图生成、旋转、封面切换、归档后封面接替以及草稿绑定/丢弃；`attachment-authorization-service.ts` 统一附件动作权限、所属业务资源、对象存在性和暂存账号归属校验。
- `client/attachment-api.ts` 是页面和文档、物料领域访问附件 API 的唯一 CRUD 入口；`AttachmentPanel`、草稿附件面板及相邻领域 client 不再重复拼接附件请求。
- 附件主路由保持在 100 行以内，草稿路由保持在 60 行以内；六条附件路由均不直接访问 Prisma。原文件只经受保护的 API 返回，Middleware 阻止 `/uploads/*` 静态直读。
- `verify:attachment-management` 使用运行后删除的临时完整 SQLite 和临时上传目录验证上传、旋转、封面切换、归档接替、草稿绑定及文件清理，同时锁定公共 client 和薄路由边界。

## 54. 销售订单与履约服务端垂直模块归属

- `contracts/sales-order-schema.ts` 与 `fulfillment-schema.ts` 集中订单、调价、发货和退货输入约束；Route Handler 不再各自维护 Zod Schema。
- `domain/sales-document-numbering.ts`、`sales-order-pricing.ts` 与 `sales-order-status.ts` 分别拥有日期编号、默认销售价快照和订单自身状态纯规则；领域错误统一承接库存、库位和兼容物料映射的可预期失败。
- `server/sales-order-*` 拥有订单查询、客户物料交付参考、创建、确认、取消和调价审计；`server/fulfillment-*` 拥有多明细发货/退货查询、创建、归档、过账和状态事务，送货单 PDF 也不再由路由绘制。两组服务不保存彼此外键，也不互相回写。
- 销售订单、发货、货箱和退货共 19 条 Route Handler 保持薄层，只保留权限、Schema、领域服务、请求级审计和 HTTP 错误映射；扁平 `lib/sales-orders.ts` 已删除。
- `verify:sales-order-flow`、`verify:shipment-multi-item` 与 `verify:shipment-item-migration` 使用运行后删除的临时完整 SQLite，覆盖默认价、受控调价、客户物料动态参考、多明细发货、库存成本、送达/PDF、退货恢复、拒绝、查询、归档、历史单行迁移和重复状态拒绝；`verify:sales-module` 防止路由重新承载 Prisma 或事务规则。

## 55. 来料详情与状态事务归属

- `domain/material-in-errors.ts`、`material-in-numbering.ts` 和 `material-in-reversal.ts` 分别拥有可预期领域错误、日期最大序号及整单红冲可逆性/反向数量纯规则。
- `server/material-in-detail-service.ts` 拥有详情装配和待收货编辑；`material-in-status-service.ts` 拥有收货、拒收和整单红冲事务，总库存、库位余额、成本层和成对流水必须在同一事务内一致更新。
- 来料主路由与详情、收货、拒收、红冲共 5 条 Route Handler 均不再直接访问 Prisma，只保留权限、Schema、服务调用、审计和 HTTP 错误映射；直接访问 Prisma 的 API 从 56 条降至 52 条。
- 来料编号改为读取当日最大历史序号后递增，多明细创建在同一事务内连续分配且不会因归档或断号复用已有编号。
- `verify:receiving-module` 使用运行后删除的临时完整 SQLite 覆盖多明细创建、断号、编辑、收货过账、重复状态拒绝、整单红冲恢复、成本层变更阻断、查询、归档和无效供应商，不连接本机测试库或服务器正式库。

## 56. 派工服务端垂直模块归属

- `contracts/dispatch-schema.ts` 统一创建输入；`domain/dispatch-numbering.ts`、`dispatch-status.ts` 和 `dispatch-errors.ts` 分别拥有日期最大序号、五态流转和可预期领域错误。
- `server/dispatch-query-service.ts` 统一列表、客户/工人/状态组合过滤和详情装配；`dispatch-command-service.ts` 拥有工单状态、工序归属、创建和归档；`dispatch-status-service.ts` 原子执行派工、开工、完工与取消。
- `domain/production-order-status.ts` 是新旧订单状态的唯一翻译边界；Material 工单只写 `DRAFT / RELEASED / IN_PROGRESS / COMPLETED / CANCELLED`，历史别名只用于读取和兼容收尾。
- 派工主路由、详情和 4 条状态路由共 6 条 Route Handler 现为 17–67 行，只保留权限、Schema、服务调用、请求级审计与 HTTP 错误映射；直接访问 Prisma 的 API 从 52 条降至 46 条。
- 派工编号改为读取当日最大历史序号后递增，归档、取消或中间断号不会导致编号复用。
- `verify:dispatch-module` 使用运行后删除的临时完整 SQLite 覆盖工序归属、客户/工人/状态组合查询、创建、派工、开工、完工、取消、归档、编号断号和非法重复流转，不连接本机测试库或服务器正式库。

## 57. 流程转移服务端垂直模块归属

- `contracts/flow-transfer-schema.ts` 集中草稿、确认和冲销输入；`domain/flow-transfer-numbering.ts`、`flow-transfer-status.ts` 与 `flow-transfer-errors.ts` 分别拥有日期最大序号、状态约束和可预期领域错误。
- `server/flow-transfer-query-service.ts` 统一记录、物料图片、库位和员工工作区装配；`flow-transfer-command-service.ts` 拥有草稿解析、来源库存校验、创建和编辑；`flow-transfer-status-service.ts` 原子执行确认与冲销。
- 流程转移主路由、编辑、确认和冲销共 4 条 Route Handler 现为 29–48 行，只保留权限、Schema、操作人、服务调用、审计和 HTTP 错误映射；扁平 `lib/flow-transfer.ts` 已删除，直接访问 Prisma 的 API 从 46 条降至 42 条。
- 流程转移编号改为读取业务日期最大历史序号后递增；确认和冲销只改变来源/目标库位余额并写一出一入流水，总库存、计价数量、成本和成本层保持不变。
- `verify:flow-transfer` 使用运行后删除的临时完整 SQLite，通过真实领域服务覆盖工作区查询、编号断号、草稿创建/编辑、来源库存不足、确认、重复状态拒绝、冲销失败原子性及成功恢复，不连接本机测试库或服务器正式库。

## 58. 设备与工作中心完整领域归属

- `modules/equipment/contracts` 集中设备、工作中心和 HTTP 输入 Schema；`domain` 统一编码、写入映射、可预期错误以及禁止普通更新绕过归档校验的规则。
- `server/equipment-*` 与 `work-center-*` 分别拥有组合查询、工作中心有效性校验、新增、迁移、归档和恢复事务。设备只能归属启用且未归档工作中心，归档设备同步进入 `STOPPED`。
- 工作中心页面、搜索模型、契约和 client 从 `modules/configuration` 迁入 `modules/equipment`；业务配置菜单只通过设备模块 `index.ts` 挂载，菜单位置不再决定规则所有权。
- 设备和工作中心 Route Handler 分别从 139/135 行降至 84/85 行，不再直接访问 Prisma，使直接访问 Prisma 的 API 从 39 条降至 37 条。
- `verify:equipment` 使用运行后删除的临时完整 SQLite，覆盖公共 `ResourcePage`、输入清理、唯一编码、组合搜索、设备迁移、引用归档阻断、直接停用旁路封闭、设备归档和工作中心恢复。

### v0.1.369 设备运行事件扩展

- `contracts/equipment-event-schema.ts` 与 `domain/equipment-event-rules.ts` 分别拥有命令输入和合法状态转换；基础资料 Schema 严格拒绝 `status`。
- `server/equipment-event-service.ts` 在一个事务内保存 `EquipmentEvent` 和 `Equipment.status`，恢复负责关闭最近未结束事件并计算持续时间；HTTP 路由不持有 Prisma 事务。
- `ui/EquipmentEditorDialog.tsx` 只编辑基础资料，`ui/EquipmentEventDialog.tsx` 负责运行命令和时间线；协调页继续使用公共 `ResourcePage`。
- `verify:equipment`、`verify:equipment-events-http` 和 `verify:fine-grained-permissions` 分别锁定领域不变式、HTTP 403/201 和第 49 个权限资源。

### v0.1.370 设备周期点检扩展

- `contracts/equipment-inspection-*` 定义计划、项目和完整执行请求；`domain/equipment-inspection-rules.ts` 负责周期推进、工作中心范围、完整清单和汇总结果纯规则。
- `server/equipment-inspection-command-service.ts` 在同一事务保存点检事实、下次到期、审计与可选故障事件；查询服务统一装配到期/逾期/异常计数、设备候选和最近记录。
- 页面、计划弹窗和执行弹窗均通过 `modules/equipment/index.ts` 注册；设备选择复用公共关系字段，记录附件复用公共附件面板，三条 Route Handler 保持无 Prisma 的薄 HTTP 层。
- `verify:equipment-inspections`、`verify:equipment-inspections-http`、`verify:fine-grained-permissions` 和 `verify:sop-fullscreen-help` 锁定数据库不变式、真实 HTTP 403/201、递归升级继承、第 50 个权限资源及帮助新页边界。

### v0.1.371 设备维保与备件过账扩展

- `contracts/equipment-maintenance-*` 定义保养计划、计划/故障工单、完成清单和备件领用请求；`domain/equipment-maintenance-rules.ts` 负责状态机、周期推进、工作中心范围和输入不变量。
- `server/equipment-maintenance-command-service.ts` 在同一 Prisma 事务内协调工单、设备 `MAINTAIN/RECOVER` 事件、计划推进、完整保养结果、审计和备件过账；查询服务统一装配到期/逾期/待办/完成计数、设备和备件候选。
- 备件消耗通过 `modules/inventory/index.ts` 新公开的 `issueInventoryForBusinessReference` 进入现有库存、成本与 FIFO 批次算法；设备模块不导入库存内部文件，也不建立平行库存账。
- 页面、计划/报修/完成弹窗只通过 `modules/equipment/index.ts` 挂载；关系输入复用公共搜索—选择—已选列表骨架，工单附件复用公共附件面板，8 条 Route Handler 仅做权限、Schema、范围、服务调用和 HTTP 映射。
- `verify:equipment-maintenance`、`verify:equipment-maintenance-http`、`verify:fine-grained-permissions`、`verify:role-task-permissions` 和 `verify:attachment-management` 锁定 79 个迁移、不变式、真实 HTTP 403/201、工作中心/库位隔离、第 51 个资源、岗位任务和附件边界。

## 59. 旧生产日报兼容服务归属

- `modules/production/contracts/legacy-daily-production-schema.ts` 统一旧日报创建、编辑、确认和冲销输入；`domain/legacy-daily-production-*` 集中日期解析、最大序号编号、状态约束、数量精度和可预期错误。
- 查询、草稿命令、BOM 耗用快照、数据库异常翻译和确认/冲销事务分别进入 `server/legacy-daily-production-*`；领域规则不依赖 Prisma，扁平 `lib/daily-production.ts` 与 `lib/daily-production-request.ts` 已删除。
- 4 条旧日报兼容 Route Handler 合计从 714 行降至 139 行，只保留权限、Schema、操作人、领域服务、审计与 HTTP 映射，不再直接访问 Prisma，使直接访问 Prisma 的 API 从 37 条降至 33 条。
- 日报编号改为按业务日期读取现有最大序号后递增，避免删除中间草稿后再次生成重复编号；日期规则拒绝不存在的日历日期。
- `verify:daily-production-locations` 使用运行后删除的临时完整 SQLite，通过真实领域服务覆盖输入规则、BOM/人员/库位快照、多关键词查询、草稿更新、确认过账、成本结转、冲销恢复和非法重复状态。
- 该切片不恢复旧页面、不修改 Prisma Schema，也不触碰本机测试库或服务器正式数据；生产订单实绩仍是唯一正式入口。

## 60. 单位配置生命周期归属

- `modules/configuration/contracts/unit-schema.ts` 集中新增、修改和单位身份输入；`domain/unit-rules.ts` 以纯 TypeScript 表达单位身份判等、同量纲编码判重及语义变更判断。
- `server/unit-query-service.ts` 统一装配预置/自定义单位目录和物料、BOM 使用量；`server/unit-command-service.ts` 在事务中执行自定义单位新增、修改和删除，并保护预置单位及已被引用单位的编码、量纲和换算系数。
- `/api/system/units` 从 228 行降至 79 行，只保留登录/权限、Schema、领域服务、审计和 HTTP 错误映射，不再直接访问 Prisma 或承载单位生命周期规则，使直接访问 Prisma 的 API 从 33 条降至 32 条。
- `lib/unit-catalog.ts` 暂保留跨物料、BOM 和排序服务共用的目录读取及换算基础能力；配置写入只允许通过配置领域命令服务进入，避免调用方自行改写 `SystemSetting` JSON。
- `verify:unit-catalog` 使用运行后删除的临时完整 SQLite，覆盖单位换算、BOM 录入、输入校验、大小写判重、预置保护、已使用单位仅可改名、删除阻断和使用量汇总，不连接本机测试库或服务器正式库。

## 61. 员工档案完整领域归属

- 员工页面、浏览器 client 和展示契约继续归 `modules/configuration`；新增输入 Schema、自动编号纯规则、领域错误、查询、写入和有效员工引用服务，使员工资料形成完整垂直切片。
- `server/employee-query-service.ts` 统一员工多关键词查询和可绑定账号候选投影；`employee-command-service.ts` 在事务中生成 `EMP-000001` 编码、分配人工顺序、校验账号存在及一对一绑定并保存资料。
- `resolveActiveEmployees` 与 `employeeNamesSnapshot` 通过配置模块唯一公开出口提供给生产领域；生产实绩只消费员工引用和姓名快照，不再从扁平 `lib/employees.ts` 复制或拥有员工规则。账号审核、角色和权限仍由 `modules/identity-access` 独立管理。
- `/api/employees` 从 185 行降至 61 行，只保留权限、查询参数/Schema、配置领域服务、审计和 HTTP 映射，不再直接访问 Prisma，使直接访问 Prisma 的 API 从 32 条降至 31 条；旧 `lib/employees.ts` 已删除。
- `verify:employees` 使用运行后删除的临时完整 SQLite，覆盖薄路由、编号断档、人工顺序、部门/账号搜索、账号一对一绑定、有效员工解析、停用阻断、生产历史姓名快照和账号删除后自动解绑。

## 62. 文档类别完整领域归属

- 文档类别仍从“业务配置 / 文档类别”进入，但页面位置不决定代码所有权；页面、管理面板、浏览器 client、输入 Schema、层级纯规则、查询和写入事务统一归 `modules/documents`。
- 文档类别页面继续复用公共 `ResourcePageShell`、`ResourceAdvancedSearch`、`AppButton` 和 `SearchableSelect`，渲染注册表只通过文档模块公开入口挂载，不建立配置领域或根级组件副本。
- `/api/document-categories` 从 100 行降至 73 行，只保留权限、Schema、文档领域服务、审计和 HTTP 映射；旧 `lib/document-categories.ts` 已删除，使直接访问 Prisma 的 API 从 31 条降至 30 条。
- `verify:document-categories` 使用运行后删除的临时完整 SQLite，覆盖名称规范化、两级层次、同层判重、父级变更、引用保护和删除；静态边界同时阻止路由、配置模块或根级组件重新拥有文档类别规则。

## 63. 业务单据打印横切模块归属

- 新增 `modules/business-documents` 作为跨销售、来料和生产领域的单据展示平台：`contracts` 集中 7 类单据和打印投影，`domain` 拥有类型/权限/附件所有者映射与格式化纯规则，`server` 拥有查询投影、A4 PDF 渲染、归档缓存和强制重生成。
- 业务单据打印链接、预生成 client 和“系统生成单据 + 附件管理”详情骨架从根级 `app/components` 迁入模块；各调用页面只通过 `modules/business-documents/index.ts` 使用公开能力，详情内部继续复用公共 `ModalDialog` 和 `AttachmentPanel`。
- 打印 Route Handler 从 211 行降至 42 行，只保留单据类型识别、资源权限、生成权限、领域服务调用和 PDF HTTP 响应；旧 `lib/business-document-pdf.ts` 已删除，使直接访问 Prisma 的 API 从 30 条降至 29 条。
- `verify:business-document-print` 使用运行后删除的临时完整 SQLite 和上传目录，覆盖 7 类定义、流程转移打印投影、A4 PDF、首次归档、普通补打缓存复用、强制重生成新版本和缺失单据；不会触碰本机测试库、上传目录或服务器数据。

## 64. 旧生产订单执行接口兼容归属

- 当前页面唯一生产过账入口仍是生产订单详情中的 `ProductionOrderActualPanel`；生产页面和其 client 均不调用 `/api/orders/:id/pick`、`reports` 或 `stock-in`。
- 服务器可能仍保存 `PickItem`、`WorkReport` 和 `StockIn` 历史记录，因此三个 URL 不直接删除；但只允许处理 `materialId=null` 的历史工单，物料工单固定返回 `410`。`contracts/legacy-production-order-execution-schema.ts` 集中兼容输入，`domain/legacy-production-order-execution-rules.ts` 以纯规则表达兼容拒绝、状态、工序顺序和报工完成状态。
- 三个 `server/legacy-production-order-*` 服务分别拥有领料成本/预留事务、报工查询与状态事务、旧入库余额与流水事务；首次创建产出库存时同样写 `StockLog`，避免余额与流水断裂。
- 三条 Route Handler 合计从 501 行降至 80 行，只保留 `orders` 权限、Schema、领域服务、领料审计和 HTTP 映射，不再直接访问 Prisma，使直接访问 Prisma 的 API 从 29 条降至 26 条。
- `verify:production-order-execution` 在运行后删除的临时完整 SQLite 中覆盖领料、非连续工序号的上一工序防呆、报工状态、质检后入库、首次库存流水和重复入库拒绝；不连接本机测试库或服务器正式库。
- 后续只有在服务器旧记录盘点、备份及可回滚迁移完成后才可删除这些兼容模型或 URL；不得把本机测试数据作为下线依据。

## 65. 成本能力按既有领域边界归属

- 成本不是独立的大领域：BOM 可引用成本对象及其版本归 `modules/bom`，锯切试算方案及同步生成成本对象的事务归 `modules/operations-tools`，生产工单的成本记录、分页和统计归 `modules/production`。
- `cost-objects`、`sawing-cost-scenarios` 与三条 `costs` Route Handler 不再持有 Prisma 查询、写入或事务；5 条路由合计均不超过 60 行，只保留权限、Schema、领域服务、审计和 HTTP 响应。
- 锯切方案、分项成本和 BOM 可引用成本对象继续在同一数据库事务中创建；BOM 成本对象首版成本也由命令服务一次写入，页面仍通过原有领域 client 调用，不改变入口和交互。
- 直接访问 Prisma 的 Route Handler 从 26 条降至 21 条；`verify:cost-domain-services` 使用运行后删除的临时完整 SQLite 覆盖成本对象首版、锯切事务、已有物料校验及生产成本列表/统计，不连接本机测试库或服务器正式库。

## 66. 扫码、标签与系统维护能力归属

- 扫码会话、事件、撤销、完成及标签打印任务的 Schema、编号/分类纯规则、查询和幂等事务统一归 `modules/operations-tools`；4 条 API 合计 120 行且不再直接访问 Prisma。
- 归档列表、永久删除、恢复、审计查询、数据一致性修复和物料编码规范化也归运维工具领域；原 `lib/archived-record-purge.ts`、`data-integrity.ts`、`material-code-normalization.ts`、`scanning.ts` 与 `soft-delete.ts` 已迁移，不保留扁平兼容副本。
- 归档/维护及物料归档相关 6 条 Route Handler 仅保留权限、Schema、领域服务、请求级审计和 HTTP 映射；直接访问 Prisma 的 Route Handler 从 21 条降至 12 条。
- `verify:scan-print` 使用运行后删除的临时 SQLite 覆盖会话/事件/打印任务幂等、撤销和完成状态；归档删除与编码规范化验证也改用临时 SQLite，所有验证均不连接本机测试库或服务器正式库。

## 67. 平台 Route Handler 清零直连 Prisma

- 密码认证、注销、首位管理员和微信账号绑定归 `modules/identity-access`；Route Handler 只负责请求解析、Cookie、重定向和 HTTP 错误映射。
- AI 文档识别归 `modules/attachments`：附件所属业务权限、暂存账号归属、可识别类型、Provider 超时、JSON 解析和高置信度结果规则不再由路由承载。
- 工作区偏好、物料导出/兼容查询、生产与质量统计、配置人工排序分别归 `modules/workspace`、`modules/materials`、`modules/production` 与 `modules/configuration`。
- 跨领域调用配置排序时必须经过 `modules/configuration/index.ts` 公开入口；禁止引用其他模块的 `server` 子路径。
- 直接访问 Prisma 的 Route Handler 从 12 条降至 0 条。数据库事务继续存在于所属领域服务，而不是被隐藏在通用 HTTP 工具中。
- 认证和 AI 识别新增局部契约验证；身份回归使用运行后删除的临时 SQLite，不连接本机测试库或服务器正式库。

## 68. 根组件与 UI 访问边界停止线

- `app/components` 根目录只保留应用壳、公共按钮/表单/弹窗/工具栏、搜索排序、显示偏好和少量全局平台组件；附件、文档、生产、配置、运维、物料、工作区及系统显示组件全部归回所属模块。
- 附件和物料选择等跨领域能力通过模块 `index.ts` 公开出口复用；模块内部不得经自己的公开出口反向导入，避免循环依赖。
- 页面、组件和 UI Hook 不得直接调用 `fetch`。HTTP 请求只允许出现在 `modules/<domain>/client` 或明确的服务端 Provider 适配层；生产实绩、配置排序、身份、AI 助手和工作区导航均已补齐 client。
- `verify:structural-goal` 固定最终结构底线：114 条 Route Handler 直连 Prisma 为 0、UI 直接请求为 0、超 800 行页面为 0、超 300 行路由为 0，所有模块必须存在公开入口，且 Tailwind 必须覆盖模块 UI 源码。
- 39 个注册页面继续强制公共顶部工具栏，并由 6 类公共骨架承载；领域组件迁移后仍由同一套 Tailwind 配置生成样式，不能因目录变化出现无样式或空白状态。

## 69. v0.1.372 质量标准、抽样与趋势扩展

- 标准输入、版本/趋势契约、抽样纯规则、查询与生命周期服务统一归 `modules/quality`；6 条新增 Route Handler 只负责会话、细粒度权限、Schema、领域服务和 HTTP 错误映射，不直接访问 Prisma。
- 生产与销售领域只通过 `modules/quality` 公开入口创建带标准快照的待检任务；质量附件只通过 `modules/attachments` 公开入口与公共 `AttachmentPanel` 接入，不从质量模块导入其他领域的 `server` 子路径。
- 质量任务页面保留专用事务工作区，因为标准版本、逐项判定、库存处置和趋势不是普通 CRUD；外围继续复用 `ModalDialog`、`ManyToOneRelationField`、`AttachmentPanel`、公共按钮和工作区渲染注册表。
- `verify:quality-inspection-standards` 与 `verify:quality-inspection-standards-http` 使用运行后删除的临时完整 SQLite，覆盖 80 个迁移、标准不可变、自动抽样、任务快照、逐项结果、趋势与真实 HTTP 权限边界。

## 70. v0.1.373 来料检验与接收边界

- `modules/receiving` 继续拥有收货、批次、库存、成本和红冲事务；它只能通过 `modules/quality/index.ts` 公开入口查询来料标准、建立任务和准备质量回滚，不导入质量模块 `server` 子路径。
- `modules/quality` 统一拥有生产、来料、退货三类标准快照与检验生命周期；来料不建立第二套 QC 表，仓库命令不能替代 `quality.read` / `qualityDecision.update`。

## 71. v0.1.374 来料命令权限边界

- `modules/receiving` 继续唯一拥有来料编辑、收货/拒收和红冲领域服务；权限资源只在应用壳与 Route Handler 检查，不进入领域服务。
- `materialIn` 负责页面读取和草稿维护，`materialInReceive.update` 负责收货/拒收，`materialInReverse.update` 负责有原因红冲；仪表盘待收货任务使用同一收货命令资源。
- 既有权限安装不从 `materialIn.update` 自动继承两个高风险命令，避免质量岗位、旧角色、自定义组或个人例外在升级后意外获得库存过账/冲销权。
- 页面继续复用 `MaterialInPage`、`MaterialInCollectionView`、公共工具栏、按钮和详情/附件模块，只增加稳定权限布尔值，不复制来料页面或库存事务。
- 第 81 个迁移只扩展质量来源与取消保护，不新增模型。`verify:incoming-quality-inspections` 与 `verify:incoming-quality-inspections-http` 使用临时完整 SQLite，覆盖受控/非受控多行收货、隔离、判定、红冲、仓库与质检权限及库位数据范围。

## 72. v0.1.375 物流状态命令权限边界

- `modules/sales` 继续唯一拥有发货与退货状态机、库存/成本/批次事务；`modules/production` 继续唯一拥有流程转移事务。权限资源只在应用壳与 Route Handler 校验，不进入领域服务或复制第二套库存逻辑。
- `shipmentDispatch`、`shipmentDeliver`、`shipmentCancel`，`returnReceive`、`returnReject`，以及 `flowTransferConfirm`、`flowTransferReverse` 分别拥有一个状态命令；通用 `shipment`、`return`、`flowTransfers` 只负责页面读取和草稿维护。
- 七个命令是显式审批升级资源，既有角色、内置/自定义组和个人覆盖补齐时默认关闭。取消发货、拒绝退货和流程转移冲销必须填写原因；发货与退货状态命令另写请求级审计。
- 页面复用既有发货、退货和流程转移工作区，只通过应用壳注入稳定的命令能力；仪表盘仓库待办使用正向命令资源，不因通用编辑权限出现。
- `verify:role-task-permissions`、`verify:role-task-http-permissions`、销售与流程转移领域回归在隔离 SQLite 中覆盖普通执行、高风险主管动作、403 边界、原因审计以及库存/成本守恒；本版本不修改 Prisma Schema 或迁移。

## 73. v0.1.376 生产实绩执行上下文边界

- `modules/production/server/production-order-actual-context-service.ts` 统一拥有订单工作中心推导、设备/作业文件候选查询、选择 ID 校验、来源重新解析、快照装配和确认前上下文断言；Route Handler 与 UI 不复制这些规则。
- 设备和文档仍分别由 `modules/equipment`、`modules/documents` 拥有主数据生命周期；生产领域只读取当前有效来源并生成实绩事实，不反向修改主数据，也不从其他模块导入 `server` 子路径。
- UI 复用公共 `OneToManyRelationField` 和 `RelationSearch`，只提交来源 ID 与例外原因；`ProductionOrderActualPanel` 负责编排实际日期、人员、执行上下文、投入和产出，不把候选安全边界放在浏览器。
- `ProductionOrderActualEquipment` 与 `ProductionOrderActualWorkInstruction` 是生产领域拥有的不可变快照。确认服务与数据库触发器同时要求每类“快照或原因”，并保护已确认/已冲销上下文不可更新或删除。
- `verify:production-actual-context` 使用临时完整 SQLite，覆盖候选过滤、重复/非法 ID、快照、来源漂移隔离、例外原因、确认必填和数据库旁路；它进入 33 项 CI 领域基线。

## 74. v0.1.377 生产 Schema 漂移工具边界

- `scripts/audit-production-schema-drift.mjs` 只负责稳定复制证据、从精确 Git 提交构建迁移基线、比较物理对象与 Prisma 语义 diff，以及生成不可覆盖报告；它不打开或修改源 SQLite。
- `scripts/prepare-production-schema-reconciliation-candidate.mjs` 只消费哈希与提交一致的审计报告，先归档退役数据，再对新建 `.partial` 候选执行绑定 diff；完整性和后置零漂移通过后才原子更名。
- 这两个脚本属于运维交付工具，不进入业务模块、Route Handler 或 Web 管理入口；生产切换仍必须使用一致备份、应用恢复演练、业务签字和可回切 Coolify 挂载。
- `verify:production-schema-drift` 使用临时清洁库与合成漂移库，回归零漂移、有数据退役表、额外列、报告不覆盖、源哈希不变和收敛后零漂移；它进入 34 项 CI 领域/治理基线。

## 75. v0.1.384 系统 SOP 文档库发布边界

- `scripts/sop-library-publication.ts` 是显式运维入口，不是新业务模块、页面或 Route Handler。它编排既有文档、附件、权限和审计数据，但不会被 Webhook、容器启动或数据库迁移调用。
- 维护命令默认只读，生产写入需要当前应用精确版本、同一清单的 PDF/DOCX、启用的文控账号和一致备份引用。文件先进入 `DRAFT` 文档；最终状态切换、旧版归档和发布审计保持在同一 SQLite 事务。
- `lib/audit-core.ts` 只拥有审计快照序列化和数据库写入，不依赖 Next.js；`lib/audit.ts` 继续拥有登录账号、IP 和 User-Agent 等 HTTP 上下文。既有业务服务仍从原入口使用事务审计，独立维护包只复用纯核心。
- 生产构建将维护入口打包为 `.next/maintenance/sop-library-publication.mjs`，Docker 运行镜像只复制该包，不复制 TypeScript、`tsx`、最终 SOP 成品或完整开发依赖。
- `verify:sop-library-publication` 使用运行后删除的全迁移临时 SQLite、附件目录和本地 OSS 模拟，覆盖零写入预检、权限、精确版本下载、备份门禁、断点续传、原子启用、旧版归档、幂等和内容漂移阻断；它进入 40 项 CI 领域/治理基线。

## 76. v0.1.412 CAD 图纸预览边界

- `modules/attachments` 继续拥有附件权限、缩略图和公共文件查看器；DWG/DXF 识别、派生 URL 与 PDF 查看均进入既有附件链路，不建立 CAD 业务页面或第二套附件模型。
- `lib/files/cad-document-preview.ts` 只实现通用内部转换协议、超时、响应校验、原子持久缓存和并发去重，不包含 ODA/Autodesk SDK，也不访问 Prisma。具体 CAD 引擎运行在隔离服务中，可在不改 MES 代码的情况下替换。
- 原始 DWG/DXF 是唯一事实源，派生 PDF 和缩略图只是可重建缓存。CAD 服务未配置或不可用时 readiness 为警告，主业务、原文件下载和权限校验不受影响。
- `verify:attachment-file-types` 锁定 CAD MIME/扩展名识别与统一查看器；`verify:cad-preview` 通过本机模拟服务验证 Bearer 令牌、健康检查、有效 PDF、持久缓存和非 CAD 拒绝。

## 77. v0.1.414 LibreDWG 试用转换服务边界

- `services/` 只容纳具有独立运行时、独立容器和明确内部协议的辅助服务，不作为跨领域业务代码的大筐目录；业务服务仍归所属 `modules/<domain>`。
- `services/cad-preview/` 实现 v0.1.412 已冻结的内部协议：LibreDWG 只负责 DWG→DXF，ezdxf/PyMuPDF 只负责 DXF→PDF。它不读取 Prisma、会话、附件卷或其他业务数据，输入只存在于自动清理的临时目录。
- 该服务为 2D 只读试用引擎。原 DWG/DXF 仍是唯一事实源，MES-lite 的权限、缓存、查看器和下载降级保持不变；引擎失败不能改变业务状态，也不能阻止主应用就绪。
- GitHub Actions 构建独立镜像并在镜像内真实执行 DXF 直转及 DXF→DWG→DXF→PDF 冒烟；`verify:libredwg-cad-preview` 锁定协议、上传限制、鉴权、非 root、临时目录、依赖版本和部署/许可说明。

## 78. v0.1.450 架构量化与非回退基线

- `audit:architecture` 统一统计源码规模、领域模块、API、Prisma 模型、跨模块依赖、跨层访问、巨型文件、跨文件精确/结构克隆和 Product/Material 双轨模型；`--json` 提供机器可读快照。
- `verify:architecture-baseline` 对照 `code-architecture-baseline.json` 阻止新增深层跨模块导入、UI 直接请求、路由直连 Prisma、依赖环、巨型文件和克隆冗余增长；指标下降后应同步下调预算，不允许用扩大预算掩盖普通功能变更。
- UI 请求扫描从仅检查 TSX 扩展到模块 `ui/` 下的 TS/TSX；SOP 目录请求迁入 `modules/sop/client` 后，UI 直接 `fetch` 从 1 处降至 0。
- 当前循环依赖不是三座互不关联的小环：七个模块形成一个强连通分量，其中三组是直接双向依赖。治理时先打断直接双向边，再复测整个强连通分量是否消失。
