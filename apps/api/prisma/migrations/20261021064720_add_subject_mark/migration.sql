-- CreateTable
CREATE TABLE "subjectMark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "mark" INTEGER NOT NULL,
    "isHomeLanguage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjectMark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subjectMark_userId_idx" ON "subjectMark"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "subjectMark_userId_subject_key" ON "subjectMark"("userId", "subject");

-- AddForeignKey
ALTER TABLE "subjectMark" ADD CONSTRAINT "subjectMark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
