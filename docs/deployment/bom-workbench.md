# BOM 独立域名部署

部署状态：准备中，域名 bom.csyufeng.com 已确认；CON01 网站与在线工具 / production 下新建独立资源。不得把此文件视为上线证明。

采用现有 Dockerfile，单实例，内部端口 3000，健康检查 /api/health/ready。单独创建 bom-workbench 应用，从 BOM 候选分支部署；不绑定现有 MES 资源，也不合并 main。

运行变量：BOM_WORKBENCH_ENABLED=1，APP_LOGIN_MODE=builtin，MES_PUBLIC_REGISTRATION_ENABLED=false；APP_ORIGIN、MES_PUBLIC_BASE_URL、MES_TRUSTED_ORIGINS 均使用确认的新 HTTPS Origin。不设置 MES 的 PLATFORM_ORIGIN。

独立持久卷分别挂载 /app/data、/app/public/uploads、/app/backups。DATABASE_URL=file:/app/data/mes_lite.db。卷名/宿主目录须属于 bom-workbench，禁止挂载生产 MES 的数据。保留原启动迁移和备份逻辑。

根路径默认 BOM 工作台；/?page=materials 保留共享物料资料入口。所有 API 继续服务端鉴权。BOM_WORKBENCH_ENABLED 未启用时原 MES 根路径行为不变。

不运行 bom:init、seed-bom-workbench 或 ensure-dev-admin 作为生产初始化；本地默认密码和示例配方不进入公网环境。使用现有受令牌保护的首次管理员安装 API，安装令牌/随机密码仅通过秘密配置与私密交付保存。

推送前递增版本并通过 release-notes 检查。精确候选 CI 通过后部署该候选分支，核对提交、三项独立挂载、DNS/TLS、健康、登录、BOM 创建/发布和匿名拒绝。不把这次独立试运行视为合并主线。
