CREATE TABLE "SawingCostScenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "materialLength" REAL NOT NULL,
    "materialWeight" REAL NOT NULL,
    "workpieceLength" REAL NOT NULL,
    "bladeThickness" REAL NOT NULL,
    "rawMaterialPrice" REAL NOT NULL,
    "sawdustPrice" REAL NOT NULL,
    "scrapPrice" REAL NOT NULL,
    "finishedPrice" REAL NOT NULL,
    "quantity" INTEGER NOT NULL,
    "utilization" REAL NOT NULL,
    "productWeight" REAL NOT NULL,
    "sawdustWeight" REAL NOT NULL,
    "scrapWeight" REAL NOT NULL,
    "netMaterialCost" REAL NOT NULL,
    "materialCostPerPiece" REAL NOT NULL,
    "profitPerPiece" REAL NOT NULL,
    "totalRevenue" REAL NOT NULL,
    "totalProfit" REAL NOT NULL,
    "grossMargin" REAL NOT NULL,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "_ProcessTemplateToSawingCostScenario" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ProcessTemplateToSawingCostScenario_A_fkey" FOREIGN KEY ("A") REFERENCES "ProcessTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ProcessTemplateToSawingCostScenario_B_fkey" FOREIGN KEY ("B") REFERENCES "SawingCostScenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "_ProcessTemplateToSawingCostScenario_AB_unique" ON "_ProcessTemplateToSawingCostScenario"("A", "B");
CREATE INDEX "_ProcessTemplateToSawingCostScenario_B_index" ON "_ProcessTemplateToSawingCostScenario"("B");
