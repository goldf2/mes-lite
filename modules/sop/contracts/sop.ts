export interface SopScreenshot {
  baseline: string
  file: string
}

export interface SopWorkflow {
  id: string
  title: string
  objective: string
  steps: string[]
  result: string
  pageKey: string
  resource: string
  roles: string[]
  screenshot: SopScreenshot
  lastVerifiedVersion: string
  screenshotUrl?: string
}

export interface SopChapter {
  id: string
  title: string
  workflows: SopWorkflow[]
}

export interface SopDownload {
  format: 'PDF' | 'DOCX'
  label: string
  fileName: string
  url: string
}

export type SopVideoProvider = 'file' | 'bilibili' | 'youtube'

export interface SopVideo {
  id: string
  title: string
  description: string
  provider: SopVideoProvider
  version: string
  chapterId: string
  workflowIds: string[]
  sortOrder: number
  resource: string
  pageKeys: string[]
  playbackUrl: string
  sourceUrl: string
}

export interface SopCatalog {
  schemaVersion: number
  version: string
  title: string
  recommendedSequence: string
  important: string
  governanceBoundaries: string[]
  chapters: SopChapter[]
  workflowCount: number
  downloads?: SopDownload[]
  videos?: SopVideo[]
}
