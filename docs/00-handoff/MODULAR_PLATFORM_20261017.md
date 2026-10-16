# MES 统一企业业务平台接续

## 2026-10-17 企业业务平台只读目录 v0.1.479（本地通过，候选待CI）

- 用户确认 MES Lite、数据平台、客户/联系人进入统一企业业务平台，模块独立通过 API 互通，地图是显示视图，企业地图保留独立发布。此切片只处理 MES 只读目录和管理员接入诊断，不合并数据库，不改变本地登录，也不宣称 Casdoor 统一登录已完成。
- 独立干净 Worktree `Worktrees/mes-business-platform-20261017` / `ci/0.1.479`，精确基于远端 main `6a771405d7b4f21f664c9933cb4d18e3a1f30df5` / v0.1.478。原主目录及 customer-continuous-paper 的所有既有未提交内容保持。
- 三个 GET `/api/integrations/business-directory/v1/{enterprises,contacts,locations}` 使用 business-directory.v1、严格白名单、固定 sourceRef、稳定派生联系人/地址 ID 和分页；联系人/地点含所属企业名称，没有源修订/修改时间/坐标时如实返回 null。所有 MES 数据均为只读投影，不自动匹配或同步写入。
- 服务默认关闭，仅接受 SHA-256 摘要凭据并要求明确有效期；每请求检查已有显式人员 ACTIVE 与精确 customers.read，原本地 Cookie 不能替代凭据、不创建会话或权限。仅增加向后兼容的 initializeDefaults:false 读取路径，原权限调用默认行为保持。
- API 接入页复用现有设置页壳；导航与真实 HTTP 接口都仅 ADMIN 可见/可读，不返回摘要或密钥。无 Prisma 模型/迁移/生产业务更改。
- 本地通过：隔离98迁移SQLite目录回归（完整逻辑数据库读取前后摘要一致）、实际Next临时库正常账号登录后的诊断200/普通人员403/委托撤权403、旧权限/身份服务、TypeScript、定向Lint、页面/设置/模块/文档/SOP/发布与Docker依赖门禁。架构必要公开依赖仅增加两条，根任务批准预算47→49，其余阈值不变。
- 当前正式MES地址为 https://mes.csyufeng.com（根任务Con01控制台只读核对）。此工作未访问AL02、未改变生产、未推main或部署；原自动部署源main保持。
- 详见 [目录契约与接入说明](../architecture/business-directory-api.md)、[v0.1.479](../releases/v0.1.479.md)。唯一下一步：推送候选并核对精确SHA的MES-lite CI；身份统一另从已推SHA的独立后续Worktree处理，禁止制造临时Operator会话冒充OIDC。

## 下一切片边界

统一 Casdoor 必须以验证后的 issuer+subject 显式绑定已有 Operator，保留原业务权限；不得按同邮箱或用户名自动合并、提权或创建假会话。本479候选不触碰该认证功能，后续480应从精确已推候选另建Worktree，避免干扰冻结目录接口。
