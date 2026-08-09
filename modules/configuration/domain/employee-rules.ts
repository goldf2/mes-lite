import type { EmployeeFieldsInput } from '../contracts/employee-schema'

const employeeCodePattern = /^EMP-(\d+)$/

export function nextEmployeeCodeFromExisting(codes: string[]) {
  const largestSequence = codes.reduce((largest, code) => {
    const match = employeeCodePattern.exec(code)
    return match ? Math.max(largest, Number(match[1])) : largest
  }, 0)
  return `EMP-${String(largestSequence + 1).padStart(6, '0')}`
}

export function employeeWriteData(input: EmployeeFieldsInput) {
  return {
    name: input.name.trim(),
    department: input.department?.trim() || null,
    phone: input.phone?.trim() || null,
    note: input.note?.trim() || null,
    isActive: input.isActive ?? true,
    operatorId: input.operatorId?.trim() || null,
  }
}

export function employeeNamesSnapshot(employees: Array<{ name: string }>) {
  return employees.map((employee) => employee.name).join('、')
}
