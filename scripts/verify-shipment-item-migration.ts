import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const targetMigration = '20260822093000_add_shipment_items'
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-shipment-item-migration-'))
const migrationsRoot = join(process.cwd(), 'prisma', 'migrations')

type SqliteRow = Record<string, unknown>
type SqliteDatabase = {
  exec(sql: string): void
  prepare(sql: string): { get(): SqliteRow | undefined; all(): SqliteRow[] }
  close(): void
}

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => SqliteDatabase
}

function prepareLegacyDatabase(name: string) {
  const database = new DatabaseSync(join(verifyRoot, `${name}.db`))
  const migrations = readdirSync(migrationsRoot).filter((migration) => migration < targetMigration).sort()
  for (const migration of migrations) {
    database.exec(readFileSync(join(migrationsRoot, migration, 'migration.sql'), 'utf8'))
  }
  return database
}

function applyTargetMigration(database: SqliteDatabase) {
  database.exec(readFileSync(join(migrationsRoot, targetMigration, 'migration.sql'), 'utf8'))
}

async function main() {
  const database = prepareLegacyDatabase('valid')
  const invalidDatabase = prepareLegacyDatabase('invalid')
  try {
    database.exec(`
      PRAGMA foreign_keys=ON;
      INSERT INTO "Material" ("id", "code", "name", "unit", "stockUnit", "valuationUnit")
      VALUES ('material-1', 'LEGACY-MAT', '旧发货产品', '件', '件', '件');
      INSERT INTO "Product" ("id", "sku", "name", "category", "unit", "materialId", "updatedAt")
      VALUES ('product-1', 'LEGACY-PRODUCT', '旧产品', 'FINISHED', '件', 'material-1', CURRENT_TIMESTAMP);
      INSERT INTO "InventoryLocation" ("id", "code", "name")
      VALUES ('location-1', 'LEGACY-LOCATION', '旧发货库位');
      INSERT INTO "Customer" ("id", "code", "name")
      VALUES ('customer-1', 'LEGACY-CUSTOMER', '旧客户');
      INSERT INTO "Shipment" (
        "id", "shipmentNo", "productId", "materialId", "locationId", "customerId",
        "qty", "unitPrice", "totalAmount", "customer", "status",
        "shippedValuationQty", "shippedCostAmount", "stockUnitSnapshot", "valuationUnitSnapshot"
      ) VALUES (
        'shipment-1', 'SH-LEGACY-001', 'product-1', 'material-1', 'location-1', 'customer-1',
        8, 12.5, 100, '旧客户', 'DELIVERED', 8, 40, '件', '件'
      );
      INSERT INTO "ReturnOrder" (
        "id", "returnNo", "shipmentId", "productId", "materialId", "locationId", "qty", "reason", "status"
      ) VALUES (
        'return-1', 'RT-LEGACY-001', 'shipment-1', 'product-1', 'material-1', 'location-1', 2, '旧退货', 'PROCESSED'
      );
      INSERT INTO "InventoryLot" (
        "id", "lotNo", "materialId", "sourceType", "sourceId", "updatedAt"
      ) VALUES ('lot-1', 'LOT-LEGACY-001', 'material-1', 'VERIFY', 'legacy', CURRENT_TIMESTAMP);
      INSERT INTO "ShipmentLotAllocation" (
        "id", "shipmentId", "lotId", "locationId", "stockQty", "valuationQty", "costAmount", "returnedStockQty"
      ) VALUES ('allocation-1', 'shipment-1', 'lot-1', 'location-1', 8, 8, 40, 2);
      INSERT INTO "PackageDocument" (
        "id", "packageNo", "shipmentId", "packedBy", "updatedAt"
      ) VALUES ('package-1', 'BX-LEGACY-001', 'shipment-1', '旧装箱员', CURRENT_TIMESTAMP);
      INSERT INTO "PackageDocumentItem" (
        "id", "packageDocumentId", "materialId", "inventoryLotId", "quantity", "unitSnapshot"
      ) VALUES ('package-item-1', 'package-1', 'material-1', 'lot-1', 8, '件');
    `)

    applyTargetMigration(database)
    const migratedItem = database.prepare(`
      SELECT "id", "shipmentId", "materialId", "productId", "locationId", "qty",
             "unitSnapshot", "unitPrice", "totalAmount", "shippedCostAmount"
      FROM "ShipmentItem" WHERE "shipmentId" = 'shipment-1'
    `).get() as Record<string, unknown>
    assert.deepEqual({ ...migratedItem }, {
      id: 'shipment-item-shipment-1', shipmentId: 'shipment-1', materialId: 'material-1',
      productId: 'product-1', locationId: 'location-1', qty: 8, unitSnapshot: '件',
      unitPrice: 12.5, totalAmount: 100, shippedCostAmount: 40,
    })
    assert.equal(
      database.prepare(`SELECT "shipmentItemId" FROM "ReturnOrder" WHERE "id" = 'return-1'`).get()!.shipmentItemId,
      'shipment-item-shipment-1',
      '历史退货必须回填到对应发货明细',
    )
    assert.equal(
      database.prepare(`SELECT "shipmentItemId" FROM "ShipmentLotAllocation" WHERE "id" = 'allocation-1'`).get()!.shipmentItemId,
      'shipment-item-shipment-1',
      '历史批次分配必须回填到对应发货明细',
    )
    assert.equal(
      database.prepare(`SELECT "shipmentItemId" FROM "PackageDocumentItem" WHERE "id" = 'package-item-1'`).get()!.shipmentItemId,
      'shipment-item-shipment-1',
      '历史装箱明细必须回填到对应发货明细',
    )
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM "Shipment"').get()!.count, 1)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM "ShipmentItem"').get()!.count, 1)
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), [], '迁移后不得存在悬空外键')

    invalidDatabase.exec(`
      INSERT INTO "Product" ("id", "sku", "name", "category", "unit", "updatedAt")
      VALUES ('unmapped-product', 'UNMAPPED', '未映射产品', 'FINISHED', '件', CURRENT_TIMESTAMP);
      INSERT INTO "Shipment" ("id", "shipmentNo", "productId", "qty", "customer")
      VALUES ('invalid-shipment', 'SH-INVALID', 'unmapped-product', 1, '无效客户');
    `)
    assert.throws(
      () => applyTargetMigration(invalidDatabase),
      /CHECK constraint failed/,
      '无法解析物料或库位的历史发货单必须阻断迁移，禁止静默丢失',
    )

    console.log('发货明细迁移验证通过：旧单头、退货、批次和装箱明细完整回填，异常历史数据会阻断迁移。')
  } finally {
    database.close()
    invalidDatabase.close()
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
