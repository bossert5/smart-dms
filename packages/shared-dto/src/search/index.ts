import { z } from "zod";
import {
  IsoDateTimeSchema,
  PaginationMetaSchema,
  PaginationRequestSchema,
  SortDirectionSchema,
  UuidSchema,
} from "../common";
import {
  DocumentTypeDtoSchema,
  DocumentSourceSchema,
  DocumentStatusSchema,
  DocumentSummaryDtoSchema,
  TagDtoSchema,
} from "../documents";

export const DocumentSearchSortBySchema = z.enum([
  "relevance",
  "createdAt",
  "updatedAt",
  "documentDate",
  "title",
  "status",
  "documentType",
  "sender",
]);
export type DocumentSearchSortBy = z.infer<typeof DocumentSearchSortBySchema>;

export const DocumentSearchFieldSchema = z.enum([
  "title",
  "content",
  "sender",
  "tags",
]);
export type DocumentSearchField = z.infer<typeof DocumentSearchFieldSchema>;

export const DocumentSearchFiltersSchema = z.object({
  statuses: z.array(DocumentStatusSchema).optional(),
  sources: z.array(DocumentSourceSchema).optional(),
  createdFrom: IsoDateTimeSchema.optional(),
  createdTo: IsoDateTimeSchema.optional(),
  documentDateFrom: IsoDateTimeSchema.optional(),
  documentDateTo: IsoDateTimeSchema.optional(),
  visibleDateFrom: IsoDateTimeSchema.optional(),
  visibleDateTo: IsoDateTimeSchema.optional(),
  sender: z.string().optional(),
  senders: z.array(z.string().trim().min(1)).optional(),
  recipient: z.string().optional(),
  tags: z.array(z.string().min(1)).optional(),
  tagNames: z.array(z.string().trim().min(1)).optional(),
  documentTypeIds: z.array(UuidSchema).optional(),
  includeArchived: z.boolean().optional(),
});
export type DocumentSearchFilters = z.infer<typeof DocumentSearchFiltersSchema>;

export const DocumentSearchRequestSchema = PaginationRequestSchema.extend({
  query: z.string().trim().max(500).optional(),
  searchFields: z
    .array(DocumentSearchFieldSchema)
    .min(1)
    .default(["title", "content", "sender", "tags"]),
  filters: DocumentSearchFiltersSchema.optional(),
  sortBy: DocumentSearchSortBySchema.default("documentDate"),
  sortDirection: SortDirectionSchema.default("desc"),
});
export type DocumentSearchRequest = z.infer<typeof DocumentSearchRequestSchema>;

export const DocumentSearchResponseSchema = z.object({
  items: z.array(DocumentSummaryDtoSchema),
  meta: PaginationMetaSchema,
});
export type DocumentSearchResponse = z.infer<
  typeof DocumentSearchResponseSchema
>;

export const DocumentSearchFacetsResponseSchema = z.object({
  tags: z.array(TagDtoSchema),
  senders: z.array(z.string().trim().min(1)),
  documentTypes: z.array(DocumentTypeDtoSchema),
});
export type DocumentSearchFacetsResponse = z.infer<
  typeof DocumentSearchFacetsResponseSchema
>;
