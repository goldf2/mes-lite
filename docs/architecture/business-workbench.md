# 宇峰业务平台：一级应用入口与真实功能接入

v0.1.493 将平台入口与原 MES 专用界面分开。宇峰业务平台使用 `https://work.csyufeng.com/`，MES Lite 继续使用 `https://mes.csyufeng.com/`；两域由同一 Web 部署提供，原 MES 根首页和深链不变。平台域根路径在服务端精确改写为 `/platform`，旧 `/workbench` 导向配置的平台入口。平台复用现有公共应用壳，但不是另一份 MES 仪表盘，也不复制业务系统。MES 与数据平台的代码库、数据库、登录会话和发布流程继续独立。

## 一级应用与业务分类

平台一级仅展示当前目录中实际可用的两个业务应用：

| 一级应用 | 当前真实范围 | 进入行为 |
| --- | --- | --- |
| MES Lite | 生产、销售、物料、库存、收发及本厂设备 | 进入原 MES 首页 `/?page=dashboard`；无首页入口时使用第一个已授权本地功能 |
| 客户管理 | 数据平台正式客户、联系人、地点和地图，以及客户设备、型号和安装服务资料 | 进入客户应用落地页，聚合客户与服务两个模块中当前已授权的真实入口 |

MES Lite 已覆盖制造经营环节，范围超过狭义的生产执行 MES；不能因此称其为完整 ERP，也不新建没有实际功能的 ERP、WMS 或独立系统管理应用。`business-applications.ts` 从已授权功能目录与 `business-modules.ts` 派生应用及域内模块，导航分类不授予业务权限。

生产、销售、收发、库存、物料、本厂设备及系统管理保留为 MES 内部业务分类。数据平台的客户和服务分类归入客户应用；本厂设备与客户设备继续分开。此前九个业务模块的稳定键与旧模块目的地保留兼容，不再平铺为九个与 MES 首页并列的一级应用。

## 平台总览与 MES 专用界面

平台总览显示平台标题、一级应用卡片、全局功能搜索和个人收藏；“功能目录”是次级工具入口。平台总览和平台目录不显示 MES 长侧栏、默认快捷功能目录或生产经营统计，也不把“MES Lite 首页、全部功能、宇峰业务平台”并列为侧栏中的三个首页。

原 MES 首页继续显示实际岗位待办、生产/库存/交付统计及本地常用入口。原 MES 页、其“全部功能”和侧栏仅消费本地真实目录，不混入数据平台外链；平台入口由顶部应用切换器提供。MES 业务页沿用完整 MES 分类菜单，不因进入某个单页而丢失其它 MES 业务分类。客户应用侧栏只显示数据平台入口。

平台搜索、收藏与平台目录使用已授权的本地和数据平台合成目录。从平台打开本地功能，使用服务器传入的公开 MES 地址完整导航到 `mes.csyufeng.com` 下原精确页面；返回平台使用公开平台地址 `work.csyufeng.com`。外部功能继续进入数据平台精确目的地。所有目录都来自同一注册表和权限结果，不复制业务页面、创建空统计或用静态草图代替真实页面。

| 功能 | 真实入口 | 原有 API |
| --- | --- | --- |
| 平台总览 | `https://work.csyufeng.com/`；平台域根路径 rewrite `/platform`，`/workbench` 兼容入口 | 真实功能目录及当前人员偏好 |
| 平台全局目录 | `https://work.csyufeng.com/?page=allFunctions` | 权限过滤的本地与数据平台合成目录 |
| MES 独立首页 | `https://mes.csyufeng.com/`、`/?page=dashboard` | `/api/stats/dashboard` |
| MES 全部功能 | `/?page=allFunctions` | 权限过滤的 MES 本地目录 |
| 客户应用落地页 | `https://work.csyufeng.com/?page=businessWorkbench&module=customers`，仅客户服务可用时使用 `module=service` | 数据平台精确外链目录，不读取或复制外部业务数据 |
| 销售订单 | `/?page=salesOrders` | `/api/sales-orders` |
| 生产订单及进度 | `/?page=orders` | `/api/orders`、订单详情及实绩接口 |
| 生产日报 | `/?page=dailyInventory` | `/api/daily-production-shortcut` |
| 库存管理 | `/?page=stocks` | `/api/stocks` |
| 发货管理 | `/?page=shipment` | `/api/shipments` |

`orders` 只表示生产订单，销售使用 `salesOrders`。没有新增“生产任务”“各工序进度”“按订单交付查询”等占位页面。生产进展仍以实际订单的计划、完成、报废、状态与实绩为准；销售交付参考仍是既有客户＋物料动态统计。

## 数据平台真实入口与独立边界

`modules/workspace/domain/data-platform-functions.ts` 仅描述已核对的八个跨应用页面：客户、联系人、地点、客户设备、型号、安装及客户/设备地图。不复制联系人或地图，不创建代理业务数据，不把本地地图订单图层称为 MES 订单统计。

非秘密构建变量 `NEXT_PUBLIC_DATA_PLATFORM_WORKSPACE_URL` 默认 `https://fix.xiangshu.me/workspaces/local/default`，未来域名/工作区可替换。Docker builder 已声明同名 ARG；公开目标在构建时嵌入客户端，域名修改后需重建。显式空值关闭外部入口；非 HTTPS、带账号密码/查询/片段或非工作区路径的值不产生链接。

外链使用目标应用 `/login?next=<精确本地业务路径>`，只传本地 `next`，不转发 MES Cookie、Token 或用户自报身份。MES 对应客户/设备读取权限决定入口是否可见，目标仍独立完成 Casdoor 登录与本地业务授权。统一入口不表示跨站单点登录、统一注销、联系人共享或 MES 订单统计上图已经完成。

数据平台既有返回配置 `APP_PORTAL_URL=https://mes.csyufeng.com/workbench` 通过兼容入口仍可到达配置的平台域；无需合并代码库或立即改动外部部署配置。Casdoor 身份源、既有客户端、账号归属和业务权限不变，仅在既有 MES 客户端保留 canonical 回调并追加平台域精确回调。

## 双域配置、会话与回退

实际配置顺序、普通账号验收、改域和回退步骤见[双域入口配置作业指导书](../operations/宇峰业务平台与MES双域入口配置作业指导书.md)。

服务端 Runtime 设置：

```env
APP_ORIGIN=https://mes.csyufeng.com
PLATFORM_ORIGIN=https://work.csyufeng.com
APP_AUTH_CALLBACK_ORIGINS=https://work.csyufeng.com
```

`APP_ORIGIN` 保持 MES canonical，不改打印、原业务深链或原客户端归属；`PLATFORM_ORIGIN` 仅提供公开导航地址和精确根路径 rewrite，不自动授予认证 origin。认证额外 origin 单独通过 `APP_AUTH_CALLBACK_ORIGINS` 精确配置，拒绝通配符、路径、查询、片段、账号密码及生产 HTTP；不扩大网段或请求来源权限。公开地址由服务器传给应用壳，密钥仍仅在服务端。

既有 MES Casdoor 客户端同时保留 `https://mes.csyufeng.com/api/auth/casdoor/callback`，新增 `https://work.csyufeng.com/api/auth/casdoor/callback`。不新建组织、客户端、账号、人员绑定或权限。挑战绑定发起时已允许的精确 origin，回调重查允许清单及 state/nonce/PKCE；不同 origin 的挑战不得互换，别名撤销后在途回调不能建会话。详见 [认证设计](casdoor-login.md)。

会话 Cookie 保持 HttpOnly、生产 Secure、SameSite=Lax 和 host-only，不设置跨子域 Domain。MES 与平台域分别建立浏览器会话，同一部署和身份绑定并不等于两个域共享 Cookie。仅退出当前域会话，不声称另一域、数据平台或 Casdoor 已全局退出。未登录目的域仍执行正常身份验证；现有身份中心会话能否减少再次输入须由真实验收确认。

发布须将两个 HTTPS 域绑定同一 Web 资源，保留持久卷、原 MES 地址与 canonical 登录配置。未来域名通过 Runtime 公开地址和精确回调清单改动，不把域名写死进页面。回退时恢复原入口配置、撤销平台额外回调和路由绑定，保持 MES canonical 与业务数据；不通过放宽认证或修改业务权限回退。

## 搜索、收藏与异常

平台和 MES 目录复用 `WorkspaceFunctionSearch`、`WorkspaceFunctionGroups` 和既有偏好服务；平台独立总览复用搜索与收藏能力，不复用整套 MES 快捷目录。偏好仍保存到 `/api/workspace-preferences`，稳定 functionKey、使用次数和原收藏不重置。首次偏好加载与跨页保存期间禁用偏好操作，避免完整 PUT 覆盖未读或尚未保存的状态。显示与保存历史收藏都必须先与当前可用目录交集。

小于 1024px 时，平台及目录检索在标题下方整行展示，顶栏放大镜定位同一输入框；桌面继续公共 `TopBarPortal`。关键词、高级条件和快捷搜索共用一套受控状态，手机不同时挂载两套检索控件。原 MES 首页保留既有搜索布局。

MES 统计失败显示错误与重试，不能当作全零统计；平台总览不依赖 MES 统计请求。外部应用不可用时不制造本地替代联系人或授予额外权限。冷启动登录保留原本站路径与查询，仍执行原 safeLoginReturn/OIDC/人员绑定校验。

## 侧栏避让与滚动

v0.1.492 的侧栏修复未单独发布，折入 v0.1.493：标准管理中常驻或临时呼出的侧栏可见时，正文按同一个实际宽度预留左侧空间；收起恢复全宽。普通/双列、点击/悬停展开和拖动调宽使用同一规则。展开收起保留同步过渡，拖动调宽立即同步。平台总览没有业务侧栏，不保留空白占位；画布和手机抽屉保留原槽位。

v0.1.489 的菜单分区操作继续保留：主体只展开当前组，箭头独立切换并保留其它组。桌面、手机抽屉、画布顶部及同级菜单消费同一导航模型。v0.1.491 的上下文滚动隔离继续有效：总览和已校验模块分别记录位置，新模块首次置顶，旧总览记录只兼容总览；原生业务页和物料子页策略不变。

## 验收和发布边界

本轮不合入未启用的 v0.1.484 联系人数据迁移，无 Prisma 模型、迁移、业务记录改写或生产测试造单，历史打印不受影响。

必验项：

- `work.csyufeng.com` 根入口的两个真实应用卡片与 `/workbench` 兼容跳转；`mes.csyufeng.com/`、原 dashboard 和本地功能书签保持。
- 平台无 MES 长侧栏、默认快捷目录及 MES 统计请求；MES 目录、搜索、收藏与菜单仅显示本地功能；客户应用聚合八个已授权目标，受限账号只显示其子集。
- 平台搜索“发货”完整导航到 MES 域原 `/?page=shipment`；物料子页保留 section；返回平台进入 work 域，数据平台外链保留精确 next/map 参数。
- 收藏保存后重载保持；未授权目录、搜索、旧收藏和应用卡片不出现，业务 API 仍返回原拒绝结果。
- 桌面常驻/临时展开/双列/调宽无正文遮挡；390px 一级卡片、手机检索、菜单主体/箭头和滚动位置有效；画布与原 MES 首页保持可用。
- 两域正常登录各自建立 host-only 会话；canonical/平台回调不能互换，撤销别名阻断在途登录，仅当前域退出后私有接口拒绝且不冒称全局退出。
- 真实页面读取原业务 API，原表单和权限不变；合成账号与数据库仅用于隔离验收，不能充当生产 Casdoor 证据。

精确候选 SHA 完整 CI 通过后才推进 main。生产另核对发布 SHA/版本、原持久卷、启动前一致备份、公开 ready，以及已有真实账号下的页面和只读接口。规范描述不代替已通过的验收记录，容器健康和可打开入口不能记为完整业务验收。
