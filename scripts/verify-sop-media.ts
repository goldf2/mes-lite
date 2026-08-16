import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildSopVideos, type SopVideoManifestEntry } from '@/modules/sop/domain/sop-videos'

const association = {
  chapterId: '01',
  workflowIds: ['02-dashboard'],
  sortOrder: 10,
}

const sample: SopVideoManifestEntry[] = [
  {
    id: 'local-file',
    title: '本地文件',
    description: '对象存储视频',
    provider: 'file',
    version: '0.1.388',
    ...association,
    resource: 'dashboard',
    pageKeys: ['dashboard'],
    objectPath: 'v0.1.388/videos/MES-lite 主界面.mp4',
  },
  {
    id: 'youtube',
    title: 'YouTube',
    description: 'YouTube 视频',
    provider: 'youtube',
    version: 'external',
    ...association,
    resource: 'dashboard',
    pageKeys: [],
    videoId: 'M7lc1UVf-VE',
  },
  {
    id: 'bilibili',
    title: 'B站',
    description: 'B站视频',
    provider: 'bilibili',
    version: 'external',
    ...association,
    resource: 'dashboard',
    pageKeys: [],
    videoId: 'BV1xx411c7mD',
  },
]

const videos = buildSopVideos(sample, 'https://downloads.example.com/mes-lite/sop', 'production')
assert.equal(videos.length, 3, '三类视频来源都应生成')
assert.equal(videos[0].playbackUrl, 'https://downloads.example.com/mes-lite/sop/v0.1.388/videos/MES-lite%20%E4%B8%BB%E7%95%8C%E9%9D%A2.mp4')
assert.equal(videos[0].sourceUrl, videos[0].playbackUrl)
assert.equal(videos[0].chapterId, '01')
assert.deepEqual(videos[0].workflowIds, ['02-dashboard'])
assert.equal(videos[1].playbackUrl, 'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?rel=0&playsinline=1')
assert.equal(videos[1].sourceUrl, 'https://www.youtube.com/watch?v=M7lc1UVf-VE')
assert.match(videos[2].playbackUrl, /^https:\/\/player\.bilibili\.com\/player\.html\?/)
assert.match(videos[2].playbackUrl, /bvid=BV1xx411c7mD/)
assert.doesNotMatch(videos.map((video) => video.playbackUrl).join('\n'), /autoplay=1/)

assert.equal(buildSopVideos([sample[0]], '', 'production').length, 0, '未配置 OSS 地址时不应暴露失效文件播放器')
assert.equal(buildSopVideos([sample[0]], 'http://downloads.example.com', 'production').length, 0, '生产环境拒绝非 HTTPS 文件地址')
assert.equal(buildSopVideos([{
  id: 'bad-youtube', title: '非法 YouTube', description: '', provider: 'youtube', version: 'external', ...association, resource: 'dashboard', pageKeys: [], videoId: 'not-safe',
}], undefined, 'production').length, 0, '非法 YouTube ID 必须忽略')
assert.equal(buildSopVideos([{
  id: 'bad-bilibili', title: '非法 B站', description: '', provider: 'bilibili', version: 'external', ...association, resource: 'dashboard', pageKeys: [], videoId: 'not-safe',
}], undefined, 'production').length, 0, '非法 B站 BV 号必须忽略')

const center = readFileSync('modules/sop/ui/SopHelpCenterPage.tsx', 'utf8')
const player = readFileSync('modules/sop/ui/SopVideoCard.tsx', 'utf8')
const server = readFileSync('modules/sop/server/sop-catalog.ts', 'utf8')
const drawer = readFileSync('modules/sop/ui/SopHelpDrawer.tsx', 'utf8')
const manifest = JSON.parse(readFileSync('sop/manifest.json', 'utf8')) as { chapters: Array<{ id: string; workflows: Array<{ id: string }> }> }
const videoManifest = JSON.parse(readFileSync('sop/videos.json', 'utf8')) as { videos: Array<{ chapterId: string; workflowIds: string[] }> }
const chapterIds = new Set(manifest.chapters.map((chapter) => chapter.id))
const workflowIds = new Set(manifest.chapters.flatMap((chapter) => chapter.workflows.map((workflow) => workflow.id)))
for (const video of videoManifest.videos) {
  assert.ok(chapterIds.has(video.chapterId), `视频章节 ${video.chapterId} 必须存在`)
  assert.ok(video.workflowIds.length > 0, '视频至少关联一个现有 SOP 流程')
  for (const workflowId of video.workflowIds) assert.ok(workflowIds.has(workflowId), `视频流程 ${workflowId} 必须存在`)
}
assert.match(center, /catalog\?\.videos/, '帮助中心必须读取视频目录')
assert.match(center, /SopVideoCard/, '帮助中心必须渲染视频卡片')
assert.match(center, /video\.chapterId === chapter\.id/, '完整帮助中心必须按现有章节归类视频')
assert.match(drawer, /catalog\?\.videos/, '快捷帮助必须读取当前页面视频')
assert.match(drawer, /SopVideoCard/, '快捷帮助必须提供视频播放入口')
assert.match(player, /<video/, '直接视频文件必须使用原生 video 播放器')
assert.match(player, /<iframe/, '媒体平台必须使用 iframe 播放器')
assert.match(player, /loading="lazy"/, '第三方播放器必须延迟加载')
assert.match(player, /target="_blank"/, '视频必须保留新页面来源入口')
assert.doesNotMatch(player, /dangerouslySetInnerHTML/, '视频播放器不得注入原始 HTML')
assert.match(server, /video\.resource/, '视频目录必须按资源读权限过滤')
assert.match(server, /video\.pageKeys/, '当前页帮助必须过滤不相关视频')

console.log('SOP 视频帮助验证通过：文件、B站、YouTube、安全地址、权限过滤与延迟加载均符合要求。')
