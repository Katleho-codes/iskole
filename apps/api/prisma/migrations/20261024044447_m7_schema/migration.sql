-- AlterTable
ALTER TABLE "report" ADD COLUMN     "evidence" JSONB,
ADD COLUMN     "resolution" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedById" TEXT;

-- CreateTable
CREATE TABLE "userBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "userBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communityMute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "mutedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communityMute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation" (
    "id" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "directMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "directMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "userBlock_blockedId_idx" ON "userBlock"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "userBlock_blockerId_blockedId_key" ON "userBlock"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "communityMute_communityId_idx" ON "communityMute"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "communityMute_userId_communityId_key" ON "communityMute"("userId", "communityId");

-- CreateIndex
CREATE INDEX "conversation_recipientId_idx" ON "conversation"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_initiatorId_recipientId_key" ON "conversation"("initiatorId", "recipientId");

-- CreateIndex
CREATE INDEX "directMessage_conversationId_createdAt_idx" ON "directMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "userBlock" ADD CONSTRAINT "userBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userBlock" ADD CONSTRAINT "userBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communityMute" ADD CONSTRAINT "communityMute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communityMute" ADD CONSTRAINT "communityMute_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "directMessage" ADD CONSTRAINT "directMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "directMessage" ADD CONSTRAINT "directMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
