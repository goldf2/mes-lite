import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const targetMigration = '20260803170000_add_daily_production_input_locations'
const verifyRoot = mkdtempSync(join(tmpdir(), 'ml-dp-reset-'))
const databasePath = join(verifyRoot, 'verify.db')

const runSql = (sql: string) => execFileSync('sqlite3', [databasePath], {
  input: sql,
  encoding: 'utf8',
})

async function main() {
  try {
    const migrationsRoot = join(process.cwd(), 'prisma', 'migrations')
    const migrations = readdirSync(migrationsRoot)
      .filter((name) => name < targetMigration)
      .sort()
    for (const migration of migrations) {
      runSql(readFileSync(join(migrationsRoot, migration, 'migration.sql'), 'utf8'))
    }

    runSql(`
      PRAGMA foreign_keys = ON;
      INSERT INTO "Material" ("id", "code", "name", "unit", "stockUnit", "valuationUnit")
      VALUES ('raw', 'VERIFY-RAW', '验证原料', 'm', 'm', 'm'),
             ('finished', 'VERIFY-FIN', '验证产出', '件', '件', '件');
      INSERT INTO "Stock" (
        "id", "materialId", "qty", "availableQty", "valuationQty",
        "availableValuationQty", "totalCost", "valuationUnitCost", "stockUnitCost"
      ) VALUES
        ('stock-raw', 'raw', 4, 4, 4, 4, 40, 10, 10),
        ('stock-finished', 'finished', 20, 20, 20, 20, 60, 3, 3);
      INSERT INTO "StockLocationBalance" ("id", "stockId", "locationId", "qty", "availableQty")
      VALUES ('balance-raw', 'stock-raw', 'default-location', 4, 4),
             ('balance-finished', 'stock-finished', 'default-location', 20, 20);
      INSERT INTO "DailyProductionReport" (
        "id", "reportNo", "reportDate", "finishedMaterialId", "workers", "status",
        "bomId", "bomVersion", "outputValuationQty", "outputCostAmount",
        "consumptionLocationId", "outputLocationId", "outputQty", "updatedAt"
      ) VALUES (
        'report', 'VERIFY-REPORT', CURRENT_TIMESTAMP, 'finished', '验证员', 'CONFIRMED',
        'legacy-bom', 'v1', 20, 60, 'default-location', 'default-location', 20, CURRENT_TIMESTAMP
      );
      INSERT INTO "InventoryCostLayer" (
        "id", "materialId", "stockQty", "remainingStockQty", "valuationQty",
        "remainingValuationQty", "stockUnit", "valuationUnit", "valuationUnitCost",
        "stockUnitCost", "totalAmount", "remainingAmount", "status"
      ) VALUES ('raw-layer', 'raw', 10, 4, 10, 4, 'm', 'm', 10, 10, 100, 40, 'OPEN');
      INSERT INTO "InventoryCostLayer" (
        "id", "materialId", "sourceType", "sourceId", "stockQty", "remainingStockQty",
        "valuationQty", "remainingValuationQty", "stockUnit", "valuationUnit",
        "valuationUnitCost", "stockUnitCost", "totalAmount", "remainingAmount", "status"
      ) VALUES (
        'output-layer', 'finished', 'DAILY_PRODUCTION_REPORT', 'report', 20, 20,
        20, 20, '件', '件', 3, 3, 60, 60, 'OPEN'
      );
      INSERT INTO "DailyProductionConsumption" (
        "id", "reportId", "materialId", "materialCode", "materialName", "quantityPerUnit",
        "plannedQty", "actualQty", "unit", "valuationQty", "costAmount", "costLayerSnapshot"
      ) VALUES (
        'consumption', 'report', 'raw', 'VERIFY-RAW', '验证原料', 0.3,
        6, 6, 'm', 6, 60,
        '[{"costLayerId":"raw-layer","stockQty":6,"valuationQty":6,"costAmount":60}]'
      );
      INSERT INTO "StockLog" (
        "id", "stockId", "locationId", "type", "qty", "beforeQty", "afterQty",
        "valuationQty", "costAmount", "refType", "refId"
      ) VALUES
        ('consume-log', 'stock-raw', 'default-location', 'PRODUCTION_CONSUME', -6, 10, 4, -6, -60, 'DAILY_PRODUCTION_REPORT', 'report'),
        ('output-log', 'stock-finished', 'default-location', 'PRODUCTION_IN', 20, 0, 20, 20, 60, 'DAILY_PRODUCTION_REPORT', 'report');
    `)

    runSql(readFileSync(join(migrationsRoot, targetMigration, 'migration.sql'), 'utf8'))

    assert.equal(runSql('SELECT COUNT(*) FROM "DailyProductionReport";').trim(), '0')
    assert.equal(runSql('SELECT COUNT(*) FROM "DailyProductionConsumption";').trim(), '0')
    assert.equal(runSql("SELECT qty || '|' || valuationQty || '|' || totalCost FROM Stock WHERE id='stock-raw';").trim(), '10.0|10.0|100.0')
    assert.equal(runSql("SELECT qty || '|' || valuationQty || '|' || totalCost FROM Stock WHERE id='stock-finished';").trim(), '0.0|0.0|0.0')
    assert.equal(runSql("SELECT qty || '|' || availableQty FROM StockLocationBalance WHERE id='balance-raw';").trim(), '10.0|10.0')
    assert.equal(runSql("SELECT qty || '|' || availableQty FROM StockLocationBalance WHERE id='balance-finished';").trim(), '0.0|0.0')
    assert.equal(runSql("SELECT remainingStockQty || '|' || remainingAmount FROM InventoryCostLayer WHERE id='raw-layer';").trim(), '10.0|100.0')
    assert.equal(runSql("SELECT COUNT(*) FROM InventoryCostLayer WHERE id='output-layer';").trim(), '0')
    assert.equal(runSql("SELECT COUNT(*) FROM StockLog WHERE refId='report';").trim(), '0')
    assert.equal(runSql("SELECT [notnull] FROM pragma_table_info('DailyProductionConsumption') WHERE name='locationId';").trim(), '1')

    console.log('旧测试日报、库存净影响和成本层清理迁移验证通过')
  } finally {
    rmSync(verifyRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
