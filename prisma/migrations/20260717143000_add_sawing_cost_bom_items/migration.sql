PRAGMA foreign_keys=OFF;

CREATE TABLE "new_BOMItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bomId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL DEFAULT 'MATERIAL',
    "materialId" TEXT,
    "sawingScenarioId" TEXT,
    "quantity" REAL NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "wastageRate" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "BOMItem_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "BOM" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BOMItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BOMItem_sawingScenarioId_fkey" FOREIGN KEY ("sawingScenarioId") REFERENCES "SawingCostScenario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_BOMItem" ("id", "bomId", "itemType", "materialId", "quantity", "unit", "wastageRate")
SELECT "id", "bomId", 'MATERIAL', "materialId", "quantity", "unit", "wastageRate" FROM "BOMItem";

DROP TABLE "BOMItem";
ALTER TABLE "new_BOMItem" RENAME TO "BOMItem";

CREATE INDEX "BOMItem_sawingScenarioId_idx" ON "BOMItem"("sawingScenarioId");

PRAGMA foreign_keys=ON;
