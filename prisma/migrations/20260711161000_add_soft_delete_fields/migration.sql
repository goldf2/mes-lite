ALTER TABLE "Material" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Material" ADD COLUMN "deletedBy" TEXT;

ALTER TABLE "Supplier" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Supplier" ADD COLUMN "deletedBy" TEXT;

ALTER TABLE "DocumentAttachment" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "DocumentAttachment" ADD COLUMN "deletedBy" TEXT;

