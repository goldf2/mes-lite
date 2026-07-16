ALTER TABLE "SawingCostScenario" ADD COLUMN "additionalDirectCost" REAL NOT NULL DEFAULT 0;
ALTER TABLE "SawingCostScenario" ADD COLUMN "laborCost" REAL NOT NULL DEFAULT 0;
ALTER TABLE "SawingCostScenario" ADD COLUMN "fixedCost" REAL NOT NULL DEFAULT 0;
ALTER TABLE "SawingCostScenario" ADD COLUMN "directStageCost" REAL NOT NULL DEFAULT 0;
ALTER TABLE "SawingCostScenario" ADD COLUMN "manufacturingCost" REAL NOT NULL DEFAULT 0;
ALTER TABLE "SawingCostScenario" ADD COLUMN "fullCost" REAL NOT NULL DEFAULT 0;
ALTER TABLE "SawingCostScenario" ADD COLUMN "directProfit" REAL NOT NULL DEFAULT 0;
ALTER TABLE "SawingCostScenario" ADD COLUMN "manufacturingProfit" REAL NOT NULL DEFAULT 0;
ALTER TABLE "SawingCostScenario" ADD COLUMN "fullProfit" REAL NOT NULL DEFAULT 0;
ALTER TABLE "SawingCostScenario" ADD COLUMN "directMargin" REAL NOT NULL DEFAULT 0;
ALTER TABLE "SawingCostScenario" ADD COLUMN "manufacturingMargin" REAL NOT NULL DEFAULT 0;
ALTER TABLE "SawingCostScenario" ADD COLUMN "fullMargin" REAL NOT NULL DEFAULT 0;

CREATE TABLE "ProductionCostItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "inputA" REAL NOT NULL DEFAULT 0,
    "inputB" REAL NOT NULL DEFAULT 0,
    "inputC" REAL NOT NULL DEFAULT 0,
    "amount" REAL NOT NULL,
    "isDeduction" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionCostItem_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "SawingCostScenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ProductionCostItem_scenarioId_stage_idx" ON "ProductionCostItem"("scenarioId", "stage");
