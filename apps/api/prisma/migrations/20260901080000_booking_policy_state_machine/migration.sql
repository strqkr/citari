ALTER TABLE "services"
  ADD COLUMN "minimumLeadMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "maximumAdvanceDays" INTEGER NOT NULL DEFAULT 365,
  ADD COLUMN "cancellationNoticeMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rescheduleNoticeMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
  ADD CONSTRAINT "services_booking_policy_valid" CHECK (
    "minimumLeadMinutes" BETWEEN 0 AND 43200
    AND "maximumAdvanceDays" BETWEEN 1 AND 730
    AND "cancellationNoticeMinutes" BETWEEN 0 AND 43200
    AND "rescheduleNoticeMinutes" BETWEEN 0 AND 43200
    AND "slotIntervalMinutes" IN (5, 10, 15, 20, 30, 60)
  );

ALTER TABLE "bookings"
  ADD COLUMN "serviceMinimumLeadMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "serviceMaximumAdvanceDays" INTEGER NOT NULL DEFAULT 365,
  ADD COLUMN "cancellationNoticeMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rescheduleNoticeMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 15;

ALTER TABLE "slot_holds"
  ADD COLUMN "serviceMinimumLeadMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "serviceMaximumAdvanceDays" INTEGER NOT NULL DEFAULT 365,
  ADD COLUMN "cancellationNoticeMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rescheduleNoticeMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 15;

UPDATE "slot_holds" AS hold
SET
  "serviceMinimumLeadMinutes" = service."minimumLeadMinutes",
  "serviceMaximumAdvanceDays" = service."maximumAdvanceDays",
  "cancellationNoticeMinutes" = service."cancellationNoticeMinutes",
  "rescheduleNoticeMinutes" = service."rescheduleNoticeMinutes",
  "slotIntervalMinutes" = service."slotIntervalMinutes"
FROM "services" AS service
WHERE hold."tenantId" = service."tenantId" AND hold."serviceId" = service."id";

ALTER TABLE "slot_holds"
  ADD CONSTRAINT "slot_holds_policy_snapshot_valid" CHECK (
    "serviceMinimumLeadMinutes" BETWEEN 0 AND 43200
    AND "serviceMaximumAdvanceDays" BETWEEN 1 AND 730
    AND "cancellationNoticeMinutes" BETWEEN 0 AND 43200
    AND "rescheduleNoticeMinutes" BETWEEN 0 AND 43200
    AND "slotIntervalMinutes" IN (5, 10, 15, 20, 30, 60)
  );

UPDATE "bookings" AS booking
SET
  "serviceMinimumLeadMinutes" = service."minimumLeadMinutes",
  "serviceMaximumAdvanceDays" = service."maximumAdvanceDays",
  "cancellationNoticeMinutes" = service."cancellationNoticeMinutes",
  "rescheduleNoticeMinutes" = service."rescheduleNoticeMinutes",
  "slotIntervalMinutes" = service."slotIntervalMinutes"
FROM "services" AS service
WHERE booking."tenantId" = service."tenantId" AND booking."serviceId" = service."id";

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_policy_snapshot_valid" CHECK (
    "serviceMinimumLeadMinutes" BETWEEN 0 AND 43200
    AND "serviceMaximumAdvanceDays" BETWEEN 1 AND 730
    AND "cancellationNoticeMinutes" BETWEEN 0 AND 43200
    AND "rescheduleNoticeMinutes" BETWEEN 0 AND 43200
    AND "slotIntervalMinutes" IN (5, 10, 15, 20, 30, 60)
  );

CREATE FUNCTION enforce_booking_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD."status" = 'HELD' AND NEW."status" IN ('PENDING', 'CONFIRMED', 'CANCELLED'))
    OR (OLD."status" = 'PENDING' AND NEW."status" IN ('CONFIRMED', 'CANCELLED'))
    OR (OLD."status" = 'CONFIRMED' AND NEW."status" IN ('CANCELLED', 'COMPLETED', 'NO_SHOW'))
  ) THEN
    RAISE EXCEPTION 'Illegal booking status transition from % to %', OLD."status", NEW."status"
      USING ERRCODE = '23514', CONSTRAINT = 'bookings_status_transition_valid';
  END IF;

  IF NEW."status" = 'COMPLETED' AND NEW."endAt" > clock_timestamp() THEN
    RAISE EXCEPTION 'Booking cannot be completed before its scheduled end'
      USING ERRCODE = '23514', CONSTRAINT = 'bookings_completion_time_valid';
  END IF;

  IF NEW."status" = 'NO_SHOW' AND NEW."startAt" > clock_timestamp() THEN
    RAISE EXCEPTION 'Booking cannot be marked no-show before its scheduled start'
      USING ERRCODE = '23514', CONSTRAINT = 'bookings_no_show_time_valid';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_status_transition_guard
BEFORE UPDATE OF "status" ON "bookings"
FOR EACH ROW
EXECUTE FUNCTION enforce_booking_status_transition();
