ALTER TABLE "SawingCostScenario" ADD COLUMN "productKind" TEXT NOT NULL DEFAULT 'TEMPORARY';
ALTER TABLE "SawingCostScenario" ADD COLUMN "productId" TEXT;
ALTER TABLE "SawingCostScenario" ADD COLUMN "laborHoursPerPiece" REAL NOT NULL DEFAULT 0;
ALTER TABLE "SawingCostScenario" ADD COLUMN "machineHoursPerPiece" REAL NOT NULL DEFAULT 0;

CREATE INDEX "SawingCostScenario_productId_idx" ON "SawingCostScenario"("productId");

-- SQLite cannot add foreign keys with a simple ALTER TABLE in all cases.
-- The relation is declared in Prisma schema; existing deployments should use Prisma migration flow to rebuild if strict FK enforcement is required.
