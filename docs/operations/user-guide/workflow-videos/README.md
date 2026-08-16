# MES-lite 常用工作流视频 SOP

本目录保存可审查、可版本化的分镜源文件；MP4、SRT、旁白稿和预览图生成到 `output/tutorials/`，不进入 Git 或 Docker 镜像。

当前首批视频内容基线为 `v0.1.394`；构建与校验工具随应用 `v0.1.395` 发布。每份分镜的 `contentVersion` 固定截图和讲解所对应的界面事实，重新生成时不会随应用版本漂移。

## 第一批工作流

| 编号 | 视频 | 业务结果 | 主章节 |
| --- | --- | --- | --- |
| 01 | 新物料到 BOM 发布 | 物料和正式 BOM 可用于生产订单 | 物料与 BOM |
| 02 | 来料接收与质量放行 | 来料形成可追溯、可用或受控冻结的批次 | 来料 / 质量 |
| 03 | 生产订单到产出放行 | 订单、派工、实绩、质量和批次谱系闭环 | 生产 / 质量 |
| 04 | 库内转移与库存查账 | 库位余额、批次和库存流水一致 | 库存 / 流程转移 |
| 05 | 销售订单到发货追溯 | 销售履约扣账并记录客户批次去向 | 销售 / 发货 |
| 06 | 客户退货与质量回流 | 原发货、退货待检和最终质量去向闭环 | 退货 / 质量 |
| 07 | 设备异常到维修恢复 | 故障、工单、备件和设备恢复证据贯通 | 设备 |

## 生成与验收

```bash
npm run tutorial:verify:workflows
npm run tutorial:build:workflows
npm run tutorial:verify:outputs
```

也可以只生成一组：

```bash
node scripts/build-workflow-video-sops.mjs 02-incoming-quality-release
```

每组输出包括：

- `*-无配音母版.mp4`：不烧录旁白字幕，供剪映配音或直接上传。
- `*.srt`：严格按母版场景时间生成，不重叠。
- `*-旁白稿.md`：与 SRT 相同的分镜文本和时间段。
- `*-配音字幕预览.mp4`：使用系统音色生成的同步检查版，只用于核对节奏。
- `*-preview.png`：封面抽帧。

上传 OSS 前先检查方向、标题/截图遮挡、字幕无重叠、音轨同步、最终结果画面和版本号。审核通过后再把对象路径登记到 `sop/videos.json`，未上传的本地视频不得提前发布到帮助中心。

如果视频内容基线与当前代码版本不同，可以指定待检查的内容版本：

```bash
node scripts/verify-workflow-video-outputs.mjs --version 0.1.394
```

## 审核后的发布路径

首批内容审核通过后，建议上传无配音母版或人工配音终版到以下对象目录：

```text
v0.1.394/videos/MES-lite新物料到BOM发布-v0.1.394.mp4
v0.1.394/videos/MES-lite来料接收与质量放行-v0.1.394.mp4
v0.1.394/videos/MES-lite生产订单到产出放行-v0.1.394.mp4
v0.1.394/videos/MES-lite库内转移与库存查账-v0.1.394.mp4
v0.1.394/videos/MES-lite销售订单到发货追溯-v0.1.394.mp4
v0.1.394/videos/MES-lite客户退货与质量回流-v0.1.394.mp4
v0.1.394/videos/MES-lite设备异常到维修恢复-v0.1.394.mp4
```

只有对象上传完成、HTTPS 地址可以播放且人工确认终版后，才为相应分镜复制 `id`、`chapterId`、`workflowIds` 和 `resource` 到 `sop/videos.json`。配音字幕预览仅用于节奏检查，不作为默认上线版本。
