-- 已发布或已作废 BOM 版本的内容不可原地变更；生命周期和默认版本标记仍允许更新。
CREATE TRIGGER "BOM_immutable_version_update"
BEFORE UPDATE OF "productId", "name", "purpose", "version", "outputQuantity", "outputUnit", "basedOnBomId", "changeReason" ON "BOM"
WHEN OLD."status" IN ('RELEASED', 'OBSOLETE')
BEGIN
  SELECT RAISE(ABORT, '已发布或已作废 BOM 不可修改，请创建新版本');
END;

CREATE TRIGGER "BOMItem_immutable_insert"
BEFORE INSERT ON "BOMItem"
WHEN (SELECT "status" FROM "BOM" WHERE "id" = NEW."bomId") <> 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, '已发布或已作废 BOM 明细不可修改');
END;

CREATE TRIGGER "BOMItem_immutable_update"
BEFORE UPDATE ON "BOMItem"
WHEN (SELECT "status" FROM "BOM" WHERE "id" = OLD."bomId") <> 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, '已发布或已作废 BOM 明细不可修改');
END;

CREATE TRIGGER "BOMItem_immutable_delete"
BEFORE DELETE ON "BOMItem"
WHEN (SELECT "status" FROM "BOM" WHERE "id" = OLD."bomId") <> 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, '已发布或已作废 BOM 明细不可修改');
END;

CREATE TRIGGER "BOMOutput_immutable_insert"
BEFORE INSERT ON "BOMOutput"
WHEN (SELECT "status" FROM "BOM" WHERE "id" = NEW."bomId") <> 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, '已发布或已作废 BOM 产出不可修改');
END;

CREATE TRIGGER "BOMOutput_immutable_update"
BEFORE UPDATE ON "BOMOutput"
WHEN (SELECT "status" FROM "BOM" WHERE "id" = OLD."bomId") <> 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, '已发布或已作废 BOM 产出不可修改');
END;

CREATE TRIGGER "BOMOutput_immutable_delete"
BEFORE DELETE ON "BOMOutput"
WHEN (SELECT "status" FROM "BOM" WHERE "id" = OLD."bomId") <> 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, '已发布或已作废 BOM 产出不可修改');
END;
