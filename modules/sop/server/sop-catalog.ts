import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import packageJson from '@/package.json'
import manifest from '@/sop/manifest.json'
import { getEffectivePermissionMap, type PermissionSubject } from '@/lib/permissions'
import type { SopCatalog, SopChapter, SopWorkflow } from '../contracts/sop'

const screenshotRoot = resolve(process.cwd(), 'docs/operations/user-guide/screenshots')
const source = manifest as Omit<SopCatalog, 'version' | 'workflowCount'>

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
  return {
    ...source,
    version: packageJson.version,
    chapters,
    workflowCount: chapters.reduce((count, chapter) => count + chapter.workflows.length, 0),
  }
}

export async function readSopScreenshot(workflow: SopWorkflow) {
  const imagePath = resolve(screenshotRoot, `v${workflow.screenshot.baseline}`, workflow.screenshot.file)
  if (!imagePath.startsWith(`${screenshotRoot}${sep}`)) throw new Error('SOP 截图路径不合法')
  return readFile(imagePath)
}
