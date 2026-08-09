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
| `lib/page-registry.ts` | 38 个页面定义 | 页面元数据、权限资源、工作区入口、系统分区、打开方式和渲染键已集中为单一事实源 |
| `app/components/` 根目录 | 61 个文件 | 物料、全景、BOM 全览和来料页已迁出；公共弹窗只保留一个全屏切换组件，其他领域页面、业务弹窗和系统页面仍继续按增量原则收敛 |
| `modules/materials/ui/MaterialPage.tsx` | 709 行 | 数据契约、HTTP client、详情、编辑、导入、集合视图、页内选项、显示偏好、双形态工具栏、BOM 工作区和草稿编辑均已拆出；当前只保留物料/BOM 页面协调 |
| `SystemPage.tsx` | 31 行 | 已收敛为业务配置、系统设置、运维工具和生产工程的纯领域分派兼容层 |
| `modules/receiving/ui/MaterialInPage.tsx` | 684 行 | 集合、编辑和详情任务已拆出；主页只协调查询、分页与任务弹窗 |
| `modules/documents/ui/WorkInstructionPage.tsx` | 591 行 | 只保留文档读写、搜索、分页与子模块状态协调；集合、表单、详情/附件和全屏查看已分离 |
| `modules/materials/ui/MaterialPanoramaPage.tsx` | 187 行 | 契约、视图模型、六组业务展示任务、布局弹层和文件查看器均已拆出，只保留协调职责 |
| `prisma/schema.prisma` | 1465 行 | 当前继续作为单一事实源，不为目录整齐强拆 Schema |
| `lib/` | 57 个根文件 | 领域规则、平台基础设施、格式化工具和配置仍有混放 |
| `modules/` | 129 个文件 | 已有工作台、生产、库存、配置、物料、BOM、系统设置、运维工具、文档和来料 10 个模块；生产工程、物料、BOM、文档、来料与库存已形成包含服务端规则的垂直分层 |
| `app/api/` | 114 个 `route.ts` | 路径结构基本合理，但部分路由仍直接承载大量领域规则 |

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
| 附件上传、缩略图、Office/PDF 预览、存储适配 | `modules/attachments`；通用文件底座可下沉 `lib/files` |
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
- `modules/configuration` 拥有客户、供应商、单位、库位、工作中心、文档类别以及企业与业务规则配置页。
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
- `modules/system-settings` 拥有显示、导航和 AI 三个设置分区，并通过统一 `SystemSettingsPageShell` 保持页面层级与布局一致。
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

## 29. 生产实绩唯一入口与旧日报兼容边界

- 生产订单详情中的 `ProductionOrderActualPanel` 是当前唯一可达生产实绩入口，覆盖草稿、确认过账、投入与多产出库存原子更新、删除草稿和冲销。
- 旧 `StatsPage.tsx` 自生产订单实绩闭环上线后已不在页面注册、导航或应用壳中，继续拆分只会维护第二套不可达交互，因此删除其 936 行前端实现。
- 工作台功能键删除失效的 `stats` 快捷入口，历史浏览器偏好中的该键在规范化时自动丢弃；权限资源 `stats` 仍用于统计接口和暂未拆分的流程转移权限，不与工作台键混为一谈。
- 服务器可能存在 `DailyProductionReport` 历史正式数据，因此本轮不删除 Prisma 模型、迁移、关联保护或 `/api/daily-production-reports*` 兼容接口。是否迁移并下线旧数据模型必须另行执行可回滚的数据迁移。
- 根级存量领域页面从 14 个降至 13 个，超过 800 行的页面从 3 个降至 2 个。

## 30. 库存前端垂直模块归属

- `contracts/stock.ts` 集中库存、库位、包装穿透、客户、一致性问题和调整草稿契约，页面与子任务不再复制响应结构。
- `client/stock-api.ts` 封装库存查询、缺失库存补齐、客户与库位选项以及库存调整提交，协调页不再直接调用 `fetch`。
- `model/stock-view.ts` 集中分类标签、数量格式、占用库位、展示名称、调整草稿和调整后总量等纯规则。
- `StockCollectionView.tsx`、`StockDetailPanel.tsx`、`StockAdjustmentDialog.tsx` 与 `StockIntegrityAlert.tsx` 分别拥有集合、详情、调整和一致性处理任务。
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
- `server/stock-integrity-service.ts` 负责读取异常记录和受控补齐缺失的零余额；`server/stock-command-service.ts` 统一修复与原子库存调整入口。
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
