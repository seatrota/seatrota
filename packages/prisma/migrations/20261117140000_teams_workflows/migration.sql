-- CreateEnum
CREATE TYPE "public"."TeamsReminderTiming" AS ENUM ('BEFORE_START', 'AFTER_END');

-- CreateEnum
CREATE TYPE "public"."TeamsReminderRecipient" AS ENUM ('ATTENDEE', 'HOSTS');

-- CreateEnum
CREATE TYPE "public"."TeamsReminderStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "public"."teams_workflow" (
    "id" SERIAL NOT NULL,
    "teamsEventTypeId" INTEGER NOT NULL,
    "timing" "public"."TeamsReminderTiming" NOT NULL,
    "offsetMinutes" INTEGER NOT NULL,
    "recipient" "public"."TeamsReminderRecipient" NOT NULL DEFAULT 'ATTENDEE',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."teams_reminder" (
    "id" SERIAL NOT NULL,
    "workflowId" INTEGER NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "bookingUid" TEXT NOT NULL,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "status" "public"."TeamsReminderStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teams_workflow_teamsEventTypeId_idx" ON "public"."teams_workflow"("teamsEventTypeId");

-- CreateIndex
CREATE INDEX "teams_reminder_status_sendAt_idx" ON "public"."teams_reminder"("status", "sendAt");

-- CreateIndex
CREATE INDEX "teams_reminder_bookingId_idx" ON "public"."teams_reminder"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_reminder_workflowId_bookingId_key" ON "public"."teams_reminder"("workflowId", "bookingId");

-- AddForeignKey
ALTER TABLE "public"."teams_workflow" ADD CONSTRAINT "teams_workflow_teamsEventTypeId_fkey" FOREIGN KEY ("teamsEventTypeId") REFERENCES "public"."teams_event_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."teams_reminder" ADD CONSTRAINT "teams_reminder_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "public"."teams_workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
