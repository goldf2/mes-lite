import type { MaterialBom } from '../contracts'

const materialProductPrefix = 'material:'

export function bomMaterialIdOfProduct(product: Pick<MaterialBom, 'id' | 'sourceMaterialId'>) {
  return product.sourceMaterialId || product.id.replace(materialProductPrefix, '')
}

export function indexBomProductsByMaterialId(products: MaterialBom[]) {
  return new Map(products.map((product) => [bomMaterialIdOfProduct(product), product]))
}

export function bomProductIdForMaterial(materialId: string) {
  return `${materialProductPrefix}${materialId}`
}
