import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  CalendarEventsRequestSchema,
  type CalendarEventsRequest,
} from '@smart-dms/shared-dto';
import { CurrentUser } from '../common/auth.decorators';
import type { AuthenticatedUser } from '../common/authenticated-user';
import {
  TENANT_SCOPE_HEADER,
  TenantScopeService,
} from '../tenants/tenant-scope.service';
import { CalendarService } from './calendar.service';

@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @Get('events')
  events(
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.calendarService.listEvents(
      normalizeCalendarEventsQuery(query),
      this.tenantScope.resolveFromHeader(
        user,
        request.headers[TENANT_SCOPE_HEADER],
      ).tenantIds,
    );
  }
}

function normalizeCalendarEventsQuery(
  query: Record<string, unknown>,
): CalendarEventsRequest {
  return CalendarEventsRequestSchema.parse({
    from: query.from,
    to: query.to,
    kinds: toArray(query.kinds ?? query.kind),
    documentId: query.documentId,
    includeArchived: toBoolean(query.includeArchived),
  });
}

function toArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => queryValueToString(entry).split(','))
      .filter(Boolean);
  }

  return queryValueToString(value).split(',').filter(Boolean);
}

function queryValueToString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return value === true || value === 'true';
}
