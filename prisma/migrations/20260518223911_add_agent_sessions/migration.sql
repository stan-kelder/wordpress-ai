-- CreateTable
CREATE TABLE "AgentSession" (
    "opencodeSessionId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("opencodeSessionId")
);

-- CreateIndex
CREATE INDEX "AgentSession_siteId_idx" ON "AgentSession"("siteId");

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
