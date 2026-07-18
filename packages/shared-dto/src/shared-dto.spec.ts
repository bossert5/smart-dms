import { describe, expect, it } from "vitest";
import {
  AI_PROVIDER_CHANGED_EVENT,
  AiMetadataExtractionResultSchema,
  AiMetadataExtractionJobPayloadSchema,
  AiProviderDtoSchema,
  AiProviderModelsResponseSchema,
  CreateAiProviderRequestSchema,
  CalendarEventKindSchema,
  CalendarEventsRequestSchema,
  CalendarEventsResponseSchema,
  ChangePasswordRequestSchema,
  CreateDocumentFieldDefinitionRequestSchema,
  CreateEmailMailboxRequestSchema,
  DashboardSummaryDtoSchema,
  DeleteTenantRequestSchema,
  DeleteTenantResponseSchema,
  DeleteDocumentResponseSchema,
  DocumentEntrySourceSchema,
  DocumentHistoryEventDtoSchema,
  DocumentHistoryEventTypeSchema,
  DocumentHistoryResponseSchema,
  DocumentTypeDtoSchema,
  DOCUMENT_CHANGED_EVENT,
  DocumentSearchFacetsResponseSchema,
  DocumentSearchFieldSchema,
  DocumentSearchRequestSchema,
  DocumentMetadataUpdateRequestSchema,
  DocumentPaymentDtoSchema,
  DocumentPaymentStatusSchema,
  DocumentSummaryDtoSchema,
  DocumentSearchResponseSchema,
  DocumentSearchSortBySchema,
  MoveDocumentToInboxResponseSchema,
  MoveDocumentToTenantRequestSchema,
  EmailImportModeSchema,
  EmailMessagesResponseSchema,
  LoginRequestSchema,
  LoadAiProviderModelsRequestSchema,
  NOTIFICATIONS_CREATED_EVENT,
  NOTIFICATIONS_SNAPSHOT_EVENT,
  REALTIME_NAMESPACE,
  RealtimeAiProviderChangedEventSchema,
  RealtimeDocumentChangedEventSchema,
  RealtimeDomainEventSchema,
  RealtimeNotificationDtoSchema,
  RealtimeNotificationTypeSchema,
  ReprocessDocumentRequestSchema,
  ReorderDocumentTypesRequestSchema,
  ReorderAiProvidersRequestSchema,
  SystemSettingsDtoSchema,
  TriggerBulkAiProcessingResponseSchema,
  TriggerDocumentAiProcessingResponseSchema,
  UpdateSystemSettingsRequestSchema,
  UpdateEmailMailboxRequestSchema,
  BulkUpdateUsersRequestSchema,
  BulkUpdateUsersResponseSchema,
  CreateUserRequestSchema,
  UserDtoSchema,
  UserRoleSchema,
  UpdateAiProviderRequestSchema,
} from "./index";

const createdAt = "2026-05-06T18:00:00.000Z";
const providerId = "018f1a44-9093-7f55-a515-278f4d9bd777";
const tenant = {
  id: "018f1a44-9093-7f55-a515-278f4d9bd900",
  key: "default",
  name: "Default",
  isActive: true,
};

describe("@smart-dms/shared-dto", () => {
  it("validates login requests", () => {
    expect(
      LoginRequestSchema.parse({
        username: "admin",
        password: "change-me",
      }),
    ).toEqual({
      username: "admin",
      password: "change-me",
    });

    expect(() =>
      LoginRequestSchema.parse({ username: "", password: "change-me" }),
    ).toThrow();
    expect(() =>
      LoginRequestSchema.parse({ username: "admin", password: "" }),
    ).toThrow();
  });

  it("keeps documented user role values stable", () => {
    expect(UserRoleSchema.options).toEqual(["Admin", "User"]);
  });

  it("validates user password change state", () => {
    expect(
      UserDtoSchema.parse({
        id: "018f1a44-9093-7f55-a515-278f4d9bd99f",
        username: "admin",
        displayName: "Admin",
        role: "Admin",
        isActive: true,
        passwordChangeRequired: true,
        tenants: [tenant],
        defaultTenantId: tenant.id,
        createdAt,
        updatedAt: createdAt,
      }).passwordChangeRequired,
    ).toBe(true);
  });

  it("validates tenant deletion requests", () => {
    expect(
      DeleteTenantRequestSchema.parse({
        confirmationName: " Default ",
        documentAction: "DELETE",
        userAction: "REMOVE_ASSIGNMENTS",
      }),
    ).toEqual({
      confirmationName: "Default",
      documentAction: "DELETE",
      userAction: "REMOVE_ASSIGNMENTS",
    });
    expect(
      DeleteTenantRequestSchema.parse({
        confirmationName: "Default",
        documentAction: "MOVE",
        targetTenantId: tenant.id,
        userAction: "REMOVE_ASSIGNMENTS",
      }).targetTenantId,
    ).toBe(tenant.id);
    expect(DeleteTenantResponseSchema.parse({ success: true })).toEqual({
      success: true,
    });
    expect(() =>
      DeleteTenantRequestSchema.parse({
        confirmationName: "Default",
        documentAction: "MOVE",
        userAction: "REMOVE_ASSIGNMENTS",
      }),
    ).toThrow();
  });

  it("validates password change requests", () => {
    expect(
      ChangePasswordRequestSchema.parse({
        newPassword: "Password1!",
      }),
    ).toEqual({
      newPassword: "Password1!",
    });
    expect(
      ChangePasswordRequestSchema.parse({
        currentPassword: "Initial1!",
        newPassword: "Password1!",
      }),
    ).toEqual({
      currentPassword: "Initial1!",
      newPassword: "Password1!",
    });

    expect(() =>
      ChangePasswordRequestSchema.parse({
        currentPassword: "Password1!",
        newPassword: "Password1!",
      }),
    ).toThrow();
    expect(() =>
      ChangePasswordRequestSchema.parse({
        currentPassword: "Initial1!",
        newPassword: "Ab1!",
      }),
    ).toThrow();
    expect(() =>
      ChangePasswordRequestSchema.parse({
        newPassword: "Password!",
      }),
    ).toThrow();
    expect(() =>
      ChangePasswordRequestSchema.parse({
        newPassword: "Password1",
      }),
    ).toThrow();
  });

  it("validates user creation password policy", () => {
    expect(
      CreateUserRequestSchema.parse({
        username: "new-user",
        displayName: "New User",
        password: "Password1!",
        role: "User",
      }).password,
    ).toBe("Password1!");

    expect(() =>
      CreateUserRequestSchema.parse({
        username: "new-user",
        displayName: "New User",
        password: "Ab1!",
        role: "User",
      }),
    ).toThrow();
    expect(() =>
      CreateUserRequestSchema.parse({
        username: "new-user",
        displayName: "New User",
        password: "Password!",
        role: "User",
      }),
    ).toThrow();
    expect(() =>
      CreateUserRequestSchema.parse({
        username: "new-user",
        displayName: "New User",
        password: "Password1",
        role: "User",
      }),
    ).toThrow();
  });

  it("validates bulk user updates", () => {
    expect(
      BulkUpdateUsersRequestSchema.parse({
        updates: [
          {
            id: "018f1a44-9093-7f55-a515-278f4d9bd99f",
            changes: {
              displayName: "Admin User",
              role: "Admin",
              isActive: true,
              tenantIds: [tenant.id],
            },
          },
        ],
      }).updates,
    ).toHaveLength(1);
    expect(
      BulkUpdateUsersResponseSchema.parse({
        users: [
          {
            id: "018f1a44-9093-7f55-a515-278f4d9bd99f",
            username: "admin",
            displayName: "Admin",
            role: "Admin",
            isActive: true,
            passwordChangeRequired: false,
            tenants: [tenant],
            defaultTenantId: tenant.id,
            createdAt,
            updatedAt: createdAt,
          },
        ],
      }).users,
    ).toHaveLength(1);
    expect(() => BulkUpdateUsersRequestSchema.parse({ updates: [] })).toThrow();
    expect(() =>
      BulkUpdateUsersRequestSchema.parse({
        updates: [
          {
            id: "018f1a44-9093-7f55-a515-278f4d9bd99f",
            changes: {},
          },
        ],
      }),
    ).toThrow();
  });

  it("validates system settings", () => {
    expect(
      SystemSettingsDtoSchema.parse({
        ocrReprocessExistingTextLayer: false,
        pdfRemoveBlankPages: false,
        documentsRequireAiMetadataBeforeAcceptance: false,
        extractionMode: "fast",
        aiMetadataLanguage: "DOCUMENT_LANGUAGE",
      }).ocrReprocessExistingTextLayer,
    ).toBe(false);
    expect(
      UpdateSystemSettingsRequestSchema.parse({
        ocrReprocessExistingTextLayer: true,
      }).ocrReprocessExistingTextLayer,
    ).toBe(true);
    expect(
      UpdateSystemSettingsRequestSchema.parse({
        pdfRemoveBlankPages: true,
      }).pdfRemoveBlankPages,
    ).toBe(true);
    expect(
      UpdateSystemSettingsRequestSchema.parse({
        documentsRequireAiMetadataBeforeAcceptance: true,
      }).documentsRequireAiMetadataBeforeAcceptance,
    ).toBe(true);
    expect(
      UpdateSystemSettingsRequestSchema.parse({
        extractionMode: "fast",
      }).extractionMode,
    ).toBe("fast");
    expect(
      UpdateSystemSettingsRequestSchema.parse({
        aiMetadataLanguage: "DOCUMENT_LANGUAGE",
      }).aiMetadataLanguage,
    ).toBe("DOCUMENT_LANGUAGE");
    expect(
      UpdateSystemSettingsRequestSchema.parse({
        aiMetadataLanguage: "deu",
      }).aiMetadataLanguage,
    ).toBe("deu");
    expect(() =>
      UpdateSystemSettingsRequestSchema.parse({ extractionMode: "balanced" }),
    ).toThrow();
    expect(() =>
      UpdateSystemSettingsRequestSchema.parse({ extractionMode: "quality" }),
    ).toThrow();
    expect(() =>
      UpdateSystemSettingsRequestSchema.parse({
        aiMetadataLanguage: "italian",
      }),
    ).toThrow();
    expect(() => UpdateSystemSettingsRequestSchema.parse({})).toThrow();
  });

  it("validates email mailbox contracts", () => {
    expect(EmailImportModeSchema.options).toEqual([
      "DISABLED",
      "OCR_ONLY",
      "OCR_AND_AI",
    ]);
    expect(
      CreateEmailMailboxRequestSchema.parse({
        name: "Invoices",
        host: "imap.example.com",
        username: "invoices@example.com",
        password: "secret",
        tenantId: tenant.id,
        selectedFolders: ["INBOX", "Invoices"],
        senderRules: ["invoice@example.com", "*@supplier.example"],
      }).port,
    ).toBe(993);
    expect(
      UpdateEmailMailboxRequestSchema.parse({
        importMode: "OCR_AND_AI",
        senderRules: ["*@example.com"],
      }).importMode,
    ).toBe("OCR_AND_AI");
    expect(() =>
      CreateEmailMailboxRequestSchema.parse({
        name: "Broken",
        host: "imap.example.com",
        username: "user",
        password: "secret",
        senderRules: ["*@localhost"],
      }),
    ).toThrow();
    expect(() => UpdateEmailMailboxRequestSchema.parse({})).toThrow();

    expect(
      EmailMessagesResponseSchema.parse({
        items: [
          {
            id: "018f1a44-9093-7f55-a515-278f4d9bd99f",
            mailboxId: "018f1a44-9093-7f55-a515-278f4d9bd990",
            mailboxName: "Invoices",
            tenant,
            folderPath: "INBOX",
            uid: "42",
            uidValidity: "7",
            messageId: "<message@example.com>",
            subject: "Invoice",
            fromAddress: "invoice@example.com",
            fromName: "Supplier",
            sentAt: createdAt,
            receivedAt: createdAt,
            textPreview: "Please see attached invoice.",
            bodyText: "Please see attached invoice.",
            processedAt: createdAt,
            skippedReason: null,
            createdAt,
            updatedAt: createdAt,
            attachments: [
              {
                id: "018f1a44-9093-7f55-a515-278f4d9bd991",
                fileName: "invoice.pdf",
                mimeType: "application/pdf",
                size: 1234,
                checksum: "abc",
                documentId: "018f1a44-9093-7f55-a515-278f4d9bd992",
                documentStatus: "READY",
                pdfUrl:
                  "/email-mailboxes/messages/018f1a44-9093-7f55-a515-278f4d9bd99f/attachments/018f1a44-9093-7f55-a515-278f4d9bd991/pdf",
                createdAt,
              },
            ],
          },
        ],
        meta: {
          page: 1,
          pageSize: 25,
          totalItems: 1,
          totalPages: 1,
        },
      }).items[0].attachments,
    ).toHaveLength(1);
  });

  it("validates document type system markers", () => {
    expect(
      DocumentTypeDtoSchema.parse({
        id: "018f1a44-9093-7f55-a515-278f4d9bd99f",
        key: "invoice",
        name: "Invoice",
        active: true,
        isSystem: true,
        displayOrder: 10,
        createdAt,
        updatedAt: createdAt,
      }).isSystem,
    ).toBe(true);
  });

  it("validates document type reorder requests", () => {
    expect(
      ReorderDocumentTypesRequestSchema.parse({
        documentTypeIds: [
          "018f1a44-9093-7f55-a515-278f4d9bd99f",
          "018f1a44-9093-7f55-a515-278f4d9bd990",
        ],
      }).documentTypeIds,
    ).toHaveLength(2);

    expect(() =>
      ReorderDocumentTypesRequestSchema.parse({ documentTypeIds: [] }),
    ).toThrow();
  });

  it("validates a document list response", () => {
    expect(DocumentSearchSortBySchema.options).toContain("relevance");
    expect(DocumentSearchSortBySchema.options).toEqual([
      "relevance",
      "createdAt",
      "updatedAt",
      "documentDate",
      "title",
      "status",
      "documentType",
      "sender",
    ]);
    expect(DocumentSearchFieldSchema.options).toEqual([
      "title",
      "content",
      "sender",
      "tags",
    ]);
    expect(
      DocumentSearchResponseSchema.parse({
        items: [
          {
            id: "018f1a44-9093-7f55-a515-278f4d9bd99f",
            title: "Invoice",
            tenant,
            documentType: null,
            originalFileName: "invoice.pdf",
            source: "UPLOAD",
            mimeType: "application/pdf",
            status: "READY",
            createdAt,
            updatedAt: createdAt,
            acceptedAt: createdAt,
            acceptedById: null,
            aiProcessedAt: null,
            documentDate: null,
            summary: null,
            sender: null,
            recipient: null,
            note: null,
            fileSize: 1234,
            pageCount: 1,
            tags: [
              {
                id: "018f1a44-9093-7f55-a515-278f4d9bd990",
                name: "tax",
                createdAt,
                createdBy: null,
                source: "AI_EXTRACTED",
              },
            ],
            thumbnailUrl:
              "/documents/018f1a44-9093-7f55-a515-278f4d9bd99f/thumbnail",
            calendarEventKinds: [],
          },
        ],
        meta: {
          page: 1,
          pageSize: 25,
          totalItems: 1,
          totalPages: 1,
        },
      }).items,
    ).toHaveLength(1);
  });

  it("validates document search fields, filters, and facets", () => {
    expect(
      DocumentSearchRequestSchema.parse({
        page: 1,
        pageSize: 25,
        query: "invoice",
        filters: {
          tagNames: ["tax"],
          senders: ["Sender GmbH"],
          documentTypeIds: ["018f1a44-9093-7f55-a515-278f4d9bd99f"],
          visibleDateFrom: "2026-05-01T00:00:00.000Z",
          visibleDateTo: "2026-05-31T23:59:59.999Z",
        },
      }).searchFields,
    ).toEqual(["title", "content", "sender", "tags"]);
    expect(
      DocumentSearchRequestSchema.parse({
        page: 1,
        pageSize: 25,
      }),
    ).toMatchObject({
      sortBy: "documentDate",
      sortDirection: "desc",
    });

    expect(
      DocumentSearchRequestSchema.parse({
        page: 1,
        pageSize: 25,
        searchFields: ["title"],
      }).searchFields,
    ).toEqual(["title"]);

    expect(
      DocumentSearchRequestSchema.parse({
        page: 1,
        pageSize: 25,
        searchFields: ["sender", "tags"],
      }).searchFields,
    ).toEqual(["sender", "tags"]);

    expect(
      DocumentSearchFacetsResponseSchema.parse({
        tags: [
          {
            id: "018f1a44-9093-7f55-a515-278f4d9bd990",
            name: "tax",
            createdAt,
            createdBy: null,
          },
        ],
        senders: ["Sender GmbH"],
        documentTypes: [
          {
            id: "018f1a44-9093-7f55-a515-278f4d9bd99f",
            key: "invoice",
            name: "Invoice",
            active: true,
            isSystem: true,
            displayOrder: 10,
            createdAt,
            updatedAt: createdAt,
          },
        ],
      }).senders,
    ).toEqual(["Sender GmbH"]);
  });

  it("validates reprocess document requests", () => {
    expect(ReprocessDocumentRequestSchema.parse({}).action).toBe("OCR");
    expect(
      ReprocessDocumentRequestSchema.parse({ action: "ROTATE_180" }).action,
    ).toBe("ROTATE_180");
    expect(() =>
      ReprocessDocumentRequestSchema.parse({ action: "ROTATE_90" }),
    ).toThrow();
  });

  it("validates document move and delete responses", () => {
    const document = DocumentSearchResponseSchema.parse({
      items: [
        {
          id: "018f1a44-9093-7f55-a515-278f4d9bd99f",
          title: "Invoice",
          tenant,
          documentType: null,
          originalFileName: "invoice.pdf",
          source: "UPLOAD",
          mimeType: "application/pdf",
          status: "READY",
          createdAt,
          updatedAt: createdAt,
          acceptedAt: null,
          acceptedById: null,
          aiProcessedAt: null,
          documentDate: null,
          summary: null,
          sender: null,
          recipient: null,
          note: null,
          fileSize: 1234,
          pageCount: 1,
          tags: [],
          thumbnailUrl: null,
          calendarEventKinds: [],
        },
      ],
      meta: {
        page: 1,
        pageSize: 25,
        totalItems: 1,
        totalPages: 1,
      },
    }).items[0];

    expect(
      MoveDocumentToInboxResponseSchema.parse({ document }).document.acceptedAt,
    ).toBeNull();
    expect(
      DeleteDocumentResponseSchema.parse({
        deleted: true,
        documentId: document.id,
      }).deleted,
    ).toBe(true);
  });

  it("validates calendar event types and date ranges", () => {
    expect(CalendarEventKindSchema.options).toEqual([
      "DUE_DATE",
      "DEADLINE",
      "APPOINTMENT",
    ]);
    expect(DocumentEntrySourceSchema.options).toEqual([
      "AI_EXTRACTED",
      "MANUAL",
    ]);

    expect(
      CalendarEventsRequestSchema.parse({
        from: "2026-06-01",
        to: "2026-06-30",
        kinds: ["DUE_DATE", "DUE_DATE", "APPOINTMENT"],
      }),
    ).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
      kinds: ["DUE_DATE", "DUE_DATE", "APPOINTMENT"],
      includeArchived: false,
    });

    expect(
      CalendarEventsResponseSchema.parse({
        items: [
          {
            id: "018f1a44-9093-7f55-a515-278f4d9bd991",
            documentId: "018f1a44-9093-7f55-a515-278f4d9bd99f",
            paymentId: null,
            documentSender: "Sender GmbH",
            tenant,
            kind: "APPOINTMENT",
            title: "Meeting",
            description: null,
            date: "2026-06-10",
            time: "14:30",
            endDate: null,
            endTime: null,
            source: "AI_EXTRACTED",
            sourceText: null,
            createdAt,
            updatedAt: createdAt,
          },
          {
            id: "018f1a44-9093-7f55-a515-278f4d9bd992",
            documentId: "018f1a44-9093-7f55-a515-278f4d9bd99f",
            documentSender: null,
            tenant,
            kind: "DUE_DATE",
            title: "Installment due",
            description: null,
            date: "2026-06-30",
            time: null,
            endDate: null,
            endTime: null,
            source: "AI_EXTRACTED",
            sourceText: null,
            createdAt,
            updatedAt: createdAt,
          },
        ],
      }).items.map((event) => event.documentSender),
    ).toEqual(["Sender GmbH", null]);

    expect(() =>
      CalendarEventsRequestSchema.parse({
        from: "2026-06-30",
        to: "2026-06-01",
      }),
    ).toThrow();
    expect(() =>
      CalendarEventsRequestSchema.parse({
        from: "2026-02-31",
        to: "2026-03-01",
      }),
    ).toThrow();
  });

  it("validates AI metadata extraction calendar events", () => {
    const parsed = AiMetadataExtractionResultSchema.parse({
      summary: "Invoice with three dates",
      payments: [
        {
          iban: "DE02120300000000202051",
          recipient: "Sender GmbH",
          purpose: "R-100",
          amount: 120.5,
          currency: "EUR",
        },
      ],
      calendarEvents: [
        {
          kind: "APPOINTMENT",
          title: "Meeting",
          date: "2026-06-10",
          time: "14:30",
        },
        {
          kind: "APPOINTMENT",
          title: "Follow-up appointment",
          relativeDate: {
            amount: 3,
            unit: "WEEKS",
            anchor: "DOCUMENT_DATE",
          },
          time: "14:30",
        },
        {
          kind: "DUE_DATE",
          title: "Installment due",
          date: "2026-06-30",
        },
      ],
    });

    expect(parsed.calendarEvents).toHaveLength(3);
    expect(parsed.payments?.[0].amount).toBe(120.5);
    expect(parsed.calendarEvents[0].time).toBe("14:30");
    expect(parsed.calendarEvents[1].relativeDate).toEqual({
      amount: 3,
      unit: "WEEKS",
      anchor: "DOCUMENT_DATE",
    });
    expect(() =>
      AiMetadataExtractionResultSchema.parse({
        calendarEvents: [{ kind: "DEADLINE", title: "Deadline" }],
      }),
    ).toThrow();
    expect(() =>
      AiMetadataExtractionResultSchema.parse({
        calendarEvents: [
          {
            kind: "DEADLINE",
            title: "Deadline",
            relativeDate: {
              amount: 1,
              unit: "MONTHS",
              anchor: "DOCUMENT_DATE",
            },
          },
        ],
      }),
    ).toThrow();
    expect(() => AiMetadataExtractionResultSchema.parse({})).toThrow();
  });

  it("validates AI extraction job payloads and trigger responses", () => {
    expect(
      AiMetadataExtractionJobPayloadSchema.parse({
        documentId: "018f1a44-9093-7f55-a515-278f4d9bd99f",
        ocrText: "Invoice R-100",
        sourceTextFormat: "MARKDOWN",
        metadata: {
          title: "Invoice",
          originalFileName: "invoice.pdf",
          documentDate: null,
          ocrLanguage: "german",
          aiMetadataLanguage: "eng",
          sender: null,
          recipient: null,
        },
        documentTypes: [{ key: "invoice", name: "Invoice" }],
        fieldDefinitions: [
          { key: "costCenter", label: "Cost center", valueType: "TEXT" },
        ],
        prompts: [
          {
            key: "CORE_METADATA",
            text: "Core metadata prompt",
            resultSchema: { type: "object" },
          },
          {
            key: "SUMMARY",
            text: "Summary prompt",
            resultSchema: { type: "object" },
          },
        ],
      }).fieldDefinitions[0].key,
    ).toBe("costCenter");

    expect(
      AiMetadataExtractionJobPayloadSchema.parse({
        documentId: "018f1a44-9093-7f55-a515-278f4d9bd99f",
        ocrText: "Invoice R-100",
        metadata: {
          title: "Invoice",
          originalFileName: "invoice.pdf",
          documentDate: null,
          ocrLanguage: "german",
          sender: null,
          recipient: null,
        },
        documentTypes: [],
        fieldDefinitions: [],
        prompts: [
          {
            key: "CORE_METADATA",
            text: "Core metadata prompt",
            resultSchema: { type: "object" },
          },
        ],
      }).sourceTextFormat,
    ).toBe("PLAIN_TEXT");

    expect(() =>
      AiMetadataExtractionJobPayloadSchema.parse({
        documentId: "018f1a44-9093-7f55-a515-278f4d9bd99f",
        ocrText: "Invoice R-100",
        metadata: {
          title: "Invoice",
          originalFileName: "invoice.pdf",
          documentDate: null,
          ocrLanguage: null,
          sender: null,
          recipient: null,
        },
        documentTypes: [],
        fieldDefinitions: [],
        prompts: [
          {
            key: "STRUCTURED_METADATA",
            text: "Unsupported metadata prompt",
            resultSchema: { type: "object" },
          },
        ],
      }),
    ).toThrow();

    expect(
      TriggerDocumentAiProcessingResponseSchema.parse({
        documentId: "018f1a44-9093-7f55-a515-278f4d9bd99f",
        jobId: "018f1a44-9093-7f55-a515-278f4d9bd990",
        status: "AI_PENDING",
        queuePosition: 1,
      }).status,
    ).toBe("AI_PENDING");
    expect(
      TriggerBulkAiProcessingResponseSchema.parse({
        queuedCount: 2,
        queuedDocuments: [
          {
            documentId: "018f1a44-9093-7f55-a515-278f4d9bd99f",
            jobId: "018f1a44-9093-7f55-a515-278f4d9bd990",
            status: "AI_PENDING",
            queuePosition: 1,
          },
        ],
      }).queuedCount,
    ).toBe(2);
  });

  it("validates document metadata with multiple payments and dynamic fields", () => {
    expect(DocumentPaymentStatusSchema.options).toEqual([
      "OPEN",
      "PAID",
      "IGNORED",
    ]);
    expect(
      DocumentPaymentDtoSchema.parse({
        id: "018f1a44-9093-7f55-a515-278f4d9bd990",
        iban: "DE02120300000000202051",
        recipient: "Sender GmbH",
        purpose: "R-100",
        amount: 120.5,
        currency: "EUR",
        status: "OPEN",
        paidAt: null,
        paidById: null,
        dueDate: "2026-05-29",
        dueDateEventId: "018f1a44-9093-7f55-a515-278f4d9bd991",
        source: "AI_EXTRACTED",
        displayOrder: 0,
        createdAt,
        updatedAt: createdAt,
      }).status,
    ).toBe("OPEN");

    const parsed = DocumentMetadataUpdateRequestSchema.parse({
      title: "Invoice",
      payments: [
        {
          iban: "DE02120300000000202051",
          recipient: "Sender GmbH",
          purpose: "R-100",
          amount: 120.5,
          currency: "EUR",
          status: "PAID",
          paidAt: createdAt,
          dueDate: "2026-05-29",
          dueDateSourceText: "payable by 29 May 2026",
        },
        {
          recipient: "Second recipient",
          amount: 80,
        },
      ],
      references: [
        {
          referenceNumber: "R-100",
          referenceType: "Invoice",
        },
      ],
      calendarEvents: [
        {
          kind: "DEADLINE",
          title: "Reply deadline",
          description: "Submit the signed document",
          date: "2026-06-15",
          time: "10:30",
          endDate: null,
          endTime: null,
          sourceText: "Reply by 15 June 2026",
        },
      ],
      attributes: [
        {
          fieldDefinitionId: "018f1a44-9093-7f55-a515-278f4d9bd991",
          key: "costCenter",
          value: "IT",
          valueType: "TEXT",
        },
      ],
    });

    expect(parsed.payments).toHaveLength(2);
    expect(parsed.payments?.[0].status).toBe("PAID");
    expect(parsed.payments?.[0].dueDate).toBe("2026-05-29");
    expect(parsed.calendarEvents?.[0].time).toBe("10:30");
    expect(parsed.references?.[0].referenceType).toBe("Invoice");
    expect(() =>
      DocumentMetadataUpdateRequestSchema.parse({
        calendarEvents: [
          {
            kind: "DEADLINE",
            title: "Invalid deadline",
            date: "2026-06-15",
            time: "10:99",
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      DocumentMetadataUpdateRequestSchema.parse({
        calendarEvents: [
          {
            paymentId: "018f1a44-9093-7f55-a515-278f4d9bd992",
            kind: "DUE_DATE",
            title: "Payment due",
            date: "2026-06-15",
          },
        ],
      }),
    ).toThrow();
  });

  it("allows cleared core metadata fields and exposes a display title", () => {
    expect(
      DocumentMetadataUpdateRequestSchema.parse({
        title: null,
        sender: null,
        documentTypeId: null,
        documentDate: null,
      }),
    ).toEqual({
      title: null,
      sender: null,
      documentTypeId: null,
      documentDate: null,
    });

    expect(
      DocumentSummaryDtoSchema.parse({
        id: "018f1a44-9093-7f55-a515-278f4d9bd99f",
        tenant: {
          id: "018f1a44-9093-7f55-a515-278f4d9bd998",
          key: "default",
          name: "Default",
          isActive: true,
        },
        title: null,
        displayTitle: "invoice.pdf",
        originalFileName: "invoice.pdf",
        source: "UPLOAD",
        mimeType: "application/pdf",
        status: "READY",
        createdAt,
        updatedAt: createdAt,
        acceptedAt: null,
        acceptedById: null,
        aiProcessedAt: null,
        documentType: null,
        documentDate: null,
        summary: null,
        sender: null,
        recipient: null,
        note: null,
        fileSize: 1234,
        pageCount: 1,
        tags: [],
        thumbnailUrl: null,
        calendarEventKinds: [],
      }).displayTitle,
    ).toBe("invoice.pdf");
  });

  it("validates dashboard summary contracts", () => {
    expect(
      DashboardSummaryDtoSchema.parse({
        generatedAt: createdAt,
        kpis: {
          inboxTotal: 2,
          inboxReady: 1,
          dueThisWeek: 3,
          overdue: 0,
          openPaymentCount: 1,
          openPaymentTotals: [{ currency: "EUR", amount: 120.5 }],
          failedProcessing: 1,
          failedOcr: 1,
          missingMetadata: 4,
        },
        dateEntries: {
          overdue: [
            {
              id: "018f1a44-9093-7f55-a515-278f4d9bd991",
              tenant,
              documentId: "018f1a44-9093-7f55-a515-278f4d9bd99f",
              documentTitle: "Invoice",
              documentSender: "Sender GmbH",
              kind: "APPOINTMENT",
              title: "Past appointment",
              date: "2026-05-20",
              time: "09:00",
              isOverdue: true,
              assignedTo: null,
            },
          ],
          upcoming: [
            {
              id: "018f1a44-9093-7f55-a515-278f4d9bd992",
              paymentId: "018f1a44-9093-7f55-a515-278f4d9bd993",
              tenant,
              documentId: "018f1a44-9093-7f55-a515-278f4d9bd99f",
              documentTitle: "Invoice",
              documentSender: "Sender GmbH",
              kind: "DUE_DATE",
              title: "Payment due",
              date: "2026-05-29",
              time: null,
              isOverdue: false,
              assignedTo: null,
            },
          ],
        },
        payments: {
          overdue: [],
          upcoming: [
            {
              id: "018f1a44-9093-7f55-a515-278f4d9bd993",
              calendarEventId: "018f1a44-9093-7f55-a515-278f4d9bd992",
              tenant,
              documentId: "018f1a44-9093-7f55-a515-278f4d9bd99f",
              documentTitle: "Invoice",
              documentSender: "Sender GmbH",
              recipient: "Sender GmbH",
              purpose: "R-100",
              dueDate: "2026-05-29",
              amount: 120.5,
              currency: "EUR",
              isOverdue: false,
              assignedTo: null,
            },
          ],
        },
        combinedEntries: [
          {
            id: "combined-018f1a44-9093-7f55-a515-278f4d9bd99f-2026-05-29",
            tenant,
            documentId: "018f1a44-9093-7f55-a515-278f4d9bd99f",
            documentTitle: "Invoice",
            documentSender: "Sender GmbH",
            date: "2026-05-29",
            isOverdue: false,
            dateEntries: [
              {
                id: "018f1a44-9093-7f55-a515-278f4d9bd992",
                paymentId: "018f1a44-9093-7f55-a515-278f4d9bd993",
                tenant,
                documentId: "018f1a44-9093-7f55-a515-278f4d9bd99f",
                documentTitle: "Invoice",
                documentSender: "Sender GmbH",
                kind: "DUE_DATE",
                title: "Payment due",
                date: "2026-05-29",
                time: null,
                isOverdue: false,
                assignedTo: null,
              },
            ],
            payments: [
              {
                id: "018f1a44-9093-7f55-a515-278f4d9bd993",
                calendarEventId: "018f1a44-9093-7f55-a515-278f4d9bd992",
                tenant,
                documentId: "018f1a44-9093-7f55-a515-278f4d9bd99f",
                documentTitle: "Invoice",
                documentSender: "Sender GmbH",
                recipient: "Sender GmbH",
                purpose: "R-100",
                dueDate: "2026-05-29",
                amount: 120.5,
                currency: "EUR",
                isOverdue: false,
                assignedTo: null,
              },
            ],
          },
        ],
        inboxOverview: {
          ready: 1,
          open: 1,
          total: 2,
        },
        aiWorkers: {
          connected: 1,
          total: 2,
        },
        facts: {
          documents: 12,
          users: 3,
          openPayments: 1,
          openDateEntries: 2,
          inbox: {
            ready: 1,
            open: 1,
            total: 2,
          },
          emails: {
            accounts: 1,
            processed: 1,
            open: 1,
            total: 2,
          },
          aiWorkers: {
            connected: 1,
            total: 2,
          },
        },
        actionItems: [
          {
            id: "inbox-ready-doc",
            type: "INBOX_READY",
            priority: "MEDIUM",
            tenant,
            documentId: "018f1a44-9093-7f55-a515-278f4d9bd99f",
            title: "Invoice",
            subtitle: null,
            dueDate: null,
            amount: null,
            currency: null,
            status: "READY",
            createdAt,
          },
        ],
        upcomingEvents: [
          {
            id: "018f1a44-9093-7f55-a515-278f4d9bd991",
            tenant,
            documentId: "018f1a44-9093-7f55-a515-278f4d9bd99f",
            documentTitle: "Invoice",
            documentSender: "Sender GmbH",
            kind: "DUE_DATE",
            title: "Payment due",
            date: "2026-05-29",
            time: null,
            isOverdue: false,
          },
        ],
        recentDocuments: [
          {
            id: "018f1a44-9093-7f55-a515-278f4d9bd99f",
            tenant,
            title: "Invoice",
            source: "UPLOAD",
            status: "READY",
            createdAt,
            acceptedAt: null,
            documentDate: null,
          },
        ],
        processingHealth: {
          waitingJobs: 1,
          activeJobs: 2,
          failedJobs: 3,
          failedOcrJobs: 1,
          aiProvidersAvailable: 1,
          aiProvidersTotal: 2,
          emailSyncErrors: [],
          tenantBreakdown: [],
        },
      }).kpis.openPaymentTotals[0].amount,
    ).toBe(120.5);
  });

  it("validates document field definitions with scoped document types", () => {
    expect(
      CreateDocumentFieldDefinitionRequestSchema.parse({
        key: "costCenter",
        label: "Cost center",
        valueType: "TEXT",
        appliesToAllDocumentTypes: false,
        documentTypeIds: ["018f1a44-9093-7f55-a515-278f4d9bd991"],
        includeInFullTextSearch: true,
        includeInAiExtraction: false,
      }).documentTypeIds,
    ).toHaveLength(1);

    expect(() =>
      CreateDocumentFieldDefinitionRequestSchema.parse({
        key: "costCenter",
        label: "Cost center",
        valueType: "TEXT",
        appliesToAllDocumentTypes: false,
        documentTypeIds: [],
      }),
    ).toThrow();
  });

  it("validates AI provider management contracts", () => {
    const model = {
      name: "qwen3:8b",
      model: "qwen3:8b",
      createdAt,
      ownedBy: "library",
    };

    expect(
      AiProviderDtoSchema.parse({
        id: providerId,
        name: "Local Ollama",
        type: "OPENAI_COMPATIBLE",
        baseUrl: "http://localhost:11434/v1",
        selectedModel: model.name,
        selectedMetadataModel: model.name,
        priority: 1,
        isActive: true,
        status: "AVAILABLE",
        lastCheckedAt: createdAt,
        lastError: null,
        availableModels: [model],
        hasApiKey: false,
        createdAt,
        updatedAt: createdAt,
        isAvailable: true,
      }).availableModels[0].name,
    ).toBe(model.name);
    expect(
      LoadAiProviderModelsRequestSchema.parse({
        baseUrl: "http://localhost:11434/v1",
        apiKey: "secret",
      }).baseUrl,
    ).toBe("http://localhost:11434/v1");
    expect(
      AiProviderModelsResponseSchema.parse({
        models: [model],
      }).models[0].name,
    ).toBe(model.name);
    expect(
      CreateAiProviderRequestSchema.parse({
        name: "Local Ollama",
        baseUrl: "http://localhost:11434/v1",
        selectedMetadataModel: model.name,
      }).selectedMetadataModel,
    ).toBe(model.name);
    expect(() =>
      CreateAiProviderRequestSchema.parse({
        name: "Local Ollama",
        baseUrl: "http://localhost:11434/v1",
      }),
    ).toThrow();
    expect(
      UpdateAiProviderRequestSchema.parse({
        isActive: false,
      }).isActive,
    ).toBe(false);
    expect(() => UpdateAiProviderRequestSchema.parse({})).toThrow();
    expect(
      ReorderAiProvidersRequestSchema.parse({
        providerIds: [providerId],
      }).providerIds,
    ).toEqual([providerId]);
  });

  it("validates realtime notification messages", () => {
    expect(REALTIME_NAMESPACE).toBe("/realtime");
    expect(NOTIFICATIONS_SNAPSHOT_EVENT).toBe("notifications.snapshot");
    expect(NOTIFICATIONS_CREATED_EVENT).toBe("notifications.created");
    expect(RealtimeNotificationTypeSchema.options).toContain("ocr.completed");
    expect(RealtimeNotificationTypeSchema.options).toContain(
      "document.status_changed",
    );
    expect(RealtimeNotificationTypeSchema.options).toContain(
      "document.reprocess_queued",
    );
    expect(RealtimeNotificationTypeSchema.options).toContain(
      "document.archived",
    );
    expect(RealtimeNotificationTypeSchema.options).toContain(
      "document.moved_to_inbox",
    );
    expect(RealtimeNotificationTypeSchema.options).toContain(
      "document.deleted",
    );
    expect(RealtimeNotificationTypeSchema.options).toContain("ai.started");
    expect(RealtimeNotificationTypeSchema.options).toContain("ai.failed");
    expect(RealtimeNotificationTypeSchema.options).toContain("ai.queued");
    expect(RealtimeNotificationTypeSchema.options).toContain("ai.bulk_queued");
    expect(RealtimeNotificationTypeSchema.options).toContain(
      "ai.field_update_queued",
    );
    expect(RealtimeNotificationTypeSchema.options).toContain(
      "ai.metadata_updated",
    );

    const parsed = RealtimeNotificationDtoSchema.parse({
      id: "018f1a44-9093-7f55-a515-278f4d9bd99f",
      type: "ocr.completed",
      severity: "success",
      createdAt,
      documentId: "018f1a44-9093-7f55-a515-278f4d9bd99f",
      documentTitle: "Invoice",
      jobId: "018f1a44-9093-7f55-a515-278f4d9bd990",
      status: "READY",
      documentCount: 2,
      targetTenantName: "Archive",
    });

    expect(parsed.status).toBe("READY");
    expect(parsed.documentCount).toBe(2);
    expect(parsed.targetTenantName).toBe("Archive");
    expect(() =>
      RealtimeNotificationDtoSchema.parse({
        ...parsed,
        severity: "critical",
      }),
    ).toThrow();
  });

  it("validates realtime domain events", () => {
    expect(DOCUMENT_CHANGED_EVENT).toBe("document.changed");
    expect(AI_PROVIDER_CHANGED_EVENT).toBe("ai.provider.changed");

    const documentEvent = RealtimeDocumentChangedEventSchema.parse({
      type: DOCUMENT_CHANGED_EVENT,
      documentId: "018f1a44-9093-7f55-a515-278f4d9bd99f",
      tenantId: tenant.id,
      status: "AI_RUNNING",
      jobId: "018f1a44-9093-7f55-a515-278f4d9bd990",
      reason: "AI_STARTED",
      changedAt: createdAt,
    });

    expect(documentEvent.reason).toBe("AI_STARTED");
    expect(
      RealtimeDocumentChangedEventSchema.parse({
        type: DOCUMENT_CHANGED_EVENT,
        documentId: "018f1a44-9093-7f55-a515-278f4d9bd99f",
        tenantId: tenant.id,
        status: "READY",
        reason: "DOCUMENT_MOVED_TO_TENANT",
        changedAt: createdAt,
      }).reason,
    ).toBe("DOCUMENT_MOVED_TO_TENANT");
    expect(
      RealtimeDocumentChangedEventSchema.parse({
        type: DOCUMENT_CHANGED_EVENT,
        documentId: "018f1a44-9093-7f55-a515-278f4d9bd99f",
        tenantId: tenant.id,
        status: "READY",
        reason: "DOCUMENT_MOVED_TO_INBOX",
        changedAt: createdAt,
      }).reason,
    ).toBe("DOCUMENT_MOVED_TO_INBOX");
    expect(RealtimeDomainEventSchema.parse(documentEvent).type).toBe(
      DOCUMENT_CHANGED_EVENT,
    );

    const providerEvent = RealtimeAiProviderChangedEventSchema.parse({
      type: AI_PROVIDER_CHANGED_EVENT,
      providerId,
      action: "UPSERT",
      reason: "PROVIDER_HEALTH_CHANGED",
      changedAt: createdAt,
      provider: {
        id: providerId,
        name: "Local Ollama",
        type: "OPENAI_COMPATIBLE",
        baseUrl: "http://localhost:11434/v1",
        selectedModel: "qwen3:8b",
        selectedMetadataModel: "qwen3:8b",
        priority: 1,
        isActive: true,
        status: "AVAILABLE",
        lastCheckedAt: createdAt,
        lastError: null,
        availableModels: [],
        hasApiKey: false,
        createdAt,
        updatedAt: createdAt,
        isAvailable: true,
      },
    });

    expect(providerEvent.provider?.status).toBe("AVAILABLE");
    expect(
      RealtimeAiProviderChangedEventSchema.parse({
        type: AI_PROVIDER_CHANGED_EVENT,
        providerId,
        action: "DELETE",
        reason: "PROVIDER_DELETED",
        changedAt: createdAt,
      }).action,
    ).toBe("DELETE");
  });

  it("validates document history events", () => {
    expect(DocumentHistoryEventTypeSchema.options).toContain(
      "DOCUMENT_METADATA_UPDATED",
    );
    expect(DocumentHistoryEventTypeSchema.options).toContain(
      "OCR_PROCESSING_COMPLETED",
    );
    expect(DocumentHistoryEventTypeSchema.options).toContain(
      "DOCUMENT_MOVED_TO_INBOX",
    );
    expect(DocumentHistoryEventTypeSchema.options).toContain(
      "DOCUMENT_MOVED_TO_TENANT",
    );

    const event = DocumentHistoryEventDtoSchema.parse({
      id: "018f1a44-9093-7f55-a515-278f4d9bd99f",
      documentId: "018f1a44-9093-7f55-a515-278f4d9bd99f",
      type: "DOCUMENT_METADATA_UPDATED",
      summary: "Metadata changed.",
      actor: {
        id: "018f1a44-9093-7f55-a515-278f4d9bd990",
        username: "admin",
        displayName: "Admin",
      },
      changes: [
        {
          field: "title",
          label: "Title",
          oldValue: "Alt",
          newValue: "New",
        },
      ],
      metadata: { status: "READY" },
      createdAt,
    });

    expect(event.changes[0].newValue).toBe("New");
    expect(
      DocumentHistoryResponseSchema.parse({
        items: [event],
        meta: {
          page: 1,
          pageSize: 100,
          totalItems: 1,
          totalPages: 1,
        },
      }).items,
    ).toHaveLength(1);
  });

  it("validates moving an inbox document to another tenant", () => {
    expect(
      MoveDocumentToTenantRequestSchema.parse({
        targetTenantId: "018f1a44-9093-7f55-a515-278f4d9bd990",
      }),
    ).toEqual({
      targetTenantId: "018f1a44-9093-7f55-a515-278f4d9bd990",
    });
    expect(() => MoveDocumentToTenantRequestSchema.parse({})).toThrow();
    expect(() =>
      MoveDocumentToTenantRequestSchema.parse({ targetTenantId: "tenant" }),
    ).toThrow();
  });
});
