# MES Casdoor 登录与双域入口

## v0.1.493 双域精确回调增量

原 MES canonical 继续使用 `APP_ORIGIN=https://mes.csyufeng.com`。同一 Web 部署新增平台入口 `PLATFORM_ORIGIN=https://work.csyufeng.com`，平台域根路径仅作精确 rewrite `/platform`；公开入口地址由服务器传给应用壳，不暴露认证密钥。`PLATFORM_ORIGIN` 不自动变成认证允许地址，另设 `APP_AUTH_CALLBACK_ORIGINS=https://work.csyufeng.com`，在既有 MES Casdoor 客户端保留 canonical 回调并追加 `https://work.csyufeng.com/api/auth/casdoor/callback`。不创建新组织、账号、客户端或业务权限。

回调 origin 只接受显式精确 HTTPS origin（开发仅额外允许 loopback HTTP），拒绝通配、路径、查询、片段、用户名密码、反斜线和无效代理头。HTTP 登录与回调先从可信反向代理还原请求 origin，再与配置清单精确比较；任意 Host/X-Forwarded-Host 不能变成自由回跳地址。平台挑战在数据库保存的随机 state 内绑定该 origin，回调以相同 origin 交换 token、验证 state/nonce/PKCE，并在建会话前再次检查清单。canonical 旧挑战格式继续有效；MES 与平台 origin 的挑战不能互换。

新增或移除别名本身不旋转既有身份配置代际，不使原 MES 会话或 canonical 在途挑战失效；但从清单移除别名会拒绝其在途回调，token 交换期间被撤销也不能创建会话。原身份 issuer+subject 绑定、ACTIVE 状态、细粒度岗位和数据范围检查保持。客户端/issuer/secret/登录模式等原身份参数变更仍执行既有代际失效规则。

会话和挑战 Cookie 均保持 host-only、HttpOnly、SameSite=Lax，生产 Secure，不设置 `Domain=.csyufeng.com`。两个域分别通过正常登录建立会话；退出当前域只撤销当前浏览器的本站会话与挑战，不宣称 MES 另一域、数据平台或 Casdoor 已全局退出。清除别名配置也不是注销所有已建立会话；若需撤销会话，使用原有明确的会话管理流程。

本地认证 48/48 已通过（14 项真实 loopback Next HTTP，真实 RS256 合成 IdP 传输和临时数据库），另有双 loopback host 浏览器 8 项通过，证据见 [493说明](../releases/v0.1.493.md)。未请求真实身份服务、未改生产配置或业务数据；精确候选 CI、两个正式域的代理/TLS与真实 Casdoor 登录回调仍待发布验收。

## v0.1.480 初始候选范围（历史设计基线）

以下保留 480 首次引入时的设计与候选验证基线，不用于判定当前部署状态；493 的增量和待验收范围以上文及正式版本说明为准。

MES 保持独立 Web、数据库、人员、岗位权限与业务 API；企业业务平台只统一入口和身份。此候选从 API479 的 `9e9cc5cf4ab5e89c1cf83d4a2a1966305ee29d1e` 创建，不把目录 API 的机器委托当作网页登录。源码和隔离测试不是生产接入完成；未创建生产客户端、人员绑定、权限或更改运行模式。当前 Casdoor 源仍为 AL03，Con01 备用保持停止。

登录设置是运行时只读诊断，复用公共页面壳；不提供另一个配置数据库或页面密钥编辑器。账号菜单对所有已登录人员提供“登录设置”，未登录者可从登录页进入；公开状态只有模式/是否就绪，详细连接参数仅已有 ADMIN 可读。

## 公共认证复用

固定 `vendor/oaktech-web-auth-0.3.5.tgz`，来源 `goldf2/enterprise-leads-workbench` 的 `0655dd907d12446dd671fedd82bede358fa021f7`，路径 `web/packages/web-auth`。归档 SHA-256 为 `b0c7b13d1c2e75eb954c392cfbeffb2ee18df70606aa5aca60a1ec3583cce65a`，清单同目录。仅兼容声明调整为 Node >=20.19 / React >=18，26 个实现/声明/CSS 文件与原版本一致；MES 不升级 Node/React，也不复制协议工具。使用正式 `casdoor-config` / `casdoor-oidc` / `auth-frame` 子路径，openid-client 固定 6.8.8。

## Runtime 参数

所有认证配置在服务端 Runtime 读取，不以 NEXT_PUBLIC 暴露；认证密钥、Token 和 Cookie 不写入 Git、截图、审计正文或数据库。APP_ORIGIN/PLATFORM_ORIGIN 是公开导航地址，可由服务器传给页面，不属于密钥。

| 变量 | 规则 |
| --- | --- |
| APP_LOGIN_MODE | 未设置或 builtin 保持原用户名密码/注册与微信；casdoor 明确选择统一登录；其他值拒绝 |
| APP_ORIGIN | 原 MES canonical 精确公开 HTTPS origin，无路径、查询、片段、用户名或密码；未设置时兼容 MES_PUBLIC_BASE_URL；仅开发允许 loopback HTTP。正式值继续为 https://mes.csyufeng.com |
| PLATFORM_ORIGIN | 公开平台入口，正式值 https://work.csyufeng.com；仅决定公开导航和平台根 rewrite，不授予认证资格，不改变 canonical |
| APP_AUTH_CALLBACK_ORIGINS | 额外精确认证 origin，以英文逗号分隔，正式仅加 https://work.csyufeng.com；空值仅保留 canonical；格式无效时 Casdoor readiness 失败，不接受通配或生产 HTTP |
| CASDOOR_ISSUER | 精确 HTTPS issuer，后续声明和绑定都使用同一个值 |
| CASDOOR_CLIENT_ID / CASDOOR_CLIENT_SECRET | 本 MES 专用客户端；密钥仅 Runtime，诊断仅返回配置与否 |
| CASDOOR_APPLICATION / CASDOOR_ORGANIZATION | 可选客户端元数据；不据此自动建立 MES 人员或权限 |
| CASDOOR_DISCOVERY_URL | 可选，与 issuer 同 origin 的 HTTPS discovery 地址 |
| CASDOOR_SCOPES | 默认 openid profile email，必须含 openid |
| APP_AUTH_ALLOWED_TARGETS | 仅确需访问非公网身份端点时使用公共认证库的精确网络白名单；不得为了测试放宽生产网络访问 |

`APP_LOGIN_MODE=casdoor` 缺少/无效配置时，`/api/auth/method` 、`/api/health` 与实际Docker健康检查 `/api/health/ready` 返回 503，不自动显示原密码、微信或注册。只读状态表示配置语法就绪，不证明身份端点在线、业务绑定存在或真实登录已验收。健康读取同时观察运行代际。切换和回退必须在服务启动/健康检查完成后核对代际，不能把“只改变量但尚未被进程观察”的状态称为生效。

## 精确流程与接口

| 入口 | 行为与权限 |
| --- | --- |
| GET /api/auth/method | 公开安全状态 `{data:{mode,ready,settingsHref,recoveryHref}}`；不可用仍保留模式，503 |
| GET /api/auth/casdoor/login?next= | 原登录限流；仅允许清单内发起 origin 的固定回调路径，随机且绑定 origin 的 state/nonce、S256 PKCE；只接受本站相对 next |
| GET /api/auth/casdoor/callback | 验证单次挑战、签名、issuer/aud/azp/state/nonce/PKCE 后才查精确身份绑定；正常建立原 MES 会话 |
| GET /settings/login | 公开只读页面；加载或失败不隐式更改登录方式 |
| GET /api/system/login-settings | 匿名401，非 ADMIN403；返回安全 Runtime 诊断，不返回 secret、指纹或身份列表 |
| GET /admin-login | 明确人工选择的已有管理员恢复入口，不是普通登录自动回退 |
| POST /api/auth/native-admin/login | 原账号密码校验/限流/写请求 Origin 保护；仅 ACTIVE ADMIN；不生成密码、Token 或角色 |
| POST /api/auth/logout | 原本站会话删除与 Cookie 清除；退出后私有接口401。仅退出本站，不冒称身份中心退出 |

OIDC 挑战只保存随机票据摘要、state、nonce、PKCE verifier、配置代际、返回路径和五分钟到期、单次claim时间和关联sessionId；票据 Cookie 为 HttpOnly/SameSite=Lax，生产 Secure。回调原子claim，失败也不能重用；建会话前事务重查挑战并回链session。退出按当前浏览器票据事务撤销挑战及关联会话，清除两Cookie；在途token交换在退出之后完成也不能建会话，不撤销其他浏览器。issuer、audience、azp、签名、nonce 或 PKCE 不符时不建立会话。回跳基于发起时绑定且回调/建会话时仍被配置清单允许的精确 origin，不能采用未经验证的请求 Host 产生外站跳转。

## 身份与业务授权

沿用 `OperatorAuthAccount`，provider 为 `oidc:` 加完整 issuer，providerUserId 为完整 subject；唯一对映既有 Operator。登录前由有权管理员审核确切 `(issuer, subject, operatorId)`，不按姓名/邮箱/门户同名自动合并，不调用微信自动建人。未绑定只显示等待业务账号关联；不新建人、会话或权限。需要生产新客户端或绑定时须先集中确认客户端/回调、精确身份、既有人员及业务范围和回退，再执行。

正常会话由原 `startOperatorSession` / `createOperatorSession` 建立，原七天 Cookie 和实时岗位/细粒度权限/dataScope 不变。每个受保护请求重查人员 ACTIVE、绑定仍存在且所有者/issuer/subject 一致、当前模式和配置代际；撤销绑定、改绑或停用后拒绝并删除旧会话。身份登录成功不赋予业务管理员或目录 API 的机器委托权限。

## 代际、恢复与回退

`SystemSetting` 保留键 `authentication.runtime.v1` 只保存模式、配置 SHA-256 指纹、随机 generation 和首次 native 旧会话兼容标志，不保存明文密钥或令牌。事务和比较更新使并发请求共享同一代际；变化时随机旋转，不用可重复的指纹代替代际。模式变化撤销所有普通会话；同模式 Casdoor 参数变化撤销 Casdoor 会话/挑战；A→B→A 不能复活旧 Cookie。

首次未配置安装仍接受原 native 会话；一旦观察过模式转换，旧无代际会话不能重新进入。显式 Casdoor 模式拒绝以前普通 native/微信会话（包括旧 ADMIN 会话）；原人员、密码、权限和历史保留。

人工管理员恢复仅使用原有有效 ADMIN 密码，创建明确 `native-admin-recovery` 来源。每次仍重查 ACTIVE 与 ADMIN；角色撤销或停用后旧 Cookie 被删除，恢复角色不能令旧 Cookie 复活。恢复不授新权，也不关闭原限流/Origin/CSRF边界。可以用它诊断坏配置；更改 Runtime 后重新正常登录。回退 builtin 会旋转代际并要求普通人员重新登录，不删除身份绑定或业务数据。

## 持久化变更与所有权

新增迁移 `20261017070000_add_casdoor_operator_sessions`：OperatorSession 加 authSource、authAccountId、authSubject、authGeneration；新增 OperatorLoginChallenge 及到期索引。迁移为追加，不改人员/岗位或业务资料。回退旧代码前先做一致备份并确认旧登录模式；不删除新列/挑战表或擅自还原生产数据库。

运行规则、服务、HTTP、client 和内容 UI 都属于 identity-access。`app/settings/login` 薄页组合既有 SystemSettingsPageShell，保持模块依赖 49 条及深层导入0；不是新业务一级菜单。普通登录和恢复复用提取后的 NativeLoginForm；Casdoor 使用公共 AuthFrame，未准备好明确阻断。API479 目录读取凭据、Operator 委托与这里的浏览器身份不互相替代。

## 验证与发布门禁

- 真实 Node20.19.4、独立临时 SQLite 全99迁移、真实 RSA 签名和公共 SDK/openid-client：37 项协议/会话/代际/恢复检查，其中12项实际本机 Next HTTP，包括原权限读取200、设置403、跨源拒绝、退出后401。IdP 传输是合成fixture，不宣称真实 Casdoor 验收。
- UI/client14组真实组件SSR及接口验证；实际1440/390px隔离浏览器也已验收公开入口、配置缺失阻断、原ADMIN恢复、只读诊断、账号菜单及退出，无溢出/控制台错误。原身份服务回归保留。
- GitHub候选分支 ci/0.1.480 执行本次依赖层真实 Docker 构建、原完整 Next 构建/恢复演练/领域与治理回归；必须核对精确 SHA 的 CI。不能用本机源码测试或依赖层通过替代整镜像及真实业务登录验收。
- 本机 Docker CLI存在但 daemon未运行；不启动桌面，不作本机完整生产构建。候选 main 推进、Con01 镜像及普通真实账号验收均未执行，需根任务按已授权范围继续。
