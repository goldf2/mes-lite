# OSS SaaS 附件存储接入计划

状态：待实施  
日期：2026-08-08  
上位架构：[MES-lite 商业化 SaaS 数据与存储架构](../architecture/saas-data-and-storage-architecture.md)

## 1. 目标与范围

把当前本地附件目录迁移到阿里云 OSS，并覆盖完整附件链路：

- 原始凭据和产品文档上传。
- 物料图片原图、缩略图和展示图。
- PDF 第一页缩略图。
- Word、Excel、PowerPoint 和 OpenDocument 转换预览。
- 业务单据生成和归档 PDF。
- 附件归档、恢复和永久删除。
- 商业 SaaS 的租户隔离、配额、计量和数据迁出。

OSS 只保存对象，不判断业务权限、不承担附件元数据主表，也不向浏览器暴露永久公开 URL。

## 2. 当前耦合点

当前代码不仅上传时使用本地磁盘：

- 上传接口直接写入附件根目录。
- `DocumentAttachment.storagePath` 保存本地绝对路径。
- 缩略图、WebP 展示图和 Office 预览以本地派生文件存在。
- 下载和预览接口读取完整本地文件。
- 业务单据 PDF 直接写入本地附件目录。
- 永久删除通过扫描同目录删除原件及派生资源。

因此必须先抽出统一存储服务，再切换 OSS；只修改上传接口会导致预览、打印和删除继续依赖本地卷。

## 3. Bucket 与租户策略

### 3.1 Bucket 划分

| 环境/套餐 | 推荐方式 |
| --- | --- |
| 开发 | 独立开发 Bucket 或本地适配器 |
| 测试/预生产 | 独立测试 Bucket，禁止使用生产数据 |
| 普通生产租户 | 每个 DataCell 一个生产 Bucket |
| 企业专属租户 | 可选独立 Bucket、RAM Role 和 KMS 密钥 |
| 日志/清单 | 独立日志或运维 Bucket，避免访问日志递归写入业务 Bucket |

不为每个普通租户建立 Bucket。普通租户通过对象前缀、数据库归属、应用鉴权和维护工具隔离；企业专属才使用物理资源隔离。

### 3.2 对象键

```text
{environment}/tenants/{tenantId}/attachments/{attachmentId}/original-v1.{ext}
{environment}/tenants/{tenantId}/attachments/{attachmentId}/variants/thumbnail-r{rotation}-v{profile}.png
{environment}/tenants/{tenantId}/attachments/{attachmentId}/variants/display-r{rotation}-v{profile}.webp
{environment}/tenants/{tenantId}/attachments/{attachmentId}/variants/preview-r{rotation}-v{profile}.pdf
```

规则：

- 不使用客户名、物料名、手机号或用户原始文件名作为对象键。
- 原件默认不可变；重新上传或重新生成打印 PDF 创建新的附件记录。
- 派生对象键包含规则版本和方向，规则变化不覆盖旧缓存。
- 原始文件名只作为数据库元数据和下载响应名称。

## 4. 数据模型

`DocumentAttachment` 过渡字段：

```text
tenantId         String
storageBackend   String   // local-default / oss-primary / enterprise-xxx
objectKey        String?
checksumSha256   String?
storageStatus    String   // PENDING / READY / FAILED / DELETING
storagePath      String?  // 迁移兼容，完成后删除
```

新增 `AttachmentVariant`：

```text
id
tenantId
attachmentId
kind             // THUMBNAIL / DISPLAY / PREVIEW_PDF
profileVersion
rotation
objectKey
mimeType
size
checksumSha256
status
createdAt
```

唯一约束至少覆盖：

```text
tenantId + attachmentId + kind + profileVersion + rotation
```

Bucket、Region 和 Endpoint 属于部署后端配置，不写入每条附件记录。`storageBackend` 映射到具体配置，便于环境切换和企业专属存储。

## 5. 存储接口

存储规则归 `modules/attachments` 所有，通用文件底座可以下沉 `lib/files`：

```ts
interface AttachmentStorage {
  put(key: string, body: Buffer | Readable, options: PutOptions): Promise<ObjectMeta>
  getStream(key: string): Promise<Readable>
  head(key: string): Promise<ObjectMeta | null>
  copy(sourceKey: string, targetKey: string): Promise<ObjectMeta>
  delete(key: string): Promise<void>
  createSignedGetUrl?(key: string, expiresInSeconds: number): Promise<string>
  materializeTempFile<T>(key: string, run: (path: string) => Promise<T>): Promise<T>
}
```

实现：

- `LocalAttachmentStorage`：迁移、测试和回滚使用。
- `AliyunOssAttachmentStorage`：生产 OSS。
- `materializeTempFile`：为 LibreOffice、PDF 渲染和图片处理提供临时本地路径，用后清理。

API 路由只负责鉴权、校验和响应，不再直接调用 `fs` 或拼接对象键。

## 6. 上传流程

当前单文件上限 50 MB，第一阶段继续由 MES 服务端接收并上传 OSS，不引入浏览器永久凭证或分片直传：

1. 验证会话、租户、资源权限、业务主体归属。
2. 校验文件大小、扩展名、MIME 和预览类型。
3. 应用生成附件 ID 和不可预测对象键。
4. 创建 `PENDING` 附件记录。
5. 上传 OSS，禁止意外覆盖同名对象。
6. `HEAD` 校验大小，记录 SHA-256、ETag 或版本 ID。
7. 更新为 `READY`。
8. 图片生成必要派生图；Office 预览继续按需生成。
9. 记录附件审计和用量事件。

如果上传成功但状态更新失败，维护任务根据 `PENDING` 记录和对象元数据恢复；如果上传失败，记录 `FAILED` 并可重试。读接口只返回 `READY` 对象。

未来单文件开放到 100 MB 以上时，再引入 STS/预签名 URL 和分片上传。浏览器只能获得限制对象键、方法、大小和有效期的临时权限，上传完成必须回到 MES API 确认。

## 7. 下载与预览

第一阶段所有访问继续使用当前 MES API：

```text
浏览器 -> MES 权限与租户校验 -> OSS 内网读取 -> 流式响应
```

这样可以继续复用权限、审计、中文文件名、内联预览和安全响应头，不需要公开 Bucket。

当大文件下载明显占用应用带宽后，可以在权限校验后返回 60 至 300 秒有效的签名 GET URL。服务器读写使用 OSS 内网 Endpoint；发给互联网浏览器的签名地址必须使用可访问的公网 Endpoint 或受控自定义域名。

禁止：

- 在数据库保存预签名 URL。
- 返回没有租户和资源权限校验的 OSS 地址。
- 使用永久公共读 Bucket 解决预览问题。
- 把企业内部 Office 文件发送给公网第三方预览服务。

## 8. 派生资源

| 类型 | 生成时机 | 处理方式 |
| --- | --- | --- |
| 物料缩略图 | 上传后 | 临时读取原图，生成 320px WebP，写回 OSS |
| 物料展示图 | 上传后 | 生成 1600px WebP，写回 OSS |
| 通用图片缩略图 | 上传后或首次访问 | 生成版本化缩略图 |
| PDF 缩略图 | 首次访问或后台任务 | 临时下载 PDF，生成第一页缩略图 |
| Office 预览 | 首次访问或后台任务 | 临时下载，LibreOffice 转 PDF，写回 OSS |
| 打印归档 PDF | 单据保存后 | PDF 作为独立 `SYSTEM_GENERATED_PDF` 附件写 OSS |

多实例环境中不能只用进程内 `Map` 防止重复生成。派生资源使用确定性对象键和幂等状态；后续迁入 Worker 时使用任务 ID、唯一约束和重试控制。

## 9. 安全配置

生产 Bucket 最低要求：

- ACL 为 `private`。
- 开启“阻止公共访问”。
- 强制 HTTPS。
- 服务端默认使用 SSE-OSS；有明确密钥隔离或合规要求时使用 SSE-KMS。
- 应用 RAM 权限只覆盖指定 Bucket/前缀和必要动作。
- Coolify 位于阿里云 ECS 时优先绑定 ECS RAM Role，自动获取临时凭证。
- 无法使用实例角色时，使用专用 RAM 用户 AccessKey，并只保存在 Coolify Secret。
- 禁止使用阿里云主账号 AccessKey。
- 日志不得输出 AccessKey、STS Token、完整签名 URL 或附件内容。

应用层仍必须验证 `tenantId + attachmentId + ownerType + ownerId`，对象键包含租户前缀不等于完成权限控制。

## 10. 生命周期与删除

初始生命周期：

| 对象 | 策略 |
| --- | --- |
| 原件和打印归档 PDF | 不自动删除 |
| `tmp/` | 1 天后删除 |
| 未完成分片 | 3 天后清理 |
| 非当前历史版本 | 90 天后永久删除，生产启用前确认合规要求 |
| 派生资源 | 初期不自动删除，维护工具可重建 |

附件归档只更新数据库状态，不立即删除 OSS 对象。租户注销时：

1. 冻结写入。
2. 生成数据与附件导出清单。
3. 进入合同约定保留期。
4. 双重确认后删除数据库记录与 OSS 全部版本。
5. 保存不可包含业务正文的删除审计证明。

## 11. 历史迁移

### 阶段 A：统一存储服务

- 所有上传、读取、预览、打印和删除改用 `AttachmentStorage`。
- 先保留本地适配器，部署行为不变。
- 增加本地存储回归测试。

### 阶段 B：新写入 OSS

- 配置测试和生产 Bucket。
- 新附件写 `oss-primary`，旧附件仍读取 `storagePath`。
- 禁止长期双写；每条附件只有一个权威后端。

### 阶段 C：迁移历史附件

迁移工具逐条执行：

1. 验证数据库附件记录的租户和业务主体。
2. 检查本地原件及派生资源。
3. 计算 SHA-256。
4. 上传 OSS。
5. `HEAD` 校验大小和对象存在性。
6. 更新 `storageBackend/objectKey/checksum`。
7. 保存检查点和错误报告。

脚本必须幂等、支持断点续跑，并分别输出：数据库缺文件、文件无数据库记录、校验失败、派生资源可重建。

### 阶段 D：切换与清理

- 默认后端切换为 OSS。
- 本地读取回退保留 14 至 30 天。
- 对比附件数、对象数、总字节数和抽样 SHA-256。
- 稳定后停止本地写入，最后再删除本地运行卷要求。
- OSS 稳定后再安排 PostgreSQL 生产切换。

## 12. 维护工具与监控

数据工具增加：

- 数据库记录存在但对象缺失。
- OSS 对象存在但数据库无记录。
- `PENDING/FAILED/DELETING` 超时。
- 缩略图、展示图和 Office 预览缺失。
- 重新生成派生资源。
- 按附件、租户或业务主体重新迁移。
- Bucket 对象数、总容量、请求错误和用量趋势。

海量对象核对使用 OSS 存储空间清单，不对生产 Bucket 高频全量 `ListObjects`。

## 13. 验收清单

- 图片、PDF、Office、文本及其他允许文件均可上传和下载。
- 缩略图、展示图、旋转和 Office 预览行为与本地存储一致。
- 业务单据首次生成、补打和重新生成 PDF 均形成独立归档附件。
- 租户 A 即使知道租户 B 的附件 ID 或对象键也无法访问。
- 容器重建和多实例读取不依赖本地持久附件卷。
- 归档不删除对象，永久删除会清理原件、派生对象及需要清理的历史版本。
- 迁移前后附件数量、字节数和抽样 SHA-256 一致。
- OSS 故障不会产生错误标记为 `READY` 的附件。
- 签名 URL 过期、RAM 权限和 Bucket 阻止公共访问经过验证。

## 14. 参考资料

- [阿里云 OSS Node.js SDK](https://help.aliyun.com/zh/oss/developer-reference/nodejs-sdk/)
- [阿里云 OSS 阻止公共访问](https://help.aliyun.com/zh/oss/user-guide/block-public-access/)
- [阿里云 OSS 地域与 Endpoint](https://help.aliyun.com/en/oss/user-guide/regions-and-endpoints)
- [阿里云 OSS 数据加密](https://help.aliyun.com/en/oss/user-guide/data-encryption/)
- [阿里云 OSS 版本控制](https://help.aliyun.com/zh/oss/user-guide/overview-78/)
- [阿里云 OSS 分片上传](https://help.aliyun.com/zh/oss/developer-reference/multipart-upload-3)
- [阿里云 OSS 存储空间清单](https://help.aliyun.com/zh/oss/user-guide/bucket-inventory/)

