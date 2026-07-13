ALTER TABLE "ProductionOrder" ADD COLUMN "materialId" TEXT;

CREATE INDEX "ProductionOrder_materialId_idx" ON "ProductionOrder"("materialId");
