# 企业业务目录 API（business-directory.v1）

实现版本：v0.1.479 候选。此文记录 MES 独立模块的只读接入，不表示生产已启用或 Casdoor 已统一。

## 归属与只读边界

MES-lite 的生产、库存、订单和原客户管理仍由独立仓库、服务、SQLite 和本地人员权限管理。企业业务平台通过明确 API 读取客户目录，不共享数据库、Cookie 或管理员身份。地图是目录/业务数据的一种显示视图；独立企业地图的发布和运行能力不受影响。

MES 当前没有企业/空间隔离实体。`BUSINESS_DIRECTORY_INSTANCE_ID/TENANT_ID/WORKSPACE_ID` 是部署方明确指定的**来源标签**，不是数据库内新增的租户范围，也不把消费者的空间冒充来源租户。每个源应有独立实例标识；消费者须把来源与本地空间显式绑定。不能凭相同名称、邮箱、电话、同一登录或标签自动合并身份/业务数据。

## 配置与委托

默认 `BUSINESS_DIRECTORY_ENABLED=false`，原本地登录和 CRUD 不变。启用需同时配置：

| 变量 | 规则 |
| --- | --- |
| BUSINESS_DIRECTORY_ENABLED | 仅字面 `true` 启用 |
| BUSINESS_DIRECTORY_API_KEY_SHA256 | 入站凭据的 SHA-256 摘要，恰为 64 位十六进制；不保存或返回原密钥 |
| BUSINESS_DIRECTORY_OPERATOR_ID | 已存在 MES 人员的精确 ID，不能由请求传入 |
| BUSINESS_DIRECTORY_INSTANCE_ID | 唯一来源实例标签 |
| BUSINESS_DIRECTORY_TENANT_ID | 明确声明的来源企业标签 |
| BUSINESS_DIRECTORY_WORKSPACE_ID | 明确声明的来源空间标签 |
| BUSINESS_DIRECTORY_EXPIRES_AT | 必需的有效 ISO 日期时间，明确带时区；过期立即拒绝 |

标签和人员 ID 为 1–200 字符、首位字母或数字，后续允许字母、数字、点、下划线、冒号和连字符。Bearer 原密钥必须为 32–4096 个非空白字符，仅在消费者 Runtime 中保存。每次对请求密钥计算 SHA-256，与配置摘要使用 `timingSafeEqual` 校验，再检查委托有效期、人员当前 `ACTIVE` 状态和原生**精确 `customers.read`**；不兼容旧明文变量。既有 ADMIN 角色读取语义保留；销售/物料等下拉的参考读取权限不能替代客户资料读取权限。现有组/个人授权、限时授权及撤权每请求重新解析，摘要轮换后旧密钥即时失效；目录路径不初始化默认权限、不创建会话、不授予权限。

这是显式只读服务委托，不是最终用户模拟登录。浏览器已有 Cookie、请求提供的账号或 `actor/tenant/workspace` 参数都不能代替凭据或改变委托。密钥持有者只能读取该实例中委托人员本来有权读取的客户目录；写操作始终拒绝。需要新的账号或扩大权限时另行精确确认。本切片不创建 Casdoor 用户，也不按邮箱把 Casdoor 身份绑定到 Operator。

## HTTP 契约

三个端点均只允许 `GET`：

```text
/api/integrations/business-directory/v1/enterprises
/api/integrations/business-directory/v1/contacts
/api/integrations/business-directory/v1/locations
```

仅接受以下四个查询参数；未知或重复参数返回 400：

| 参数 | 规则 |
| --- | --- |
| q | 最长 200 字符；复用原客户查询的分词 AND/字段 OR 语义，搜索客户名称、编号、联系人、电话、地址 |
| enterpriseId | 现有客户 ID 精确过滤，最长 200 字符、不含空白；不接受空字符串 |
| limit | 整数 1–100，默认 50 |
| offset | 整数 0–100000，默认 0 |

只读取 `deletedAt=null` 客户，按 `sortOrder/name/id` 稳定排序。空白联系人/地址不产生记录；过滤、总数和分页均针对该资源实际投影。读取不返回任何库存、价格、销售明细、人员、凭据、附件或内部归档字段。

成功响应：

```json
{
  "schemaVersion": "business-directory.v1",
  "source": { "appId": "mes-lite", "instanceId": "<部署实例标签>", "tenantId": "<来源企业标签>", "workspaceId": "<来源空间标签>" },
  "resource": "enterprises",
  "records": [],
  "page": { "limit": 50, "offset": 0, "total": 0, "hasMore": false }
}
```

每条记录都有 `sourceRef={appId,instanceId,tenantId,workspaceId,resource,recordId}`，recordId 必须为字符串；`projection:true/readOnly:true`。不产生 `globalId`，不声明主数据已迁移或同步。MES 当前没有源修订号或修改时间，`revision/updatedAt` 固定为 `null`，不能拿 `createdAt` 冒充修改时间。

| 资源 | 严格白名单字段（另含 sourceRef/projection/readOnly/revision/updatedAt） |
| --- | --- |
| enterprises | id（原 Customer.id）、code、name、primaryContactName、phone、email:null、address |
| contacts | id=`customer-contact:<Customer.id>`、enterpriseId（原 Customer.id）、enterpriseName（客户名）、name（contact 字段）、phone、email:null、role:null |
| locations | id=`customer-address:<Customer.id>`、enterpriseId、enterpriseName（客户名）、name（客户名）、address、province:null、city:null、coordinate:null |

联系人是旧客户单个联系字段的投影，不按电话猜测拆分，也不宣称已有独立联系人档案。地点是地址投影，没有原坐标时始终 `coordinate:null`，不自动地理编码。消费者以后取得真实坐标时须按契约记录 WGS84、来源和置信度，不能由此 API 猜测地点。

错误体仅 `{error:"<机器码>"}`，不回显请求凭据、Operator ID 或内部异常：

| 状态 | error |
| --- | --- |
| 400 | INVALID_QUERY |
| 401 | INVALID_API_KEY |
| 403 | DELEGATE_FORBIDDEN（委托人员/权限不满足）、DELEGATE_EXPIRED（委托过期） |
| 405 | METHOD_NOT_ALLOWED |
| 503 | DIRECTORY_UNAVAILABLE（禁用、配置不全或依赖读取失败） |

所有目录结果禁止缓存（`Cache-Control:no-store`、`Vary:Authorization`）。机器路由不放开 CORS。原业务接口仍使用原 Cookie/权限与写入来源保护。

## 管理诊断与验证

原系统设置框架新增管理员专用“API 接入”（`/?page=apiSettings`），复用 `SystemSettingsPageShell/ResourcePageShell/AppButton`。`GET /api/system/business-directory` 另查当前真实本地会话和 ADMIN 角色，仅返回配置是否存在、明确到期时间、来源标签、委托是否有效、客户读取是否允许和三个接口目录；不返回摘要或原密钥，也不提供连接任意 URL 的探测功能。普通人员即使被授予企业设置读取权限，也不显示该入口，直接请求仍拒绝。

`npm run verify:business-directory` 使用全新临时 SQLite 和既有迁移，检查白名单、固定来源、稳定 ID、空字段/归档排除、分页、错误查询、密钥轮换/有效期、Cookie 不代替密钥、精确客户权限、即时撤权/停用、默认关闭，以及所有读取前后完整逻辑数据库摘要一致。另以临时 Next 服务正常登录本地测试账号，验证管理员诊断200、普通人员即有businessSettings.read也403、Cookie不能替代目录凭据、真实HTTP委托撤权即时拒绝。所有样本均为隔离测试数据，没有调用生产接口或更改生产配置。

生产当前仍为 Con01 的 `https://mes.csyufeng.com`，本候选不得越过 `ci/<版本>` 精确 CI 门禁推进 main。本轮不部署、不配置实际委托账号或密钥；真正启用前须确认实例/来源空间对应、委托权限、回退方式，并完成真实调用与边界验收。消费者返回原客户模块时使用可信配置的 MES Origin 加 `/?page=customers`；不得执行 API 响应中的任意链接。
