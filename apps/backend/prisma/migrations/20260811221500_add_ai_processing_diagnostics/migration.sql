CREATE TYPE "AiProcessingAttemptStatus" AS ENUM ('ACTIVE', 'SUCCESS', 'FAILED', 'INTERRUPTED');
CREATE TYPE "AiProcessingAttemptKind" AS ENUM ('INITIAL', 'REPAIR');

CREATE TABLE "AiProcessingAttempt" (
    "id" UUID NOT NULL,
    "processingJobId" UUID NOT NULL,
    "providerId" UUID,
    "status" "AiProcessingAttemptStatus" NOT NULL DEFAULT 'ACTIVE',
    "attemptKind" "AiProcessingAttemptKind" NOT NULL,
    "promptKey" VARCHAR(64) NOT NULL,
    "sequenceIndex" INTEGER NOT NULL,
    "model" VARCHAR(200) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "httpStatus" INTEGER,
    "requestMetadata" JSONB NOT NULL,
    "responseMetadata" JSONB,
    "errorCode" VARCHAR(64),
    "errorMessage" TEXT,
    "rawResponse" TEXT,
    "rawResponseTruncated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProcessingAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiProcessingAttempt_processingJobId_startedAt_id_idx" ON "AiProcessingAttempt"("processingJobId", "startedAt", "id");
CREATE INDEX "AiProcessingAttempt_providerId_createdAt_idx" ON "AiProcessingAttempt"("providerId", "createdAt" DESC);
CREATE INDEX "AiProcessingAttempt_status_createdAt_idx" ON "AiProcessingAttempt"("status", "createdAt" DESC);
CREATE INDEX "AiProcessingAttempt_errorCode_createdAt_idx" ON "AiProcessingAttempt"("errorCode", "createdAt" DESC);
CREATE INDEX "AiProcessingAttempt_createdAt_idx" ON "AiProcessingAttempt"("createdAt" DESC);

ALTER TABLE "AiProcessingAttempt" ADD CONSTRAINT "AiProcessingAttempt_processingJobId_fkey" FOREIGN KEY ("processingJobId") REFERENCES "ProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiProcessingAttempt" ADD CONSTRAINT "AiProcessingAttempt_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AiProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
