import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit'
import { requireResourcePermission } from '@/lib/permissions'
import {
  employeeFieldsSchema,
  employeeUpdateSchema,
} from '@/modules/configuration/contracts/employee-schema'
import { employeeHttpError } from '@/modules/configuration/http/employee-http-errors'
import {
  createManagedEmployee,
  updateManagedEmployee,
} from '@/modules/configuration/server/employee-command-service'
import { listEmployeeWorkspace } from '@/modules/configuration/server/employee-query-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('employees', 'read')
    if (denied) return denied
    const params = new URL(req.url).searchParams
    const data = await listEmployeeWorkspace(
      params.get('keyword')?.trim() || undefined,
      params.get('includeInactive') === '1',
    )
    return NextResponse.json({ data: data.employees, operators: data.operators })
  } catch (error) {
    return employeeHttpError(error, '获取员工资料失败')
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('employees', 'create')
    if (denied) return denied
    const employee = await createManagedEmployee(employeeFieldsSchema.parse(await req.json()))
    await writeAuditLog(req, {
      action: 'CREATE', entityType: 'EMPLOYEE', entityId: employee.id,
      entityLabel: `${employee.code} ${employee.name}`, afterData: employee,
    })
    return NextResponse.json({ data: employee, message: `员工 ${employee.code} 已新增` }, { status: 201 })
  } catch (error) {
    return employeeHttpError(error, '新增员工失败')
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const denied = await requireResourcePermission('employees', 'update')
    if (denied) return denied
    const { before, saved } = await updateManagedEmployee(employeeUpdateSchema.parse(await req.json()))
    await writeAuditLog(req, {
      action: 'UPDATE', entityType: 'EMPLOYEE', entityId: saved.id,
      entityLabel: `${saved.code} ${saved.name}`, beforeData: before, afterData: saved,
      note: before.isActive !== saved.isActive ? (saved.isActive ? '重新启用员工' : '停用员工') : undefined,
    })
    return NextResponse.json({ data: saved, message: saved.isActive ? '员工资料已保存' : '员工已停用' })
  } catch (error) {
    return employeeHttpError(error, '保存员工资料失败')
  }
}
