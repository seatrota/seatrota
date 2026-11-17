-- CreateTable
CREATE TABLE "public"."teams_subscription" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'incomplete',
    "seats" INTEGER NOT NULL DEFAULT 0,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "lastEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teams_subscription_teamId_key" ON "public"."teams_subscription"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_subscription_stripeSubscriptionId_key" ON "public"."teams_subscription"("stripeSubscriptionId");

-- AddForeignKey
ALTER TABLE "public"."teams_subscription" ADD CONSTRAINT "teams_subscription_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."teams_team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

