-- CreateEnum
CREATE TYPE "public"."TeamsSchedulingType" AS ENUM ('ROUND_ROBIN', 'COLLECTIVE');

-- CreateEnum
CREATE TYPE "public"."TeamsHostPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- AlterTable
ALTER TABLE "public"."teams_event_type" ADD COLUMN     "schedulingType" "public"."TeamsSchedulingType" NOT NULL DEFAULT 'ROUND_ROBIN';

-- AlterTable
ALTER TABLE "public"."teams_host" ADD COLUMN     "isFixed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priority" "public"."TeamsHostPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "weight" INTEGER NOT NULL DEFAULT 100;

-- CreateTable
CREATE TABLE "public"."teams_assignment" (
    "id" SERIAL NOT NULL,
    "teamsEventTypeId" INTEGER NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "bookingUid" TEXT NOT NULL,
    "assignedUserId" INTEGER NOT NULL,
    "hostUserIds" INTEGER[],
    "assignmentReason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "teams_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teams_assignment_teamsEventTypeId_idx" ON "public"."teams_assignment"("teamsEventTypeId");

-- CreateIndex
CREATE INDEX "teams_assignment_bookingId_idx" ON "public"."teams_assignment"("bookingId");

-- CreateIndex
CREATE INDEX "teams_assignment_bookingUid_idx" ON "public"."teams_assignment"("bookingUid");

-- CreateIndex
CREATE INDEX "teams_assignment_assignedUserId_idx" ON "public"."teams_assignment"("assignedUserId");

-- AddForeignKey
ALTER TABLE "public"."teams_assignment" ADD CONSTRAINT "teams_assignment_teamsEventTypeId_fkey" FOREIGN KEY ("teamsEventTypeId") REFERENCES "public"."teams_event_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."teams_assignment" ADD CONSTRAINT "teams_assignment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."teams_assignment" ADD CONSTRAINT "teams_assignment_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
