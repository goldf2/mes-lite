-- CreateTable
CREATE TABLE "DocumentAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL DEFAULT 'ORIGINAL',
    "originalName" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "note" TEXT,
    "uploadedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "DocumentAttachment_ownerType_ownerId_idx" ON "DocumentAttachment"("ownerType", "ownerId");
