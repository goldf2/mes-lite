# LibreDWG CAD 预览服务 Coolify 配置手册

适用版本：MES-lite `v0.1.416` 及以后

适用入口：`https://cool-con01.xiangshu.me/`

MES 主入口：`https://mes.csyufeng.com/`

本文用于在 Coolify 中手动部署仓库内的 `services/cad-preview/` 服务，并让 MES-lite 通过私有网络调用它。完成代码合并不等于转换服务已经上线；只有转换器健康、MES 主应用重新部署且真实 DWG/DXF 样本验收通过，才能标记为已启用。

## 1. 部署结构

```text
浏览器
  -> https://mes.csyufeng.com
     -> MES-lite 主应用
        -> http://cad-preview:8080
           -> LibreDWG / ezdxf / PyMuPDF 转换容器
```

- 浏览器只访问 MES-lite，不直接访问转换器。
- 转换器不绑定公网域名，不映射宿主机端口。
- MES-lite 与转换器必须位于同一台 Coolify 服务器、同一 Destination 私有网络。
- DWG/DXF 原文件仍由 MES-lite 附件系统管理；转换器只处理临时副本并返回 PDF。

## 2. 创建第二个 Application

在 `ERP系统 / production` 环境中新建 Application，选择 MES-lite 当前使用的 GitHub App 和仓库。

创建向导填写：

| 字段 | 内容 |
| --- | --- |
| Repository | `mes-lite` |
| Branch | `main` |
| Build Pack | `Dockerfile` |
| Base Directory | `/` |
| Is it a static site | 不勾选 |

创建向导中的 Port 即使暂时显示 `3000` 也可以先继续；进入 Application 后必须按下一节改为 `8080`。

## 3. General 与网络配置

进入新 Application 的 General 页面，填写：

| 字段 | 内容 |
| --- | --- |
| Name | `cad-preview` |
| Domain | 留空 |
| Base Directory | `/` |
| Dockerfile Location | `/services/cad-preview/Dockerfile` |
| Ports Exposes | `8080` |
| Port Mappings | 留空 |
| Network Aliases | `cad-preview` |
| Server / Destination | 与 MES-lite 主应用相同的 `localhost` / Destination |
| Project / Environment | `ERP系统 / production` |
| Instances | `1` |

不要填写 `8080:8080`，也不要为转换器生成临时公网域名。应用间连接使用 Network Alias；MES-lite 中的服务地址固定写成 `http://cad-preview:8080`，不要使用 Coolify 随机生成的容器名。

普通 Dockerfile Application 在相同 Destination 时应共享 Coolify 私有网络。如果当前 Coolify 版本提供 `Connect To Predefined Network`，只有在两个 Application 实际不在同一网络时才启用，并在部署后确认两者加入相同网络。

## 4. 生成并保存服务令牌

在可信电脑上生成随机令牌：

```bash
openssl rand -hex 32
```

要求：

- 令牌只保存到 Coolify Secret，不写入仓库、Dockerfile、部署日志或本文。
- 转换器和 MES-lite 主应用必须使用完全相同的值。
- 不要把真实令牌发送到聊天、工单或截图中。

## 5. 转换器环境变量

在 `cad-preview` 的 Environment Variables 中添加：

```env
CAD_PREVIEW_SERVICE_TOKEN=<第 4 节生成的相同令牌>
```

如果 Coolify 支持 Secret 标记，应把它设为 Secret。以下变量已有镜像默认值，首轮部署无需添加；需要调整时再显式覆盖：

```env
PORT=8080
CAD_PREVIEW_COMMAND_TIMEOUT_SECONDS=90
CAD_PREVIEW_MAX_UPLOAD_BYTES=52428800
CAD_PREVIEW_MAX_LAYOUTS=20
CAD_PREVIEW_MAX_CONCURRENT_CONVERSIONS=2
CAD_PREVIEW_QUEUE_TIMEOUT_SECONDS=120
CAD_PREVIEW_FONT_DIRS=/usr/local/share/fonts/mes-lite:/opt/cad-fonts
CAD_PREVIEW_MANAGED_FONT_DIRS=/opt/cad-fonts
```

## 6. 外挂企业 CAD 字体目录

在 `cad-preview` 的 **Persistent Storage** 新增目录/卷挂载，容器目标路径固定为：

```text
/opt/cad-fonts
```

源目录或 Volume 名可按服务器规范命名，例如 `mes-lite-cad-fonts`。标准模式要求该挂载允许容器入口在启动阶段执行一次受控权限修复，因此不要在 Coolify 把该挂载设为宿主层只读。入口只接受 `/opt/cad-fonts` 白名单路径，拒绝符号链接，把目录修为 `root:cadpreview 0750`、文件修为 `root:cadpreview 0640`，然后立即通过 `setpriv` 降为 UID 10001 的 `cadpreview` 进程、启用 no-new-privileges 并清空 capability 集；实际转换进程只能读取字体，不能改写字体目录或恢复 root 能力。若 Coolify 支持 capability 配置，采用 `drop ALL` 后仅为启动阶段增加 `CHOWN`、`FOWNER`、`DAC_OVERRIDE`、`SETUID`、`SETGID`、`SETPCAP`。把已经取得合法授权的 `.shx`、`.shp`、`.lff`、`.ttf`、`.ttc` 或 `.otf` 文件放入该持久目录，文件名应与 DWG/DXF 的文字样式引用完全一致。优先让制图方使用 AutoCAD eTransmit/字体缺失报告提供原图实际使用的字体，不要用来源不明的所谓“万能字库”。

每次增加或替换字体后：

1. 重新启动或 Redeploy `cad-preview`；入口先修复 `/opt/cad-fonts` 权限并降权，服务随后递归扫描字体并自动重建 ezdxf 缓存。
2. 查看启动日志，确认先出现 `CAD 字体目录权限已就绪`，随后出现 `fonts=/usr/local/share/fonts/mes-lite,/opt/cad-fonts` 以及每个目录的 owner、UID/GID、mode 和有效读写权限。
3. 调用受令牌保护的 `/health`，确认 `fontDirectories` 中两个目录均为 `status=ready`，外挂目录应显示 `owner=root`、`group=cadpreview`、`mode=0750`、`readable=true`、`searchable=true`、`writable=false`。
4. 在 MES-lite 对旧图纸点击“重新生成预览”；已有派生 PDF 不会仅因字体目录变化自动覆盖。
5. 先验收一份已知缺字图纸，再分批重建其他图纸。

不要扩大 `CAD_PREVIEW_MANAGED_FONT_DIRS` 到 `/opt/cad-fonts` 之外；入口会主动拒绝白名单外路径，防止 root 初始化误改其他挂载。不要把 Autodesk、供应商或客户字体提交到 Git 仓库，除非许可证明确允许再分发。字体挂载只属于 `cad-preview`，不挂载到 MES-lite 主应用。

## 7. 资源与容器加固

试运行建议从以下资源开始：

| 项目 | 建议值 |
| --- | --- |
| CPU | `1` |
| Memory Limit | `1 GiB` |
| Memory Reservation | `512 MiB` |
| 临时空间 | `/tmp` tmpfs `256 MiB` |
| Instances | `1` |

转换器不需要数据库、附件或备份挂载；仅在需要企业 CAD 字体时增加 `/opt/cad-fonts` 持久挂载。该挂载在 Docker/Coolify 层必须保持可写，供入口短暂以 root 幂等修复所有者和权限；降权后的 `cadpreview` 转换进程只有读取权限。

如果当前 Coolify 支持 Custom Docker Options，可填写：

```text
--read-only --tmpfs /tmp:size=256m,mode=1777 --cap-drop ALL --cap-add CHOWN --cap-add FOWNER --cap-add DAC_OVERRIDE --cap-add SETUID --cap-add SETGID --cap-add SETPCAP --security-opt no-new-privileges
```

若 Coolify 当前版本不接受其中某项，首次部署可先清空 Custom Docker Options 验证基础链路，再逐项启用并重新验收；不能因为加固参数失败而改为公网暴露服务。

## 8. 健康检查

镜像已经在 Dockerfile 中提供内置健康检查：

```text
GET /health
Internal Port: 8080
```

内置检查会在设置 `CAD_PREVIEW_SERVICE_TOKEN` 后自动携带 Bearer Token。若 Coolify 的独立 HTTP Healthcheck 不能添加 `Authorization` 请求头，不要再启用第二个无鉴权检查，否则会把健康服务误判为失败。

## 9. 先部署转换器

点击 `Deploy`，完成后检查：

- Application 状态为 `Running (healthy)`。
- 日志显示进程监听 `0.0.0.0:8080`。
- 没有反复重启、内存不足或只读文件系统错误。
- 没有配置 Domain 或 Port Mappings。

转换器未健康前，不修改 MES-lite 主应用环境变量。

## 10. 接入 MES-lite 主应用

打开现有 MES-lite Application，在 Environment Variables 增加：

```env
CAD_PREVIEW_SERVICE_URL=http://cad-preview:8080
CAD_PREVIEW_SERVICE_TOKEN=<与转换器完全相同的令牌>
CAD_PREVIEW_TIMEOUT_MS=120000
CAD_PREVIEW_MAX_CONCURRENT_CONVERSIONS=2
```

保存后重新部署 MES-lite 主应用。不要把 `CAD_PREVIEW_SERVICE_URL` 写成 `localhost:8080`：两个 Application 位于不同容器，`localhost` 只指向 MES-lite 自己。

## 11. 上线验收

### 11.1 系统健康

访问：

```text
https://mes.csyufeng.com/api/health/ready
```

确认：

- MES-lite 主应用仍为 ready。
- CAD 预览检查不再是“未配置”或“服务不可达”。
- 转换器故障只影响预览降级，不阻断原文件下载及 MES-lite 主业务启动。

### 11.2 真实文件

至少使用以下样本测试：

- 简单 DXF。
- R2000 DWG。
- R2007 或更新版本 DWG。
- 中文字体、尺寸标注和块。
- 单模型空间与多布局图纸。
- 含外部参照或已知复杂实体的图纸。
- 接近企业日常上限的大尺寸图纸。

逐项检查线宽、字体、图层、方向、纸张、布局、缩略图、全屏预览和下载原文件。LibreDWG/ezdxf 不是 AutoCAD 的像素级替代；关键内容缺失时必须保留原文件下载或配套 PDF，不得把有缺失的派生 PDF作为唯一生产依据。

## 12. 常见故障

| 现象 | 首先检查 |
| --- | --- |
| MES-lite 报服务不可达 | 两个 Application 是否位于同一 Destination；Network Alias 是否为 `cad-preview` |
| 返回 401 / 403 | 两边 `CAD_PREVIEW_SERVICE_TOKEN` 是否完全一致 |
| 连接被拒绝 | `Ports Exposes` 是否为 `8080`；进程是否监听 `0.0.0.0:8080` |
| Coolify 健康检查失败但容器日志正常 | 是否额外启用了不能携带 Bearer Token 的 HTTP Healthcheck |
| 转换超时 | 文件是否过大；先核对服务日志，再按样本风险调整命令超时或 MES 请求超时 |
| 批量导入后全部显示预览不可用 | 检查转换器是否 OOM/重启；保持默认并发 `2`，确认列表缩略图为延迟加载，再分批重新生成 |
| 中文变方框或字宽异常 | 从制图方取得图纸实际引用且已授权的 SHX/大字体，挂载到 `/opt/cad-fonts`，重启转换器并重新生成预览 |
| PDF 空白或图元缺失 | 检查字体、外部参照、垂直产品实体和 DWG 版本；改用原文件或配套 PDF |
| `localhost:8080` 不通 | 主应用必须使用 `http://cad-preview:8080`，不能使用自身 localhost |

## 13. 回滚

需要停止试用时：

1. 从 MES-lite 主应用删除 `CAD_PREVIEW_SERVICE_URL`。
2. 重新部署 MES-lite，确认 readiness 仅提示 CAD 未配置，其他业务正常。
3. 停止 `cad-preview` Application。
4. 暂不删除 Application，保留配置和日志用于复盘。

回滚不删除原始 DWG/DXF，也不需要修改数据库。已经生成并缓存的派生 PDF 可按现有附件缓存规则处理。

## 14. 许可证边界

当前试用链路包含：

- GNU LibreDWG：GPL-3.0-or-later。
- ezdxf：MIT。
- PyMuPDF：AGPL-3.0-or-later 或商业许可。

在自有服务器内部试用仍应保留许可证和源码版本记录。若把转换器镜像交付客户、对外分发或改变商业部署方式，必须在交付前复核源码提供、许可证文本、修改说明以及 PyMuPDF 商业许可需求。

## 15. 配置完成记录

配置人员完成后自行填写，不得记录真实 Secret：

| 项目 | 记录 |
| --- | --- |
| 配置日期 |  |
| 配置人员 |  |
| MES-lite 提交 SHA |  |
| cad-preview 提交 SHA |  |
| Coolify Application 名称 |  |
| 转换器健康状态 |  |
| MES readiness 状态 |  |
| 验收样本清单位置 |  |
| 回滚点或变更单编号 |  |
