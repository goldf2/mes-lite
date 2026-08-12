DROP TRIGGER "BOM_status_transition_guard";

CREATE TRIGGER "BOM_initial_status_guard"
BEFORE INSERT ON "BOM"
WHEN NEW."status" <> 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'BOM 必须从草稿开始');
END;

CREATE TRIGGER "BOM_status_transition_guard"
BEFORE UPDATE OF "status" ON "BOM"
WHEN
  (OLD."status" = 'DRAFT' AND NEW."status" NOT IN ('DRAFT', 'RELEASED'))
  OR (OLD."status" = 'RELEASED' AND NEW."status" NOT IN ('RELEASED', 'OBSOLETE'))
  OR (OLD."status" = 'OBSOLETE' AND NEW."status" <> 'OBSOLETE')
  OR NEW."status" NOT IN ('DRAFT', 'RELEASED', 'OBSOLETE')
BEGIN
  SELECT RAISE(ABORT, 'BOM 状态转换非法，请按草稿、已发布、已作废顺序执行');
END;
