import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import type { MaterialImportUpload } from '../contracts/material-import'
import { MaterialImportError, materialImportLimits } from './material-import-file'

const optionsSchema = z.object({
  worksheet: z.string().min(1).max(200).optional(), headerRow: z.number().int().min(1).max(50).optional(),
  mapping: z.record(z.number().int().min(0).max(199).nullable()).optional(),
  defaults: z.record(z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.null()])).optional(),
  mode: z.enum(['skip','update']).optional(),
}).strict()
export async function readMaterialImportUpload(req: NextRequest): Promise<MaterialImportUpload> {
  if (Number(req.headers.get('content-length') || 0) > materialImportLimits.bytes + 1024 * 1024) throw new MaterialImportError('上传请求不能超过 11MB')
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) throw new MaterialImportError('请上传 .xlsx 或 UTF-8 .csv 文件')
  if (file.size > materialImportLimits.bytes) throw new MaterialImportError('文件不能超过 10MB')
  const rawOptions = form.get('options')
  if (rawOptions !== null && (typeof rawOptions !== 'string' || rawOptions.length > 64000)) throw new MaterialImportError('导入选项无效或过长')
  let options: unknown = {}
  try { options = rawOptions ? JSON.parse(String(rawOptions)) : {} } catch { throw new MaterialImportError('导入选项不是有效 JSON') }
  const result = optionsSchema.safeParse(options)
  if (!result.success) throw new MaterialImportError('导入选项无效', result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`))
  const mode = result.data.mode || new URL(req.url).searchParams.get('mode') || 'skip'
  if (!['skip','update'].includes(mode)) throw new MaterialImportError('导入模式须为 skip 或 update')
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), options: { ...result.data, mode: mode as 'skip' | 'update' } }
}
export function materialImportErrorResponse(error: unknown) {
  if (error instanceof MaterialImportError) return NextResponse.json({ error: error.message, details: error.details }, { status: 400 })
  if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002','P2034'].includes(error.code)) return NextResponse.json({ error: '物料资料已被其他操作修改，请重新预览后再导入' }, { status: 409 })
  console.error('Material import failed:', error)
  return NextResponse.json({ error: '导入物料失败' }, { status: 500 })
}
