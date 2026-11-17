-- CreateTable
CREATE TABLE "public"."teams_sso_connection" (
    "id" SERIAL NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "teamId" INTEGER,
    "discoveryUrl" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretCiphertext" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT 'openid email profile',
    "enforceSso" BOOLEAN NOT NULL DEFAULT false,
    "groupClaim" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_sso_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."teams_sso_domain" (
    "id" SERIAL NOT NULL,
    "connectionId" INTEGER NOT NULL,
    "domain" TEXT NOT NULL,
    "teamId" INTEGER NOT NULL,
    "verificationToken" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_sso_domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."teams_sso_role_map" (
    "id" SERIAL NOT NULL,
    "connectionId" INTEGER NOT NULL,
    "groupName" TEXT NOT NULL,
    "role" "public"."TeamsMembershipRole" NOT NULL,

    CONSTRAINT "teams_sso_role_map_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teams_sso_connection_scopeKey_key" ON "public"."teams_sso_connection"("scopeKey");

-- CreateIndex
CREATE INDEX "teams_sso_connection_teamId_idx" ON "public"."teams_sso_connection"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_sso_domain_domain_key" ON "public"."teams_sso_domain"("domain");

-- CreateIndex
CREATE INDEX "teams_sso_domain_connectionId_idx" ON "public"."teams_sso_domain"("connectionId");

-- CreateIndex
CREATE INDEX "teams_sso_domain_teamId_idx" ON "public"."teams_sso_domain"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_sso_role_map_connectionId_groupName_key" ON "public"."teams_sso_role_map"("connectionId", "groupName");

-- AddForeignKey
ALTER TABLE "public"."teams_sso_connection" ADD CONSTRAINT "teams_sso_connection_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."teams_team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."teams_sso_domain" ADD CONSTRAINT "teams_sso_domain_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "public"."teams_sso_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."teams_sso_domain" ADD CONSTRAINT "teams_sso_domain_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."teams_team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."teams_sso_role_map" ADD CONSTRAINT "teams_sso_role_map_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "public"."teams_sso_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
