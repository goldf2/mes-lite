import { NextResponse } from 'next/server'
import { getCurrentOperator } from '@/lib/auth'
import type { DirectoryResource } from '../contracts/business-directory'
import { DirectoryError, parseDirectoryQuery } from '../domain/business-directory'
import { authorizeDirectoryRequest } from '../server/directory-authorization'
import { getBusinessDirectory, getBusinessDirectoryDiagnostics } from '../server/business-directory-service'

const privateHeaders = { 'Cache-Control': 'no-store', 'Vary': 'Authorization' }
export async function businessDirectoryGet(request: Request, resource: DirectoryResource) {
  try {
    const source = await authorizeDirectoryRequest(request)
    const query = parseDirectoryQuery(new URL(request.url).searchParams)
    return NextResponse.json(await getBusinessDirectory(resource, source, query), { headers: privateHeaders })
  } catch (error) {
    const known = error instanceof DirectoryError
    return NextResponse.json({ error: known ? error.code : 'DIRECTORY_UNAVAILABLE' }, {
      status: known ? error.status : 503, headers: privateHeaders,
    })
  }
}

export async function businessDirectoryDiagnosticsGet() {
  const current = await getCurrentOperator()
  if (!current || current.role !== 'ADMIN') return NextResponse.json({ error: '无权限' }, { status: 403, headers: privateHeaders })
  try {
    return NextResponse.json({ data: await getBusinessDirectoryDiagnostics() }, { headers: privateHeaders })
  } catch {
    return NextResponse.json({ error: '接入诊断暂不可用' }, { status: 503, headers: privateHeaders })
  }
}
