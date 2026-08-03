PRAGMA foreign_keys=OFF;

CREATE TABLE "new_BOMItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bomId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL DEFAULT 'MATERIAL',
    "materialId" TEXT,
    "outputMaterialId" TEXT,
    "costObjectId" TEXT,
    "sawingScenarioId" TEXT,
    "quantity" REAL NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "wastageRate" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "BOMItem_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "BOM" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BOMItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BOMItem_outputMaterialId_fkey" FOREIGN KEY ("outputMaterialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BOMItem_costObjectId_fkey" FOREIGN KEY ("costObjectId") REFERENCES "CostObject" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BOMItem_sawingScenarioId_fkey" FOREIGN KEY ("sawingScenarioId") REFERENCES "SawingCostScenario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_BOMItem" (
    "id", "bomId", "itemType", "materialId", "outputMaterialId", "costObjectId",
    "sawingScenarioId", "quantity", "unit", "wastageRate"
)
SELECT
    item."id", item."bomId", item."itemType", item."materialId",
    CASE WHEN item."itemType" = 'MATERIAL' THEN (
        SELECT output."materialId"
        FROM "BOMOutput" output
        WHERE output."bomId" = item."bomId" AND output."isPrimary" = 1
        LIMIT 1
    ) ELSE NULL END,
    item."costObjectId", item."sawingScenarioId", item."quantity", item."unit", item."wastageRate"
FROM "BOMItem" item;

DROP TABLE "BOMItem";
ALTER TABLE "new_BOMItem" RENAME TO "BOMItem";

CREATE INDEX "BOMItem_costObjectId_idx" ON "BOMItem"("costObjectId");
CREATE INDEX "BOMItem_sawingScenarioId_idx" ON "BOMItem"("sawingScenarioId");
CREATE INDEX "BOMItem_outputMaterialId_idx" ON "BOMItem"("outputMaterialId");
CREATE UNIQUE INDEX "BOMItem_bomId_materialId_outputMaterialId_key" ON "BOMItem"("bomId", "materialId", "outputMaterialId");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
