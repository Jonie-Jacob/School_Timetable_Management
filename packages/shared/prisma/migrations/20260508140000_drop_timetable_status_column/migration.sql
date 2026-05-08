-- Drop the old status column and TimetableStatus enum
-- All status information is now stored in status_json (JSONB)

-- First drop the column
ALTER TABLE "timetables" DROP COLUMN IF EXISTS "status";

-- Then drop the enum type
DROP TYPE IF EXISTS "TimetableStatus";
