import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import packageJson from '@/package.json'
import manifest from '@/sop/manifest.json'
import videoManifest from '@/sop/videos.json'
import { getEffectivePermissionMap, type PermissionSubject } from '@/lib/permissions'
import type { SopCatalog, SopChapter, SopWorkflow } from '../contracts/sop'
import { buildSopDownloads } from '../domain/sop-downloads'
import { buildSopVideos, type SopVideoManifestEntry } from '../domain/sop-videos'

const screenshotRoot = resolve(process.cwd(), 'docs/operations/user-guide/screenshots')
const source = manifest as Omit<SopCatalog, 'version' | 'workflowCount' | 'downloads' | 'videos'>
const videoSource = videoManifest.videos as SopVideoManifestEntry[]

function allWorkflows() {
  return source.chapters.flatMap((chapter) => chapter.workflows)
}

export function findSopWorkflow(workflowId: string) {
  return allWorkflows().find((workflow) => workflow.id === workflowId)
}

export async function getReadableSopCatalog(subject: PermissionSubject, pageKey?: string): Promise<SopCatalog> {
  const permissions = subject.role === 'ADMIN' ? null : await getEffectivePermissionMap(subject)
  const chapters: SopChapter[] = source.chapters.flatMap((chapter) => {
    const workflows = chapter.workflows
      .filter((workflow) => !pageKey || workflow.pageKey === pageKey)
      .filter((workflow) => subject.role === 'ADMIN' || Boolean(permissions?.[workflow.resource]?.canRead))
      .map((workflow): SopWorkflow => ({
        ...workflow,
        screenshotUrl: `/api/sop/screenshots/${encodeURIComponent(workflow.id)}`,
      }))
    return workflows.length > 0 ? [{ ...chapter, workflows }] : []
  })
  const workflowMap = new Map(allWorkflows().map((workflow) => [workflow.id, workflow]))
  const chapterIds = new Set(source.chapters.map((chapter) => chapter.id))
  const videos = buildSopVideos(videoSource.flatMap((video): SopVideoManifestEntry[] => {
    if (!chapterIds.has(video.chapterId) || video.workflowIds.some((workflowId) => !workflowMap.has(workflowId))) return []
    return [{
      ...video,
      pageKeys: Array.from(new Set(video.workflowIds.map((workflowId) => workflowMap.get(workflowId)?.pageKey).filter((key): key is string => Boolean(key)))),
    }]
  }))
    .filter((video) => !pageKey || video.pageKeys.length === 0 || video.pageKeys.includes(pageKey))
    .filter((video) => subject.role === 'ADMIN' || Boolean(permissions?.[video.resource as keyof typeof permissions]?.canRead))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, 'zh-CN'))
  return {
    ...source,
    version: packageJson.version,
    chapters,
    workflowCount: chapters.reduce((count, chapter) => count + chapter.workflows.length, 0),
    downloads: buildSopDownloads(packageJson.version),
    videos,
  }
}

export async function readSopScreenshot(workflow: SopWorkflow) {
  const imagePath = resolve(screenshotRoot, `v${workflow.screenshot.baseline}`, workflow.screenshot.file)
  if (!imagePath.startsWith(`${screenshotRoot}${sep}`)) throw new Error('SOP 截图路径不合法')
  return readFile(imagePath)
}
