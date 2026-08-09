export const employeeOperatorSelect = {
  id: true,
  username: true,
  name: true,
  role: true,
  status: true,
} as const

export const employeeWithOperator = {
  operator: { select: employeeOperatorSelect },
} as const
