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

首次扫描基线：`origin/main`，提交 `5c78233`。当前增量复核已包含应用壳状态控制器第三阶段拆分。

| 现状 | 扫描结果 | 判断 |
| --- | ---: | --- |
| `app/page.tsx` | 5 行 | 已收敛为应用入口；应用壳继续由 `HomeApp.tsx` 承担 |
| `app/HomeApp.tsx` | 854 行 | 已提取账号菜单、页面宿主、页面连续性、工作区偏好和桌面导航控制器；继续只承担应用壳装配 |
| `app/components/shell/` | 8 个文件 | 已建立账号菜单、导航图标、页面宿主、渲染适配器和三类状态控制器的公共应用壳边界 |
| `lib/page-registry.ts` | 38 个页面定义 | 页面元数据、权限资源、工作区入口、系统分区、打开方式和渲染键已集中为单一事实源 |
| `app/components/` 根目录 | 67 个文件 | 公共原语、领域页面、业务弹窗和系统页面仍有混放，继续按“修改到哪里，迁移到哪里”收敛 |
| `MaterialPage.tsx` | 3186 行 | 物料、BOM、附件和多种视图交织，应迁入物料领域并继续拆分 |
| `SystemPage.tsx` | 1948 行 | 已完成部分配置模块拆分，剩余业务设置和维护工具继续迁出 |
| `MaterialInPage.tsx` | 1679 行 | 来料页面和录入流程高度集中，应迁入来料领域 |
| `WorkInstructionPage.tsx` | 1497 行 | 文档资源、编辑器、附件和关联编辑集中，应迁入文档领域 |
| `MaterialPanoramaPage.tsx` | 1485 行 | 属于物料领域的专用展示，不应继续留在公共组件根目录 |
| `prisma/schema.prisma` | 1465 行 | 当前继续作为单一事实源，不为目录整齐强拆 Schema |
| `lib/` | 57 个根文件 | 领域规则、平台基础设施、格式化工具和配置仍有混放 |
| `modules/` | 14 个文件 | 已有工作台、生产、库存和配置模块入口，但领域覆盖率仍低 |
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
| `MaterialInPage.tsx`、`app/api/material-ins`、`material-in-*` | `modules/inbound` |
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
- `modules/production` 拥有生产订单查询、创建、详情、实绩入口和单据 PDF 操作。
- `modules/inventory` 拥有库存查询、筛选、视图、数据一致性提示和库存调整状态。
- 三个模块均以根目录 `index.ts` 作为唯一公开出口，`app/HomeApp.tsx` 只负责动态挂载公开入口。
- 模块 UI 继续复用 `app/components` 中现有公共搜索、工具栏、视图、表格、弹窗、附件和打印能力；本阶段不复制公共框架。

本次迁移只改变代码所有权和导入边界，不改变 API、Prisma 模型、权限资源、业务状态流转或页面布局。其余领域继续按增量原则迁移。

## 16. 应用壳与页面注册增量结果

应用壳前两步已经落地：

- `app/page.tsx` 只负责装配 `HomeApp`，不包含业务实现。
- `app/components/shell` 已拥有账号菜单、导航字符图标、页面宿主和页面渲染适配器。
- `lib/page-registry.ts` 是页面名称、类型、路由状态、权限资源、工作区入口、系统分区、打开方式和渲染键的唯一事实源。
- `app/app-navigation.ts`、`lib/page-modules.ts` 和 `HomeApp.tsx` 只从注册表派生菜单、页面定义和当前页面，不再维护平行页面清单。
- React 动态加载留在客户端渲染适配层，避免基础注册表依赖 React 或 Next.js；适配器键由注册表约束并通过脚本检查完整性。

应用壳状态控制器第三步已经落地：

- `usePageNavigationController.ts` 统一管理当前页面、物料子页、BOM 编辑目标、URL 同步、页面连续性和滚动位置恢复。
- `useWorkspacePreferenceController.ts` 统一管理工作台布局偏好、固定入口和功能使用次数上报。
- `useDesktopNavigationController.ts` 统一管理导航显示偏好、工作区形态、自动隐藏、侧栏尺寸、拖动和键盘调整。
- `HomeApp.tsx` 不再直接读写页面连续性、工作区偏好和桌面导航存储，行数从 1233 行降至 854 行。
- `verify:shell-controllers` 阻止上述职责重新回流应用壳，并把 `HomeApp.tsx` 的当前规模上限固定为 900 行。

下一步应进入物料与 BOM 领域迁移；页面注册与菜单分类仍只使用现有单一事实源。
