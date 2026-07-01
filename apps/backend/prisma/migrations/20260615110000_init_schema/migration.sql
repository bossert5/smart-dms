-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('SCANNER', 'UPLOAD', 'EMAIL');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('NEW', 'INGESTING', 'OCR_PENDING', 'OCR_RUNNING', 'READY', 'AI_PENDING', 'AI_RUNNING', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentAttributeValueType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "FileArtifactType" AS ENUM ('ORIGINAL', 'NORMALIZED_IMAGE', 'FINAL_PDF', 'THUMBNAIL', 'ERROR_ARTIFACT', 'DOCLING_DEBUG_JSON');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('Admin', 'User');

-- CreateEnum
CREATE TYPE "ProcessingJobType" AS ENUM ('INGEST_DOCUMENT', 'OCR_DOCUMENT', 'CREATE_THUMBNAIL', 'EXTRACT_AI_METADATA');

-- CreateEnum
CREATE TYPE "ProcessingJobStatus" AS ENUM ('WAITING', 'ACTIVE', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiProviderType" AS ENUM ('OPENAI_COMPATIBLE');

-- CreateEnum
CREATE TYPE "AiProviderStatus" AS ENUM ('UNKNOWN', 'AVAILABLE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "CalendarEventKind" AS ENUM ('DUE_DATE', 'DEADLINE', 'APPOINTMENT');

-- CreateEnum
CREATE TYPE "DocumentEntrySource" AS ENUM ('AI_EXTRACTED', 'MANUAL');

-- CreateEnum
CREATE TYPE "DocumentPaymentStatus" AS ENUM ('OPEN', 'PAID', 'IGNORED');

-- CreateEnum
CREATE TYPE "DocumentHistoryEventType" AS ENUM ('SCANNER_DOCUMENT_DETECTED', 'DOCUMENT_UPLOADED', 'EMAIL_ATTACHMENT_IMPORTED', 'DOCUMENT_PROCESSING_QUEUED', 'DOCUMENT_REPROCESS_REQUESTED', 'OCR_PROCESSING_STARTED', 'OCR_PROCESSING_COMPLETED', 'DOCUMENT_PROCESSING_FAILED', 'AI_METADATA_EXTRACTED', 'DOCUMENT_METADATA_UPDATED', 'DOCUMENT_TAGS_UPDATED', 'DOCUMENT_ACCEPTED', 'DOCUMENT_MOVED_TO_INBOX', 'DOCUMENT_ARCHIVED');

-- CreateEnum
CREATE TYPE "EmailImportMode" AS ENUM ('DISABLED', 'OCR_ONLY', 'OCR_AND_AI');

-- CreateEnum
CREATE TYPE "EditLockScope" AS ENUM ('INBOX', 'DOCUMENT');

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "title" TEXT,
    "titleSource" "DocumentEntrySource" NOT NULL DEFAULT 'AI_EXTRACTED',
    "documentTypeId" UUID,
    "documentTypeSource" "DocumentEntrySource" NOT NULL DEFAULT 'AI_EXTRACTED',
    "originalFileName" TEXT NOT NULL,
    "source" "DocumentSource" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" UUID,
    "aiProcessedAt" TIMESTAMP(3),
    "pdfPath" TEXT,
    "thumbnailPath" TEXT,
    "documentDate" TIMESTAMP(3),
    "documentDateSource" "DocumentEntrySource" NOT NULL DEFAULT 'AI_EXTRACTED',
    "ocrLanguage" TEXT,
    "summary" TEXT,
    "sender" TEXT,
    "senderSource" "DocumentEntrySource" NOT NULL DEFAULT 'AI_EXTRACTED',
    "recipient" TEXT,
    "note" TEXT,
    "ocrText" TEXT,
    "extractedMarkdown" TEXT,
    "fileSize" INTEGER,
    "pageCount" INTEGER,
    "checksum" TEXT,
    "autoAiAfterOcr" BOOLEAN NOT NULL DEFAULT true,
    "aiDeferredByEditLock" BOOLEAN NOT NULL DEFAULT false,
    "failedReason" TEXT,
    "titleSearchVector" tsvector,
    "contentSearchVector" tsvector,
    "senderSearchVector" tsvector,
    "tagSearchVector" tsvector,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scannerImportPath" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentType" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentPayment" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "iban" TEXT,
    "recipient" TEXT,
    "purpose" TEXT,
    "amount" DECIMAL(14,2),
    "currency" TEXT DEFAULT 'EUR',
    "status" "DocumentPaymentStatus" NOT NULL DEFAULT 'OPEN',
    "paidAt" TIMESTAMP(3),
    "paidById" UUID,
    "assignedToId" UUID,
    "assignedAt" TIMESTAMP(3),
    "source" "DocumentEntrySource" NOT NULL DEFAULT 'AI_EXTRACTED',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentReference" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "source" "DocumentEntrySource" NOT NULL DEFAULT 'AI_EXTRACTED',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentCalendarEvent" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "paymentId" UUID,
    "kind" "CalendarEventKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" DATE NOT NULL,
    "time" TEXT,
    "endDate" DATE,
    "endTime" TEXT,
    "source" "DocumentEntrySource" NOT NULL DEFAULT 'AI_EXTRACTED',
    "sourceText" TEXT,
    "assignedToId" UUID,
    "assignedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentHistoryEvent" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "actorUserId" UUID,
    "type" "DocumentHistoryEventType" NOT NULL,
    "summary" TEXT NOT NULL,
    "changes" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentHistoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileArtifact" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "artifactType" "FileArtifactType" NOT NULL,
    "path" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTag" (
    "documentId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "source" "DocumentEntrySource" NOT NULL DEFAULT 'AI_EXTRACTED',

    CONSTRAINT "DocumentTag_pkey" PRIMARY KEY ("documentId","tagId")
);

-- CreateTable
CREATE TABLE "DocumentAttribute" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "fieldDefinitionId" UUID,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueType" "DocumentAttributeValueType" NOT NULL,
    "source" "DocumentEntrySource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentFieldDefinition" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "valueType" "DocumentAttributeValueType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "appliesToAllDocumentTypes" BOOLEAN NOT NULL DEFAULT true,
    "includeInFullTextSearch" BOOLEAN NOT NULL DEFAULT false,
    "includeInAiExtraction" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentFieldDefinitionScope" (
    "fieldDefinitionId" UUID NOT NULL,
    "documentTypeId" UUID NOT NULL,

    CONSTRAINT "DocumentFieldDefinitionScope_pkey" PRIMARY KEY ("fieldDefinitionId","documentTypeId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "passwordChangeRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTenantMembership" (
    "userId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTenantMembership_pkey" PRIMARY KEY ("userId","tenantId")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedByTokenId" UUID,
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id" UUID NOT NULL,
    "bullJobId" TEXT,
    "jobType" "ProcessingJobType" NOT NULL,
    "documentId" UUID,
    "status" "ProcessingJobStatus" NOT NULL DEFAULT 'WAITING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "assignedAiProviderId" UUID,
    "payload" JSONB,
    "result" JSONB,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AiProvider" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AiProviderType" NOT NULL DEFAULT 'OPENAI_COMPATIBLE',
    "baseUrl" TEXT NOT NULL,
    "encryptedApiKey" TEXT,
    "selectedModel" TEXT,
    "priority" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" "AiProviderStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "availableModels" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMetadataPrompt" (
    "key" VARCHAR(64) NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "defaultPromptText" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiMetadataPrompt_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditLock" (
    "id" UUID NOT NULL,
    "scope" "EditLockScope" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "ownerDisplayName" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "socketId" TEXT NOT NULL,
    "tenantIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMailbox" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 993,
    "username" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "tls" BOOLEAN NOT NULL DEFAULT true,
    "importMode" "EmailImportMode" NOT NULL DEFAULT 'OCR_ONLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailFolderSelection" (
    "id" UUID NOT NULL,
    "mailboxId" UUID NOT NULL,
    "folderPath" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "uidValidity" BIGINT NOT NULL DEFAULT 0,
    "highestSeenUid" BIGINT NOT NULL DEFAULT 0,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailFolderSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSenderRule" (
    "id" UUID NOT NULL,
    "mailboxId" UUID NOT NULL,
    "pattern" TEXT NOT NULL,
    "normalizedPattern" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSenderRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" UUID NOT NULL,
    "mailboxId" UUID NOT NULL,
    "folderPath" TEXT NOT NULL,
    "uid" BIGINT NOT NULL,
    "uidValidity" BIGINT NOT NULL DEFAULT 0,
    "messageId" TEXT,
    "subject" TEXT,
    "fromAddress" TEXT,
    "fromName" TEXT,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "textPreview" TEXT,
    "bodyText" TEXT,
    "processedAt" TIMESTAMP(3),
    "skippedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAttachment" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT,
    "storagePath" TEXT,
    "documentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_tenantId_idx" ON "Document"("tenantId");

-- CreateIndex
CREATE INDEX "Document_documentTypeId_idx" ON "Document"("documentTypeId");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "Document_source_idx" ON "Document"("source");

-- CreateIndex
CREATE INDEX "Document_createdAt_idx" ON "Document"("createdAt");

-- CreateIndex
CREATE INDEX "Document_updatedAt_idx" ON "Document"("updatedAt");

-- CreateIndex
CREATE INDEX "Document_acceptedAt_idx" ON "Document"("acceptedAt");

-- CreateIndex
CREATE INDEX "Document_acceptedById_idx" ON "Document"("acceptedById");

-- CreateIndex
CREATE INDEX "Document_documentDate_idx" ON "Document"("documentDate");

-- CreateIndex
CREATE INDEX "Document_titleSource_idx" ON "Document"("titleSource");

-- CreateIndex
CREATE INDEX "Document_documentTypeSource_idx" ON "Document"("documentTypeSource");

-- CreateIndex
CREATE INDEX "Document_documentDateSource_idx" ON "Document"("documentDateSource");

-- CreateIndex
CREATE INDEX "Document_senderSource_idx" ON "Document"("senderSource");

-- CreateIndex
CREATE INDEX "Document_titleSearchVector_idx" ON "Document" USING GIN ("titleSearchVector");

-- CreateIndex
CREATE INDEX "Document_contentSearchVector_idx" ON "Document" USING GIN ("contentSearchVector");

-- CreateIndex
CREATE INDEX "Document_senderSearchVector_idx" ON "Document" USING GIN ("senderSearchVector");

-- CreateIndex
CREATE INDEX "Document_tagSearchVector_idx" ON "Document" USING GIN ("tagSearchVector");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_key_key" ON "Tenant"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_scannerImportPath_key" ON "Tenant"("scannerImportPath");

-- CreateIndex
CREATE INDEX "Tenant_isActive_idx" ON "Tenant"("isActive");

-- CreateIndex
CREATE INDEX "Tenant_name_idx" ON "Tenant"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_key_key" ON "DocumentType"("key");

-- CreateIndex
CREATE INDEX "DocumentType_active_idx" ON "DocumentType"("active");

-- CreateIndex
CREATE INDEX "DocumentType_isSystem_idx" ON "DocumentType"("isSystem");

-- CreateIndex
CREATE INDEX "DocumentType_displayOrder_idx" ON "DocumentType"("displayOrder");

-- CreateIndex
CREATE INDEX "DocumentPayment_documentId_idx" ON "DocumentPayment"("documentId");

-- CreateIndex
CREATE INDEX "DocumentPayment_documentId_source_idx" ON "DocumentPayment"("documentId", "source");

-- CreateIndex
CREATE INDEX "DocumentPayment_status_idx" ON "DocumentPayment"("status");

-- CreateIndex
CREATE INDEX "DocumentPayment_paidById_idx" ON "DocumentPayment"("paidById");

-- CreateIndex
CREATE INDEX "DocumentPayment_assignedToId_idx" ON "DocumentPayment"("assignedToId");

-- CreateIndex
CREATE INDEX "DocumentPayment_recipient_idx" ON "DocumentPayment"("recipient");

-- CreateIndex
CREATE INDEX "DocumentReference_documentId_idx" ON "DocumentReference"("documentId");

-- CreateIndex
CREATE INDEX "DocumentReference_documentId_source_idx" ON "DocumentReference"("documentId", "source");

-- CreateIndex
CREATE INDEX "DocumentReference_referenceNumber_idx" ON "DocumentReference"("referenceNumber");

-- CreateIndex
CREATE INDEX "DocumentCalendarEvent_documentId_idx" ON "DocumentCalendarEvent"("documentId");

-- CreateIndex
CREATE INDEX "DocumentCalendarEvent_paymentId_idx" ON "DocumentCalendarEvent"("paymentId");

-- CreateIndex
CREATE INDEX "DocumentCalendarEvent_documentId_source_idx" ON "DocumentCalendarEvent"("documentId", "source");

-- CreateIndex
CREATE INDEX "DocumentCalendarEvent_kind_idx" ON "DocumentCalendarEvent"("kind");

-- CreateIndex
CREATE INDEX "DocumentCalendarEvent_date_idx" ON "DocumentCalendarEvent"("date");

-- CreateIndex
CREATE INDEX "DocumentCalendarEvent_source_idx" ON "DocumentCalendarEvent"("source");

-- CreateIndex
CREATE INDEX "DocumentCalendarEvent_assignedToId_idx" ON "DocumentCalendarEvent"("assignedToId");

-- CreateIndex
CREATE INDEX "DocumentCalendarEvent_completedAt_idx" ON "DocumentCalendarEvent"("completedAt");

-- CreateIndex
CREATE INDEX "DocumentCalendarEvent_completedById_idx" ON "DocumentCalendarEvent"("completedById");

-- CreateIndex
CREATE INDEX "DocumentHistoryEvent_documentId_createdAt_idx" ON "DocumentHistoryEvent"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentHistoryEvent_actorUserId_idx" ON "DocumentHistoryEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "DocumentHistoryEvent_type_idx" ON "DocumentHistoryEvent"("type");

-- CreateIndex
CREATE INDEX "FileArtifact_documentId_idx" ON "FileArtifact"("documentId");

-- CreateIndex
CREATE INDEX "FileArtifact_artifactType_idx" ON "FileArtifact"("artifactType");

-- CreateIndex
CREATE INDEX "Tag_tenantId_idx" ON "Tag"("tenantId");

-- CreateIndex
CREATE INDEX "Tag_name_idx" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_tenantId_name_key" ON "Tag"("tenantId", "name");

-- CreateIndex
CREATE INDEX "DocumentTag_documentId_source_idx" ON "DocumentTag"("documentId", "source");

-- CreateIndex
CREATE INDEX "DocumentTag_tagId_idx" ON "DocumentTag"("tagId");

-- CreateIndex
CREATE INDEX "DocumentAttribute_documentId_idx" ON "DocumentAttribute"("documentId");

-- CreateIndex
CREATE INDEX "DocumentAttribute_fieldDefinitionId_idx" ON "DocumentAttribute"("fieldDefinitionId");

-- CreateIndex
CREATE INDEX "DocumentAttribute_documentId_source_idx" ON "DocumentAttribute"("documentId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentAttribute_documentId_key_key" ON "DocumentAttribute"("documentId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentFieldDefinition_key_key" ON "DocumentFieldDefinition"("key");

-- CreateIndex
CREATE INDEX "DocumentFieldDefinition_active_idx" ON "DocumentFieldDefinition"("active");

-- CreateIndex
CREATE INDEX "DocumentFieldDefinition_displayOrder_idx" ON "DocumentFieldDefinition"("displayOrder");

-- CreateIndex
CREATE INDEX "DocumentFieldDefinitionScope_documentTypeId_idx" ON "DocumentFieldDefinitionScope"("documentTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "UserTenantMembership_tenantId_idx" ON "UserTenantMembership"("tenantId");

-- CreateIndex
CREATE INDEX "UserTenantMembership_userId_isDefault_idx" ON "UserTenantMembership"("userId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "ProcessingJob_documentId_idx" ON "ProcessingJob"("documentId");

-- CreateIndex
CREATE INDEX "ProcessingJob_status_idx" ON "ProcessingJob"("status");

-- CreateIndex
CREATE INDEX "ProcessingJob_jobType_idx" ON "ProcessingJob"("jobType");

-- CreateIndex
CREATE INDEX "ProcessingJob_assignedAiProviderId_idx" ON "ProcessingJob"("assignedAiProviderId");

-- CreateIndex
CREATE INDEX "AiProvider_priority_idx" ON "AiProvider"("priority");

-- CreateIndex
CREATE INDEX "AiProvider_isActive_idx" ON "AiProvider"("isActive");

-- CreateIndex
CREATE INDEX "AiProvider_status_idx" ON "AiProvider"("status");

-- CreateIndex
CREATE INDEX "AiMetadataPrompt_displayOrder_idx" ON "AiMetadataPrompt"("displayOrder");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_idx" ON "AuditEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "EditLock_ownerUserId_idx" ON "EditLock"("ownerUserId");

-- CreateIndex
CREATE INDEX "EditLock_socketId_idx" ON "EditLock"("socketId");

-- CreateIndex
CREATE INDEX "EditLock_expiresAt_idx" ON "EditLock"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EditLock_scope_resourceId_key" ON "EditLock"("scope", "resourceId");

-- CreateIndex
CREATE INDEX "EmailMailbox_tenantId_idx" ON "EmailMailbox"("tenantId");

-- CreateIndex
CREATE INDEX "EmailMailbox_isActive_idx" ON "EmailMailbox"("isActive");

-- CreateIndex
CREATE INDEX "EmailMailbox_host_idx" ON "EmailMailbox"("host");

-- CreateIndex
CREATE INDEX "EmailFolderSelection_mailboxId_selected_idx" ON "EmailFolderSelection"("mailboxId", "selected");

-- CreateIndex
CREATE UNIQUE INDEX "EmailFolderSelection_mailboxId_folderPath_key" ON "EmailFolderSelection"("mailboxId", "folderPath");

-- CreateIndex
CREATE INDEX "EmailSenderRule_mailboxId_idx" ON "EmailSenderRule"("mailboxId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSenderRule_mailboxId_normalizedPattern_key" ON "EmailSenderRule"("mailboxId", "normalizedPattern");

-- CreateIndex
CREATE INDEX "EmailMessage_mailboxId_receivedAt_idx" ON "EmailMessage"("mailboxId", "receivedAt");

-- CreateIndex
CREATE INDEX "EmailMessage_fromAddress_idx" ON "EmailMessage"("fromAddress");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_mailboxId_folderPath_uidValidity_uid_key" ON "EmailMessage"("mailboxId", "folderPath", "uidValidity", "uid");

-- CreateIndex
CREATE INDEX "EmailAttachment_documentId_idx" ON "EmailAttachment"("documentId");

-- CreateIndex
CREATE INDEX "EmailAttachment_checksum_idx" ON "EmailAttachment"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAttachment_messageId_fileName_checksum_key" ON "EmailAttachment"("messageId", "fileName", "checksum");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPayment" ADD CONSTRAINT "DocumentPayment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPayment" ADD CONSTRAINT "DocumentPayment_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPayment" ADD CONSTRAINT "DocumentPayment_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentReference" ADD CONSTRAINT "DocumentReference_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentCalendarEvent" ADD CONSTRAINT "DocumentCalendarEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentCalendarEvent" ADD CONSTRAINT "DocumentCalendarEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "DocumentPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentCalendarEvent" ADD CONSTRAINT "DocumentCalendarEvent_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentCalendarEvent" ADD CONSTRAINT "DocumentCalendarEvent_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistoryEvent" ADD CONSTRAINT "DocumentHistoryEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistoryEvent" ADD CONSTRAINT "DocumentHistoryEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileArtifact" ADD CONSTRAINT "FileArtifact_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTag" ADD CONSTRAINT "DocumentTag_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTag" ADD CONSTRAINT "DocumentTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttribute" ADD CONSTRAINT "DocumentAttribute_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttribute" ADD CONSTRAINT "DocumentAttribute_fieldDefinitionId_fkey" FOREIGN KEY ("fieldDefinitionId") REFERENCES "DocumentFieldDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFieldDefinitionScope" ADD CONSTRAINT "DocumentFieldDefinitionScope_fieldDefinitionId_fkey" FOREIGN KEY ("fieldDefinitionId") REFERENCES "DocumentFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFieldDefinitionScope" ADD CONSTRAINT "DocumentFieldDefinitionScope_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTenantMembership" ADD CONSTRAINT "UserTenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTenantMembership" ADD CONSTRAINT "UserTenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_assignedAiProviderId_fkey" FOREIGN KEY ("assignedAiProviderId") REFERENCES "AiProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditLock" ADD CONSTRAINT "EditLock_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMailbox" ADD CONSTRAINT "EmailMailbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailFolderSelection" ADD CONSTRAINT "EmailFolderSelection_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "EmailMailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSenderRule" ADD CONSTRAINT "EmailSenderRule_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "EmailMailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "EmailMailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SearchVectorMaintenance
CREATE OR REPLACE FUNCTION smart_dms_document_tags_tsvector(document_id uuid)
RETURNS tsvector
LANGUAGE sql
STABLE
AS $$
  SELECT to_tsvector('simple', coalesce(string_agg(t.name, ' ' ORDER BY t.name), ''))
  FROM "DocumentTag" dt
  JOIN "Tag" t ON t.id = dt."tagId"
  WHERE dt."documentId" = document_id;
$$;

CREATE OR REPLACE FUNCTION smart_dms_refresh_document_search_vectors(document_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "Document" d
  SET
    "titleSearchVector" = to_tsvector('simple', coalesce(d."title", '')),
    "contentSearchVector" = to_tsvector('simple', coalesce(d."ocrText", '')),
    "senderSearchVector" = to_tsvector('simple', coalesce(d."sender", '')),
    "tagSearchVector" = smart_dms_document_tags_tsvector(d.id)
  WHERE d.id = document_id;
END;
$$;

CREATE OR REPLACE FUNCTION smart_dms_document_search_vector_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."titleSearchVector" := to_tsvector('simple', coalesce(NEW."title", ''));
  NEW."contentSearchVector" := to_tsvector('simple', coalesce(NEW."ocrText", ''));
  NEW."senderSearchVector" := to_tsvector('simple', coalesce(NEW."sender", ''));
  NEW."tagSearchVector" := smart_dms_document_tags_tsvector(NEW.id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Document_search_vector_refresh"
BEFORE INSERT OR UPDATE OF "title", "ocrText", "sender"
ON "Document"
FOR EACH ROW
EXECUTE FUNCTION smart_dms_document_search_vector_trigger();

CREATE OR REPLACE FUNCTION smart_dms_document_tag_search_vector_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM smart_dms_refresh_document_search_vectors(OLD."documentId");
    RETURN OLD;
  END IF;

  PERFORM smart_dms_refresh_document_search_vectors(NEW."documentId");
  IF TG_OP = 'UPDATE' AND NEW."documentId" <> OLD."documentId" THEN
    PERFORM smart_dms_refresh_document_search_vectors(OLD."documentId");
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DocumentTag_search_vector_refresh"
AFTER INSERT OR UPDATE OR DELETE
ON "DocumentTag"
FOR EACH ROW
EXECUTE FUNCTION smart_dms_document_tag_search_vector_trigger();

CREATE OR REPLACE FUNCTION smart_dms_tag_search_vector_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  affected_document_id uuid;
  affected_tag_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.name IS NOT DISTINCT FROM OLD.name THEN
    RETURN NEW;
  END IF;

  affected_tag_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;

  FOR affected_document_id IN
    SELECT dt."documentId"
    FROM "DocumentTag" dt
    WHERE dt."tagId" = affected_tag_id
  LOOP
    PERFORM smart_dms_refresh_document_search_vectors(affected_document_id);
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Tag_search_vector_refresh"
AFTER UPDATE OF name OR DELETE
ON "Tag"
FOR EACH ROW
EXECUTE FUNCTION smart_dms_tag_search_vector_trigger();

-- TrigramSearchIndexes
CREATE INDEX "Document_title_trgm_idx" ON "Document" USING GIN (lower("title") gin_trgm_ops);
CREATE INDEX "Document_sender_trgm_idx" ON "Document" USING GIN (lower("sender") gin_trgm_ops) WHERE "sender" IS NOT NULL AND trim("sender") <> '';
CREATE INDEX "Tag_name_trgm_idx" ON "Tag" USING GIN (lower("name") gin_trgm_ops);

-- FtsSearchIndexes
CREATE INDEX "Document_recipient_fts_idx" ON "Document" USING GIN (to_tsvector('simple', coalesce("recipient", '')));

-- QueryPerformanceIndexes
CREATE INDEX "Document_accepted_tenant_documentDate_idx"
ON "Document"("tenantId", "documentDate" DESC, "createdAt" DESC, id)
WHERE "acceptedAt" IS NOT NULL AND status <> 'ARCHIVED';

CREATE INDEX "Document_accepted_tenant_createdAt_idx"
ON "Document"("tenantId", "createdAt" DESC, id)
WHERE "acceptedAt" IS NOT NULL AND status <> 'ARCHIVED';

CREATE INDEX "Document_accepted_tenant_updatedAt_idx"
ON "Document"("tenantId", "updatedAt" DESC, id)
WHERE "acceptedAt" IS NOT NULL AND status <> 'ARCHIVED';

CREATE INDEX "Document_accepted_tenant_visibleDate_idx"
ON "Document"("tenantId", (coalesce("documentDate", "createdAt")) DESC, id)
WHERE "acceptedAt" IS NOT NULL AND status <> 'ARCHIVED';

CREATE INDEX "Document_accepted_ready_tenant_updatedAt_idx"
ON "Document"("tenantId", "updatedAt" DESC, id)
WHERE "acceptedAt" IS NOT NULL AND status = 'READY';

CREATE INDEX "Document_inbox_tenant_createdAt_idx"
ON "Document"("tenantId", "createdAt" ASC, id)
WHERE "acceptedAt" IS NULL AND status <> 'ARCHIVED';

CREATE INDEX "Document_inbox_ready_tenant_idx"
ON "Document"("tenantId", "createdAt" ASC, id)
WHERE "acceptedAt" IS NULL AND status = 'READY';

CREATE INDEX "Document_failed_tenant_updatedAt_idx"
ON "Document"("tenantId", "updatedAt" DESC, id)
WHERE status = 'FAILED';

CREATE INDEX "Document_sender_facet_idx"
ON "Document"("tenantId", (trim("sender")))
WHERE "sender" IS NOT NULL AND trim("sender") <> '';

CREATE INDEX "Document_visibleDate_idx"
ON "Document"("tenantId", (coalesce("documentDate", "createdAt")) DESC, id)
WHERE status <> 'ARCHIVED';

CREATE INDEX "Document_ai_extraction_candidates_idx"
ON "Document"("tenantId", id)
WHERE status = 'READY' AND "aiProcessedAt" IS NULL AND "ocrText" IS NOT NULL AND "ocrText" <> '';

CREATE INDEX "DocumentCalendarEvent_open_deadline_date_idx"
ON "DocumentCalendarEvent"("date", "assignedToId", "documentId")
WHERE "completedAt" IS NULL AND kind IN ('DUE_DATE', 'DEADLINE');

CREATE INDEX "DocumentCalendarEvent_open_deadline_schedule_idx"
ON "DocumentCalendarEvent"("date", "time", "title", "documentId")
WHERE "completedAt" IS NULL AND kind IN ('DUE_DATE', 'DEADLINE');

CREATE INDEX "DocumentCalendarEvent_payment_due_date_idx"
ON "DocumentCalendarEvent"("paymentId", "date", "time", "createdAt", id)
WHERE kind = 'DUE_DATE' AND "paymentId" IS NOT NULL;

CREATE INDEX "DocumentCalendarEvent_completed_recent_idx"
ON "DocumentCalendarEvent"("completedAt" DESC, "updatedAt" DESC, id)
WHERE "completedAt" IS NOT NULL AND kind IN ('DUE_DATE', 'DEADLINE') AND "paymentId" IS NULL;

CREATE INDEX "DocumentPayment_open_assignee_document_idx"
ON "DocumentPayment"("assignedToId", "documentId", "createdAt", id)
WHERE status = 'OPEN';

CREATE INDEX "DocumentPayment_open_created_document_idx"
ON "DocumentPayment"("createdAt", id, "documentId")
WHERE status = 'OPEN';

CREATE INDEX "DocumentPayment_paid_recent_idx"
ON "DocumentPayment"("paidAt" DESC, "updatedAt" DESC, id)
WHERE status = 'PAID';

CREATE INDEX "ProcessingJob_document_createdAt_idx"
ON "ProcessingJob"("documentId", "createdAt" DESC, id DESC);

CREATE INDEX "ProcessingJob_type_status_createdAt_idx"
ON "ProcessingJob"("jobType", status, "createdAt", id);

CREATE INDEX "EmailMessage_mailbox_folder_receivedAt_idx"
ON "EmailMessage"("mailboxId", "folderPath", "receivedAt" DESC, "createdAt" DESC, id);

CREATE INDEX "FileArtifact_document_type_createdAt_idx"
ON "FileArtifact"("documentId", "artifactType", "createdAt", id);
