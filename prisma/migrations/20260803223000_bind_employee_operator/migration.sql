-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "operatorId" TEXT REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "Employee_operatorId_key" ON "Employee"("operatorId");
