CREATE TABLE "ProcessTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "defaultTime" INTEGER,
    "workstation" TEXT,
    "description" TEXT,
    "isPreset" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ProcessTemplate_code_key" ON "ProcessTemplate"("code");

CREATE TABLE "_MaterialToProcessTemplate" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_MaterialToProcessTemplate_A_fkey" FOREIGN KEY ("A") REFERENCES "Material" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_MaterialToProcessTemplate_B_fkey" FOREIGN KEY ("B") REFERENCES "ProcessTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "_MaterialToProcessTemplate_AB_unique" ON "_MaterialToProcessTemplate"("A", "B");
CREATE INDEX "_MaterialToProcessTemplate_B_index" ON "_MaterialToProcessTemplate"("B");

INSERT INTO "ProcessTemplate" ("id", "code", "name", "category", "defaultTime", "workstation", "description", "isPreset", "updatedAt") VALUES
('preset_process_sawing', 'PROC-SAWING', '锯切', 'SAWING', 10, '下料区', '按图纸长度下料，复核尺寸并去除明显毛刺。', true, CURRENT_TIMESTAMP),
('preset_process_drilling', 'PROC-DRILLING', '钻孔', 'DRILLING', 15, '钻孔区', '按孔位、孔径和深度要求加工，完成后去毛刺。', true, CURRENT_TIMESTAMP),
('preset_process_turning', 'PROC-TURNING', '车削', 'TURNING', 20, '车床区', '按图纸要求完成外圆、内孔或端面加工。', true, CURRENT_TIMESTAMP),
('preset_process_milling', 'PROC-MILLING', '铣削', 'MILLING', 25, '铣床区', '按基准完成平面、槽或轮廓加工。', true, CURRENT_TIMESTAMP),
('preset_process_grinding', 'PROC-GRINDING', '磨削', 'GRINDING', 20, '磨床区', '按精度和粗糙度要求完成精加工。', true, CURRENT_TIMESTAMP),
('preset_process_inspection', 'PROC-INSPECTION', '工序检验', 'INSPECTION', 8, '质检区', '核对关键尺寸、外观和数量，记录检验结果。', true, CURRENT_TIMESTAMP);
