import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DocumentHistoryChangeDtoSchema,
  type DocumentHistoryChangeDto,
  type DocumentHistoryChangeValue,
  type DocumentHistoryEventDto,
  type DocumentHistoryEventType,
  type DocumentHistoryResponse,
  type PaginationRequest,
} from '@smart-dms/shared-dto';
import { PrismaService } from '../prisma/prisma.service';

const MAX_SUMMARY_LENGTH = 500;
const MAX_FIELD_LENGTH = 100;
const MAX_LABEL_LENGTH = 120;
const MAX_VALUE_LENGTH = 300;
const MAX_ARRAY_VALUES = 50;
const MAX_METADATA_KEYS = 30;
const MAX_METADATA_DEPTH = 2;

type DocumentHistoryWriteClient = Pick<
  Prisma.TransactionClient,
  'documentHistoryEvent'
>;
type SanitizedJsonValue = Prisma.InputJsonValue | null;

interface HistoryEventWithActor {
  id: string;
  documentId: string;
  type: DocumentHistoryEventType;
  summary: string;
  changes: Prisma.JsonValue | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  actorUser: {
    id: string;
    username: string;
    displayName: string;
  } | null;
}

export interface DocumentHistoryRecordInput {
  documentId: string;
  type: DocumentHistoryEventType;
  summary: string;
  actorUserId?: string;
  changes?: DocumentHistoryChangeDto[];
  metadata?: Record<string, unknown>;
}

@Injectable()
export class DocumentHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: DocumentHistoryRecordInput,
    client: DocumentHistoryWriteClient = this.prisma,
  ): Promise<DocumentHistoryEventDto> {
    const changes = this.normalizeChanges(input.changes);
    const metadata = this.normalizeMetadata(input.metadata);
    const event = await client.documentHistoryEvent.create({
      data: {
        documentId: input.documentId,
        actorUserId: input.actorUserId,
        type: input.type,
        summary: this.truncate(
          input.summary.trim() || 'History entry',
          MAX_SUMMARY_LENGTH,
        ),
        changes: changes.length
          ? (changes as unknown as Prisma.InputJsonValue)
          : undefined,
        metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
      },
      include: {
        actorUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });

    return this.toDto(event);
  }

  async listForDocument(
    documentId: string,
    request: PaginationRequest,
  ): Promise<DocumentHistoryResponse> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true },
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    const offset = (request.page - 1) * request.pageSize;
    const [totalItems, events] = await Promise.all([
      this.prisma.documentHistoryEvent.count({
        where: { documentId },
      }),
      this.prisma.documentHistoryEvent.findMany({
        where: { documentId },
        include: {
          actorUser: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: offset,
        take: request.pageSize,
      }),
    ]);

    return {
      items: events.map((event) => this.toDto(event as HistoryEventWithActor)),
      meta: {
        page: request.page,
        pageSize: request.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / request.pageSize),
      },
    };
  }

  private toDto(event: HistoryEventWithActor): DocumentHistoryEventDto {
    return {
      id: event.id,
      documentId: event.documentId,
      type: event.type,
      summary: event.summary,
      actor: event.actorUser
        ? {
            id: event.actorUser.id,
            username: event.actorUser.username,
            displayName: event.actorUser.displayName,
          }
        : null,
      changes: this.parseChanges(event.changes),
      metadata: this.parseMetadata(event.metadata),
      createdAt: event.createdAt.toISOString(),
    };
  }

  private normalizeChanges(
    changes: DocumentHistoryChangeDto[] | undefined,
  ): DocumentHistoryChangeDto[] {
    return (changes ?? [])
      .map((change) => ({
        field: this.truncate(change.field.trim(), MAX_FIELD_LENGTH),
        label: this.truncate(change.label.trim(), MAX_LABEL_LENGTH),
        oldValue: this.normalizeChangeValue(change.oldValue),
        newValue: this.normalizeChangeValue(change.newValue),
      }))
      .filter((change) => change.field.length > 0 && change.label.length > 0);
  }

  private normalizeChangeValue(
    value: DocumentHistoryChangeValue,
  ): DocumentHistoryChangeValue {
    if (value === null || typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : String(value);
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, MAX_ARRAY_VALUES)
        .map((entry) => this.truncate(String(entry), MAX_VALUE_LENGTH));
    }

    return this.truncate(value, MAX_VALUE_LENGTH);
  }

  private normalizeMetadata(
    metadata: Record<string, unknown> | undefined,
  ): Record<string, SanitizedJsonValue> | undefined {
    if (!metadata) {
      return undefined;
    }

    const normalized: Record<string, SanitizedJsonValue> = {};
    for (const [key, value] of Object.entries(metadata).slice(
      0,
      MAX_METADATA_KEYS,
    )) {
      const normalizedKey = this.truncate(key.trim(), MAX_FIELD_LENGTH);
      if (normalizedKey.length === 0) {
        continue;
      }
      normalized[normalizedKey] = this.normalizeJsonValue(value);
    }

    return Object.keys(normalized).length ? normalized : undefined;
  }

  private normalizeJsonValue(value: unknown, depth = 0): SanitizedJsonValue {
    if (value === null || typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      return this.truncate(value, MAX_VALUE_LENGTH);
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : String(value);
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, MAX_ARRAY_VALUES)
        .map((entry) => this.normalizeJsonValue(entry, depth + 1));
    }

    if (typeof value === 'object' && depth < MAX_METADATA_DEPTH) {
      const normalized: Record<string, SanitizedJsonValue> = {};
      for (const [key, nestedValue] of Object.entries(value).slice(
        0,
        MAX_METADATA_KEYS,
      )) {
        const normalizedKey = this.truncate(key.trim(), MAX_FIELD_LENGTH);
        if (normalizedKey.length > 0) {
          normalized[normalizedKey] = this.normalizeJsonValue(
            nestedValue,
            depth + 1,
          );
        }
      }
      return normalized;
    }

    if (typeof value === 'object') {
      return '[Object]';
    }

    if (typeof value === 'bigint') {
      return this.truncate(value.toString(), MAX_VALUE_LENGTH);
    }

    if (typeof value === 'symbol') {
      return this.truncate(value.description ?? 'Symbol', MAX_VALUE_LENGTH);
    }

    return null;
  }

  private parseChanges(
    value: Prisma.JsonValue | null,
  ): DocumentHistoryChangeDto[] {
    const parsed = DocumentHistoryChangeDtoSchema.array().safeParse(value);
    return parsed.success ? parsed.data : [];
  }

  private parseMetadata(
    value: Prisma.JsonValue | null,
  ): Record<string, unknown> | null {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      return null;
    }

    return value;
  }

  private truncate(value: string, length: number): string {
    return value.length > length ? value.slice(0, length) : value;
  }
}
