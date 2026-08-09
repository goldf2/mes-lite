export interface EmployeeOperatorOption {
  id: string
  username: string
  name: string
  role: string
  status: string
  employee?: { id: string; code: string; name: string } | null
}

export interface EmployeeItem {
  id: string
  code: string
  name: string
  department?: string | null
  phone?: string | null
  note?: string | null
  isActive: boolean
  operatorId?: string | null
  operator?: Omit<EmployeeOperatorOption, 'employee'> | null
  createdAt: string
  updatedAt: string
  sortOrder: number
}

export interface EmployeeForm {
  name: string
  department: string
  phone: string
  note: string
  isActive: boolean
  operatorId: string
}
