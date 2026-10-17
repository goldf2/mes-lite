# MES Casdoor 统一登录与退出

## v0.1.482 退出修正（候选，真实发布结果另行记录）

v0.1.480/481 仅结束 MES 本站会话，身份中心仍可继续 SSO；用户要求真正退出。固定 Casdoor v4.2.0（cc39a939）没有实现 RP `prompt=login` / `max_age`，其 Cookie 未声明 SameSite，跨站浏览器请求也不能可靠携带默认 Lax Cookie。因此本修复使用标准首方 RP-Initiated Logout，不把添加查询参数当作重新验证保证。

正常 OIDC 回调完成原签名、issuer/audience、state、nonce、PKCE 和已有人员绑定校验后，才把该次 `id_token` 封装为 AES-256-GCM HttpOnly Cookie。密钥由现有 Runtime 客户端密钥经 HKDF 专用目的派生，AAD 绑定本站 origin、issuer、client ID、会话 token 摘要及随机认证代际。最多三片、每片最多 3000 字符，总上界 8994；ID Token 上限 6000 字符，超长拒绝建立正常会话，不写数据库、日志或 URL。Cookie 截止时间与原 MES 七天会话一致；token 仅用于退出，绝不授权业务接口。v4.2 的退出按现存 Token 行查找并撤销，允许已到 JWT exp 的原 Token 行；行已删除等提供方错误不能记为成功。

`POST /api/auth/logout` 先取得当前会话对应的有效 hint，再完成原会话及当前浏览器挑战撤销；成功响应后前端立即清可见身份。正常 Casdoor 会话获得独立加密的两分钟 handoff 和 state Cookie，只返回固定本站路径，不返回 Token。本站 handoff GET 消费浏览器 handoff Cookie，返回严格 CSP、no-store、no-referrer 的无第三方脚本隐藏表单，首方 POST 到固定 issuer `/api/logout`，字段为 `id_token_hint`、`client_id`、唯一 `post_logout_redirect_uri` 和随机 state。Token 不进入导航 URL；普通导航不使用会触发预取的 Link。

身份中心返回 `/api/auth/casdoor/logout/callback` 时必须匹配精确 state、两分钟有效期和当前代际；清除退出相关 Cookie 后只回到固定已退出页面，不自动登录。消费 Cookie 属于当前浏览器，不宣称服务端全局单次消费。专用 Casdoor 客户端需另外登记唯一退出回调 `https://mes.csyufeng.com/api/auth/casdoor/logout/callback`；本候选不执行提供方配置修改。真实发布验收仍必须验证身份中心已不再自动 SSO、MES 私有接口拒绝，不能仅凭 callback 状态认定通过。

旧版 Casdoor 会话由 `logout-protocol-v2` 指纹变化撤销，需重新正常登录以取得安全 hint；原 builtin 指纹和管理员恢复不受这一协议增量影响。缺 hint 或异常时，仅复用已有公共 `browser-logout` 前查/POST/后查作为兼容尝试；跨站 Cookie/CORS 等失败诚实显示未确认，不假报成功。管理员密码恢复会话始终仅本站退出。人员、岗位、业务资料、身份绑定和原挑战竞态保护不变，无新数据库迁移。

## v0.1.480 历史候选范围与发布状态

MES 保持独立 Web、数据库、人员、岗位权限与业务 API；企业业务平台只统一入口和身份。此候选从 API479 的 `9e9cc5cf4ab5e89c1cf83d4a2a1966305ee29d1e` 创建，不把目录 API 的机器委托当作网页登录。源码和隔离测试不是生产接入完成；未创建生产客户端、人员绑定、权限或更改运行模式。当前 Casdoor 源仍为 AL03，Con01 备用保持停止。

登录设置是运行时只读诊断，复用公共页面壳；不提供另一个配置数据库或页面密钥编辑器。账号菜单对所有已登录人员提供“登录设置”，未登录者可从登录页进入；公开状态只有模式/是否就绪，详细连接参数仅已有 ADMIN 可读。

## 公共认证复用

固定 `vendor/oaktech-web-auth-0.3.5.tgz`，来源 `goldf2/enterprise-leads-workbench` 的 `0655dd907d12446dd671fedd82bede358fa021f7`，路径 `web/packages/web-auth`。归档 SHA-256 为 `b0c7b13d1c2e75eb954c392cfbeffb2ee18df70606aa5aca60a1ec3583cce65a`，清单同目录。仅兼容声明调整为 Node >=20.19 / React >=18，26 个实现/声明/CSS 文件与原版本一致；MES 不升级 Node/React，也不复制协议工具。使用正式 `casdoor-config` / `casdoor-oidc` / `auth-frame` 子路径，openid-client 固定 6.8.8。

## Runtime 参数

所有认证参数只在服务端 Runtime 设置，不使用 NEXT_PUBLIC，不写入 Git、截图、审计正文或数据库。

| 变量 | 规则 |
| --- | --- |
| APP_LOGIN_MODE | 未设置或 builtin 保持原用户名密码/注册与微信；casdoor 明确选择统一登录；其他值拒绝 |
| APP_ORIGIN | 精确公开 HTTPS origin，无路径、查询、片段、用户名或密码；未设置时兼容 MES_PUBLIC_BASE_URL；仅开发允许 loopback HTTP |
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
| GET /api/auth/casdoor/login?next= | 原登录限流；固定回调、随机 state/nonce、S256 PKCE；只接受本站相对 next |
| GET /api/auth/casdoor/callback | 验证单次挑战、签名、issuer/aud/azp/state/nonce/PKCE 后才查精确身份绑定；正常建立原 MES 会话 |
| GET /settings/login | 公开只读页面；加载或失败不隐式更改登录方式 |
| GET /api/system/login-settings | 匿名401，非 ADMIN403；返回安全 Runtime 诊断，不返回 secret、指纹或身份列表 |
| GET /admin-login | 明确人工选择的已有管理员恢复入口，不是普通登录自动回退 |
| POST /api/auth/native-admin/login | 原账号密码校验/限流/写请求 Origin 保护；仅 ACTIVE ADMIN；不生成密码、Token 或角色 |
| POST /api/auth/logout | 本站会话与当前挑战撤销；可返回固定加密首方退出 handoff，恢复管理员仅本站 |
| GET /api/auth/casdoor/logout | 消费两分钟浏览器 handoff，固定首方表单 POST 提供方；不接受查询参数 |
| GET /api/auth/casdoor/logout/callback | 精确 state/有效期/代际；清退出 Cookie，固定返回已退出状态，不自动登录 |

OIDC 挑战只保存随机票据摘要、state、nonce、PKCE verifier、配置代际、返回路径和五分钟到期、单次claim时间和关联sessionId；票据 Cookie 为 HttpOnly/SameSite=Lax，生产 Secure。回调原子claim，失败也不能重用；建会话前事务重查挑战并回链session。退出按当前浏览器票据事务撤销挑战及关联会话，清除两Cookie；在途token交换在退出之后完成也不能建会话，不撤销其他浏览器。issuer、audience、azp、签名、nonce 或 PKCE 不符时不建立会话。回跳基于已配置 origin，不能采用请求 Host 产生外站跳转。

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
