ALTER TABLE "ProductionOrder" ADD COLUMN "groupNo" TEXT;
ALTER TABLE "ProductionOrder" ADD COLUMN "lineNo" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "ProductionOrder_groupNo_lineNo_idx" ON "ProductionOrder"("groupNo", "lineNo");
