export class MaterialInDomainError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message)
    this.name = 'MaterialInDomainError'
  }
}

const expectedMaterialInError = /必须|不能为负|必须大于|库位|库存|成本层|来料|物料|供应商/

export async function runMaterialInDomainOperation<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof MaterialInDomainError) throw error
    if (error instanceof Error && expectedMaterialInError.test(error.message)) {
      throw new MaterialInDomainError(error.message)
    }
    throw error
  }
}
