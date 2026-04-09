-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'SCHOOL_ADMIN', 'VIEWER');

-- CreateTable
CREATE TABLE "school_users" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "school_id" TEXT,
    "role" "UserRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_users_email_idx" ON "school_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "school_users_email_school_id_key" ON "school_users"("email", "school_id");

-- AddForeignKey
ALTER TABLE "school_users" ADD CONSTRAINT "school_users_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: create SCHOOL_ADMIN entries from existing schools
INSERT INTO "school_users" ("id", "email", "school_id", "role", "created_at")
SELECT gen_random_uuid(), "admin_email", "id", 'SCHOOL_ADMIN', NOW()
FROM "schools";
