# MES 与数据平台共享客户资料

状态：v0.1.484 候选实现；未启用生产接入。范围限于正式客户、联系人、地点的读取、明确关联与销售单据快照。两个代码库、数据库和发布流程保持独立。

## 数据归属

- 数据平台拥有可修改的正式客户、联系人和地点。企业 `business_use=approved`、子记录 `use_status=active` 才进入共享 API。默认待确认，不把地产获客线索自动转为正式客户。
- MES `Customer` 原 ID、业务外键和旧联系方式保留。启用共享模式后不再通过 MES 新建、修改、归档客户主档；由“使用数据平台客户”明确创建兼容引用，或将原客户明确关联到一个源客户。供应商不受影响。
- `CustomerMasterLink` 保存 customerId、instanceId、enterpriseId、boundRevision；同一来源企业只关联一个 MES 客户。不按名称、邮箱、电话自动合并；同名提示人工明确关联。关联不可通过普通接口替换。
- 查询实时走数据平台 API，不复制联系人表、不建立双向同步。MES 只保留兼容名称和业务主键，源服务不可用时标记不可用，不用旧本地联系人冒充当前资料。
- 新销售订单、发货单保存客户/联系人/地点的源 ID、修订、抓取时间和名称/电话/地址快照。联系人和地点显式选择；不选择表示本单留空，不回退到企业文本“主要联系人”。
- 保存前核对客户/联系人/地点版本及同一企业归属，版本变化返回 409，不静默使用已变更地址。停用或未获准记录返回 404，单据不创建。事务内再核对关联未变。
- 旧单据不批量重写；原存储文件不覆盖。已有快照的打印不读取实时联系人，空快照值也不回退旧字段。后续价格、装箱、状态和冲销操作不改联系人快照。旧无快照单据沿用原历史兼容读取，因此保留原 Customer 字段。

## API 契约

| 接口 | 责任与权限 |
| --- | --- |
| 数据平台 `GET /api/integrations/customer-master/v1/{enterprises,contacts,locations}` | 真实委托用户在数据平台当前账号及工作台权限；分页、q搜索、enterpriseId筛选 |
| 数据平台同路径 `/{id}` | 精确来源、企业关系、正式/有效状态；不存在或不可用 404 |
| MES `GET /api/customer-master/{resource}[/{id}]` | 当前有效 Casdoor 会话与 MES customers.read；代理读，不接受浏览器提供的身份 |
| MES `POST /api/customers/master-link` | customers.read + 创建引用时 customers.create / 关联原客户时 customers.update；显式 enterpriseId + expectedRevision；审计 |
| MES `GET /api/customers` | 保留现有业务引用的名称/编号读取；共享联系人仅 customers.read 可发起；返回 enabled 与配置的管理地址 |
| MES 销售订单/发货创建 | 原业务创建权限 + 读取共享资料所需当前身份权限；即使省略联系人 ID 也检查，不以默认值绕过 |

响应 `customer-master.v1`：source 固定 appId=equipment-maintenance、配置的 instanceId、local/default；record 包含 id、revision、updatedAt、sourceRef、readOnly=true、projection=false。企业不返回重复联系人文本；联系人/地点返回其归属、active 状态及类型字段。分页 limit 1..100、offset 0..100000；界面按 20 条分页和搜索，可查到第 100 条以后的记录。

客户端严格验证来源、资源、记录 ID、企业关系和响应大小。5 秒总超时，最多 1 MiB，禁止重定向，no-store。401/403 不降级为本地数据，503 显示共享资料暂不可用。联系方式不写入日志。

## 身份与权限

MES 使用已有会话验证（ACTIVE 人员、有效期、Casdoor 来源、当前运行代际、当前精确人员绑定）。原生或管理员恢复登录不会借用另一个账号的 Casdoor 绑定。当前用户还必须有 customers.read；MES 管理员不能绕过数据平台权限。

后端用专用 `CUSTOMER_MASTER_DELEGATION_SECRET` 签发最长 60 秒的请求绑定声明。HS256，header `{alg:HS256,typ:MES-Contact-Delegation}`；claims 包含 iss=mes-lite、aud=equipment-maintenance:customer-master:v1、actorIssuer、sub、iat/exp、GET、精确路径与查询、instanceId/local/default。仅服务端持有密钥，浏览器不配置 Token。

数据平台校验签名、期限、用途、目标请求和来源实例，再查询现有 Casdoor 账号及工作台权限。不同组织仅支持部署配置里的精确 issuer+subject 映射，必须事先获授权；不按邮箱/显示名推断，不自动建人或赋权。数据平台仍使用现有工作台权限粒度，本切片不声称新增逐联系人行级权限。凭据只证明调用来自 MES，不能替代当前用户业务授权。

## 配置与可回退性

MES 服务端变量：

- `CUSTOMER_MASTER_ENABLED=true`：启用共享模式；默认关闭，便于原独立应用继续运行。
- `CUSTOMER_MASTER_BASE_URL`：源服务 origin，生产必须 HTTPS，无用户信息、路径、查询或片段；开发只允许回环 HTTP。
- `CUSTOMER_MASTER_MANAGEMENT_URL`：维护入口 origin，可与服务地址不同，默认采用 BASE_URL；未硬编码正式域名。
- `CUSTOMER_MASTER_INSTANCE_ID`：经核对的稳定实例 ID。
- `CUSTOMER_MASTER_DELEGATION_SECRET`：双方一致的专用服务凭据，由部署后台保存；不复用登录管理密钥，不使用 NEXT_PUBLIC。

数据平台另配启用开关、实例 ID、凭据截止时间和必要的精确主体映射，见其独立开发规范。单独具备 MES 权限并不自动取得源数据访问权。

迁移只追加表/可空字段，不删除旧客户和单据。上线前分别备份数据库与附件；先部署关闭的 provider，再验证明确的现有账号和样本关联，最后启用 MES。回退保留新列、链接和快照，不能回到会忽略快照的旧打印代码或恢复编辑已关联旧联系方式；可停用新建并继续历史查询/打印，不做破坏性逆迁移。未完成关联的旧客户在共享模式下不能创建新的依赖共享联系资料的单据，历史查询仍可用。

## 分阶段与验收

1. 本切片：API、实际用户委托、正式数据门槛、MES 关联/查询/选择、单据快照；隔离测试、类型/模块/CI。
2. 生产接入：备份、精确账号/权限核验、业务人员确认正式客户及原客户映射；真实账号查询/选择/新测试单据验收须使用获准测试数据。完成前不能把代码完成记为线上已打通。
3. 后续独立需求：MES 订单统计只读 API、按客户/地点 SourceRef 聚合上图；另定金额/数量口径、数据范围、更新时间和无坐标处理。本次不实现。
4. 统一工作台后续使用 mes.csyufeng.com，可配置未来域名；参考用友工作台的信息层级，不使用 SaaS 应用目录充当独立应用首页。本次不修改首页或 DNS。

必需门禁：真实服务读取与 HTTP 身份拒绝；伪造/过期/撤权委托拒绝；同名不自动合并；跨企业/停用/修订冲突无单据写入；100条以上可发现；超时不回填本地；客户CRUD受控而供应商兼容；新快照及已归档PDF不受源更新影响；空字段不回退；原ID/FK与旧单据保留。MES完整生产构建由精确候选SHA的GitHub Actions执行。
