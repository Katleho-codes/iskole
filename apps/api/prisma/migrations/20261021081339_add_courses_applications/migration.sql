-- CreateTable
CREATE TABLE "institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "faculty" TEXT,
    "field" TEXT NOT NULL,
    "qualification" TEXT,
    "duration" TEXT,
    "apsMin" INTEGER NOT NULL DEFAULT 0,
    "tuitionMin" INTEGER,
    "tuitionMax" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courseRequirement" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "minMark" INTEGER NOT NULL DEFAULT 50,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "courseRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "idNumberEnc" TEXT,
    "idNumberIv" TEXT,
    "idNumberTag" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applicationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "applicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offerLetter" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offerLetter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "institution_name_key" ON "institution"("name");

-- CreateIndex
CREATE INDEX "course_field_idx" ON "course"("field");

-- CreateIndex
CREATE INDEX "course_institutionId_idx" ON "course"("institutionId");

-- CreateIndex
CREATE INDEX "courseRequirement_courseId_idx" ON "courseRequirement"("courseId");

-- CreateIndex
CREATE INDEX "application_userId_status_idx" ON "application"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "application_userId_courseId_key" ON "application"("userId", "courseId");

-- CreateIndex
CREATE INDEX "applicationEvent_applicationId_createdAt_idx" ON "applicationEvent"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "document_applicationId_idx" ON "document"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "offerLetter_applicationId_key" ON "offerLetter"("applicationId");

-- AddForeignKey
ALTER TABLE "course" ADD CONSTRAINT "course_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courseRequirement" ADD CONSTRAINT "courseRequirement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicationEvent" ADD CONSTRAINT "applicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offerLetter" ADD CONSTRAINT "offerLetter_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
