import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const targetMigration = '20261021090000_warehouse_packing'
const root = process.cwd()
const verificationRoot = mkdtempSync(join(tmpdir(), 'mes-warehouse-migration-'))
const candidatePrisma = join(verificationRoot, 'prisma')
const databasePath = join(verificationRoot, 'migration.db')
const migrationEnv = { ...process.env, DATABASE_URL: `file:${databasePath}`, RUST_LOG: 'info' }
const prismaCli = join(root, 'node_modules', '.bin', 'prisma')

function runPython(program: string) {
  return JSON.parse(execFileSync('python3', ['-c', program, databasePath], { encoding: 'utf8' })) as Record<string, unknown>
}

function migrate(schemaPath: string) {
  execFileSync(prismaCli, ['migrate', 'deploy', '--schema', schemaPath], { cwd: root, env: migrationEnv, stdio: 'pipe' })
}

try {
  mkdirSync(join(candidatePrisma, 'migrations'), { recursive: true })
  cpSync(join(root, 'prisma', 'schema.prisma'), join(candidatePrisma, 'schema.prisma'))
  cpSync(join(root, 'prisma', 'migrations', 'migration_lock.toml'), join(candidatePrisma, 'migrations', 'migration_lock.toml'))
  const oldMigrations = readdirSync(join(root, 'prisma', 'migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name < targetMigration).map((entry) => entry.name).sort()
  assert.ok(oldMigrations.length > 90, '必须使用完整的旧迁移历史，不能以简化表代替旧生产结构')
  for (const name of oldMigrations) cpSync(join(root, 'prisma', 'migrations', name), join(candidatePrisma, 'migrations', name), { recursive: true })
  migrate(join(candidatePrisma, 'schema.prisma'))
  const before = runPython(`
import json, sqlite3, sys
c=sqlite3.connect(sys.argv[1]);c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON')
assert not c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='Warehouse'").fetchone()
assert 'sourceType' not in [r[1] for r in c.execute('PRAGMA table_info(PackageDocument)')]
c.executescript('''
INSERT INTO Material(id,code,name,unit,stockUnit,valuationUnit) VALUES('m1','MIG-MAT','旧装箱产品','件','件','件');
INSERT INTO InventoryLocation(id,code,name,updatedAt) VALUES('loc1','MIG-LOC','旧库位',CURRENT_TIMESTAMP);
INSERT INTO Customer(id,code,name) VALUES('c1','MIG-CUS','旧客户');
INSERT INTO InventoryLot(id,lotNo,materialId,sourceType,sourceId,updatedAt) VALUES('lot1','LOT-MIG','m1','VERIFY','mig',CURRENT_TIMESTAMP);
INSERT INTO Stock(id,materialId,qty,availableQty,valuationQty,availableValuationQty,totalCost) VALUES('stock1','m1',30,30,30,30,300);
INSERT INTO StockLocationBalance(id,stockId,locationId,qty,availableQty,updatedAt) VALUES('balance1','stock1','loc1',30,30,CURRENT_TIMESTAMP);
''')
statuses=[('PENDING','PACKED'),('SHIPPED','SHIPPED'),('DELIVERED','DELIVERED'),('REVERSED','REVERSED'),('PENDING','ARCHIVED')]
for n,(shipment_status,box_status) in enumerate(statuses,1):
 s='s'+str(n);i='si'+str(n);p='p'+str(n);pi='pi'+str(n);q=n+1
 c.execute('INSERT INTO Shipment(id,shipmentNo,materialId,locationId,customerId,customer,qty,status,updatedAt) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)',(s,'SH-MIG-'+str(n),'m1','loc1','c1','旧客户',q,shipment_status))
 c.execute('INSERT INTO ShipmentItem(id,shipmentId,materialId,locationId,qty,unitSnapshot,updatedAt) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)',(i,s,'m1','loc1',q,'件'))
 c.execute('INSERT INTO PackageDocument(id,packageNo,shipmentId,status,packedBy,packedAt,grossWeight,netWeight,weightUnit,lengthMm,widthMm,heightMm,sealNo,note,deletedAt,deletedBy,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)',(p,'BX-MIG-'+str(n),s,box_status,'旧包装员','2026-10-01 08:00:00',3,2.5,'kg',400,300,250,'封签'+str(n),'历史备注','2026-10-02' if box_status=='ARCHIVED' else None,'旧归档员' if box_status=='ARCHIVED' else None))
 c.execute('INSERT INTO PackageDocumentItem(id,packageDocumentId,shipmentItemId,materialId,inventoryLotId,quantity,unitSnapshot,lotNoSnapshot,note) VALUES(?,?,?,?,?,?,?,?,?)',(pi,p,i,'m1','lot1' if n%2 else None,q,'件','LOT-MIG' if n%2 else None,'旧箱内备注'))
 c.execute('INSERT INTO DocumentAttachment(id,ownerType,ownerId,originalName,fileName,mimeType,size,url,storagePath,uploadedBy) VALUES(?,?,?,?,?,?,?,?,?,?)',('att'+str(n),'PACKAGE_DOCUMENT',p,'旧照片.jpg','old-'+str(n)+'.jpg','image/jpeg',123,'/uploads/old-'+str(n)+'.jpg','/local-test/old-'+str(n)+'.jpg','旧拍照员'))
 c.execute('INSERT INTO LabelPrintJob(id,jobNo,clientRequestId,templateType,referenceType,referenceId,printerModel,printerDpi,labelWidthMm,labelHeightMm,copies,payloadJson,requestedBy) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',('lp'+str(n),'LP-MIG-'+str(n),'REQ-MIG-'+str(n),'DOCUMENT_QR','PACKAGE_DOCUMENT',p,'Honeywell PC310T',203,105,70,n,json.dumps({'code':'BX-MIG-'+str(n),'quantity':q},ensure_ascii=False),'旧打印员'))
c.commit()
tables=['Material','InventoryLocation','Customer','InventoryLot','Stock','StockLocationBalance','Shipment','ShipmentItem','PackageDocument','PackageDocumentItem','DocumentAttachment','LabelPrintJob']
result={t:[dict(r) for r in c.execute('SELECT * FROM "'+t+'" ORDER BY id')] for t in tables}
assert not c.execute('PRAGMA foreign_key_check').fetchall()
print(json.dumps(result,ensure_ascii=False));c.close()
`)
  migrate(join(root, 'prisma', 'schema.prisma'))
  const after = runPython(`
import json, sqlite3, sys
c=sqlite3.connect(sys.argv[1]);c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON')
tables=['Material','InventoryLocation','Customer','InventoryLot','Stock','StockLocationBalance','Shipment','ShipmentItem','PackageDocument','PackageDocumentItem','DocumentAttachment','LabelPrintJob']
rows={t:[dict(r) for r in c.execute('SELECT * FROM "'+t+'" ORDER BY id')] for t in tables}
assert all(r['sourceType']=='SHIPMENT' and r['contentVersion']==1 and r['personnelSource']=='UNRECORDED' for r in rows['PackageDocument'])
assert c.execute('SELECT COUNT(*) FROM GoodsPlacement').fetchone()[0]==0
assert c.execute("SELECT COUNT(*) FROM PackageDocument WHERE sourceType='WAREHOUSE'").fetchone()[0]==0
assert all(r['labelRevisionId'] is None for r in rows['LabelPrintJob'])
assert c.execute('SELECT COUNT(*) FROM ShipmentPackageAllocation').fetchone()[0]==0
assert c.execute('SELECT COUNT(*) FROM ShipmentItemSource').fetchone()[0]==0
assert not c.execute('PRAGMA foreign_key_check').fetchall()
assert c.execute('PRAGMA quick_check').fetchone()[0]=='ok'
print(json.dumps(rows,ensure_ascii=False));c.close()
`)
  for (const [table, oldRows] of Object.entries(before)) {
    const legacy = oldRows as Record<string, unknown>[]
    const migrated = after[table] as Record<string, unknown>[]
    assert.equal(migrated.length, legacy.length, `${table} 不能在迁移中增删旧记录`)
    for (let index = 0; index < legacy.length; index += 1) {
      const kept = Object.fromEntries(Object.keys(legacy[index]).map((key) => [key, migrated[index][key]]))
      assert.deepEqual(kept, legacy[index], `${table} 的旧字段、关系、数量和证据必须逐值保留`)
    }
  }
  const constraints = runPython(`
import json, sqlite3, sys
c=sqlite3.connect(sys.argv[1]);c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON')
checks=[]
def rejected(sql,label):
 try:
  c.execute(sql)
 except sqlite3.IntegrityError:
  checks.append(label)
 else:
  raise AssertionError(label+' 应由数据库拒绝')
c.executescript('''
INSERT INTO PackageDocument(id,packageNo,sourceType,packedBy,updatedAt) VALUES('new-box','BX-NEW-MIG','WAREHOUSE','新包装员',CURRENT_TIMESTAMP);
INSERT INTO PackageDocumentItem(id,packageDocumentId,materialId,inventoryLotId,quantity,unitSnapshot) VALUES('new-box-item','new-box','m1','lot1',1,'件');
INSERT INTO GoodsPlacement(id,packageDocumentId,locationId,updatedAt) VALUES('placement','new-box','loc1',CURRENT_TIMESTAMP);
INSERT INTO PackageLabelRevision(id,packageDocumentId,contentVersion,templateVersion,payloadJson,createdBy) VALUES('label','new-box',1,'V1','{"code":"BX-NEW-MIG","quantity":1}','新包装员');
INSERT INTO ShipmentPackageAllocation(id,shipmentId,packageDocumentId,contentVersion,reservedBy) VALUES('claim1','s1','new-box',1,'操作员甲');
''')
rejected("INSERT INTO GoodsPlacement(id,packageDocumentId,locationId,updatedAt) VALUES('placement2','new-box','loc1',CURRENT_TIMESTAMP)",'唯一当前位置')
rejected("INSERT INTO GoodsPlacement(id,packageDocumentId,locationId,updatedAt) VALUES('invalid-placement','missing-box','loc1',CURRENT_TIMESTAMP)",'位置外键')
rejected("UPDATE PackageLabelRevision SET payloadJson='{}' WHERE id='label'",'标签内容不可覆盖')
rejected("DELETE FROM PackageLabelRevision WHERE id='label'",'标签历史不可删除')
rejected("UPDATE PackageDocumentItem SET quantity=999 WHERE id='new-box-item'",'装箱内容不可覆盖')
rejected("INSERT INTO PackageDocumentItem(id,packageDocumentId,materialId,quantity,unitSnapshot) VALUES('invalid-item','new-box','m1',1,'件')",'仓库箱必须真实批次')
rejected("INSERT INTO ShipmentPackageAllocation(id,shipmentId,packageDocumentId,contentVersion,reservedBy) VALUES('claim2','s2','new-box',1,'操作员乙')",'货箱有效占用唯一')
c.execute("UPDATE ShipmentPackageAllocation SET status='RELEASED' WHERE id='claim1'")
c.execute("INSERT INTO ShipmentPackageAllocation(id,shipmentId,packageDocumentId,contentVersion,reservedBy) VALUES('claim2','s2','new-box',1,'操作员乙')")
assert c.execute("SELECT COUNT(*) FROM ShipmentPackageAllocation WHERE packageDocumentId='new-box' AND status='RESERVED'").fetchone()[0]==1
assert c.execute("SELECT COUNT(*) FROM ShipmentPackageAllocation WHERE packageDocumentId='new-box'").fetchone()[0]==2
c.commit()
assert not c.execute('PRAGMA foreign_key_check').fetchall()
assert c.execute('PRAGMA quick_check').fetchone()[0]=='ok'
assert c.execute('SELECT qty FROM Stock WHERE id=?',('stock1',)).fetchone()[0]==30
print(json.dumps({'checks':checks,'foreignKeys':'ok','quickCheck':'ok'},ensure_ascii=False));c.close()
`)
  assert.equal((constraints.checks as string[]).length, 7)
  assert.equal(constraints.foreignKeys, 'ok')
  assert.equal(constraints.quickCheck, 'ok')
  console.log(`仓库装箱迁移验证通过：${oldMigrations.length} 个真实旧迁移后植入5种状态箱/发货/批次/照片/打印记录，完整部署新迁移逐字段保留；无伪造位置/来源，7项数据库约束、外键及quick_check通过。`)
} finally {
  rmSync(verificationRoot, { recursive: true, force: true })
}
