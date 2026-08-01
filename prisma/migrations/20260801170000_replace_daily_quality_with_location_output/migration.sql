-- Production output disposition is represented by the selected inventory location.
-- Confirmed/reversed legacy reports keep the quantity that was actually posted to stock.
-- Draft reports have never posted inventory, so their former three quantities can be merged.
ALTER TABLE "DailyProductionReport" ADD COLUMN "outputQty" REAL NOT NULL DEFAULT 0;

UPDATE "DailyProductionReport"
SET "outputQty" = CASE
  WHEN "status" = 'DRAFT' THEN "goodQty" + "badQty" + "scrapQty"
  ELSE "goodQty"
END;

ALTER TABLE "DailyProductionReport" DROP COLUMN "goodQty";
ALTER TABLE "DailyProductionReport" DROP COLUMN "badQty";
ALTER TABLE "DailyProductionReport" DROP COLUMN "scrapQty";
