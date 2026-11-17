-- CreateEnum
CREATE TYPE "public"."TeamsMembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateTable
CREATE TABLE "public"."teams_team" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."teams_membership" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "public"."TeamsMembershipRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."teams_invite" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" "public"."TeamsMembershipRole" NOT NULL DEFAULT 'MEMBER',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."teams_event_type" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "length" INTEGER NOT NULL,
    "eventTypeId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_event_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."teams_host" (
    "id" SERIAL NOT NULL,
    "teamsEventTypeId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "scheduleEventTypeId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "teams_host_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teams_team_slug_key" ON "public"."teams_team"("slug");

-- CreateIndex
CREATE INDEX "teams_membership_userId_idx" ON "public"."teams_membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_membership_teamId_userId_key" ON "public"."teams_membership"("teamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_invite_token_key" ON "public"."teams_invite"("token");

-- CreateIndex
CREATE INDEX "teams_invite_teamId_idx" ON "public"."teams_invite"("teamId");

-- CreateIndex
CREATE INDEX "teams_invite_email_idx" ON "public"."teams_invite"("email");

-- CreateIndex
CREATE UNIQUE INDEX "teams_event_type_eventTypeId_key" ON "public"."teams_event_type"("eventTypeId");

-- CreateIndex
CREATE INDEX "teams_event_type_teamId_idx" ON "public"."teams_event_type"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_event_type_teamId_slug_key" ON "public"."teams_event_type"("teamId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "teams_host_scheduleEventTypeId_key" ON "public"."teams_host"("scheduleEventTypeId");

-- CreateIndex
CREATE INDEX "teams_host_userId_idx" ON "public"."teams_host"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_host_teamsEventTypeId_userId_key" ON "public"."teams_host"("teamsEventTypeId", "userId");

-- AddForeignKey
ALTER TABLE "public"."teams_membership" ADD CONSTRAINT "teams_membership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."teams_team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."teams_membership" ADD CONSTRAINT "teams_membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."teams_invite" ADD CONSTRAINT "teams_invite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."teams_team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."teams_event_type" ADD CONSTRAINT "teams_event_type_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."teams_team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."teams_event_type" ADD CONSTRAINT "teams_event_type_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "public"."EventType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."teams_host" ADD CONSTRAINT "teams_host_teamsEventTypeId_fkey" FOREIGN KEY ("teamsEventTypeId") REFERENCES "public"."teams_event_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."teams_host" ADD CONSTRAINT "teams_host_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."teams_host" ADD CONSTRAINT "teams_host_scheduleEventTypeId_fkey" FOREIGN KEY ("scheduleEventTypeId") REFERENCES "public"."EventType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

