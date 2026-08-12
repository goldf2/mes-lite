-- 草稿可发布，已发布可作废；已发布/已作废版本不得回退为可编辑草稿。
CREATE TRIGGER "BOM_status_transition_guard"
BEFORE UPDATE OF "status" ON "BOM"
WHEN
  (OLD."status" = 'RELEASED' AND NEW."status" <> 'OBSOLETE')
  OR OLD."status" = 'OBSOLETE'
BEGIN
  SELECT RAISE(ABORT, 'BOM 状态不可回退，请创建新版本');
END;
