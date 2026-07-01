import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import type { DocumentCalendarEventDto } from '@smart-dms/shared-dto';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { LanguageService } from '../../core/i18n/language.service';
import {
  calendarEventColor,
  calendarEventKindLabelKey,
} from '../presentation/calendar-presentation';

type CalendarEventCardAppearance = 'card' | 'plain';

@Component({
  selector: 'app-calendar-event-card',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslatePipe,
    NzIconModule,
    NzTagModule,
    NzTooltipModule,
  ],
  template: `
    <ng-template #cardContent>
      @if (showSender()) {
        <header class="calendar-event-card__header">
          @if (visibleSender(); as sender) {
            <span
              class="calendar-event-card__sender"
              data-testid="calendar-event-card-sender"
              nz-tooltip
              [nzTooltipTitle]="'documents.table.sender' | translate"
              [attr.aria-label]="('documents.table.sender' | translate) + ': ' + sender"
            >
              <span nz-icon nzType="user" aria-hidden="true"></span>
              <span class="calendar-event-card__sender-label">{{ sender }}</span>
            </span>
          }
          <ng-container [ngTemplateOutlet]="kindBadge"></ng-container>
        </header>
      }

      <div class="calendar-event-card__title-row">
        <strong class="calendar-event-card__title" data-testid="calendar-event-card-title">
          {{ event().title }}
        </strong>
        @if (!showSender()) {
          <ng-container [ngTemplateOutlet]="kindBadge"></ng-container>
        }
      </div>

      <footer class="calendar-event-card__footer">
        <time
          class="calendar-event-card__date"
          data-testid="calendar-event-card-date"
          [attr.datetime]="event().date"
          [attr.aria-label]="('documents.table.date' | translate) + ': ' + dateLabel()"
        >
          {{ dateLabel() }}
        </time>
        @if (event().time) {
          <time
            class="calendar-event-card__time"
            data-testid="calendar-event-card-time"
            [attr.datetime]="event().time"
          >
            {{ event().time }}
          </time>
        } @else {
          <span class="calendar-event-card__time" data-testid="calendar-event-card-time">
            {{ 'calendar.allDay' | translate }}
          </span>
        }
      </footer>
    </ng-template>

    <ng-template #kindBadge>
      <span class="calendar-event-card__kinds">
        @if (event().paymentId) {
          <nz-tag class="calendar-event-card__kind" nzColor="blue">
            {{ 'dashboard.paymentTag' | translate }}
          </nz-tag>
        }
        <nz-tag class="calendar-event-card__kind" [nzColor]="eventColor()">
          {{ calendarEventKindLabelKey(event().kind) | translate }}
        </nz-tag>
      </span>
    </ng-template>

    @if (linkToDocument()) {
      <a
        class="calendar-event-card"
        [class.calendar-event-card--plain]="isPlain()"
        [routerLink]="['/documents', event().documentId]"
        [title]="event().title"
      >
        <ng-container [ngTemplateOutlet]="cardContent"></ng-container>
      </a>
    } @else {
      <article
        class="calendar-event-card"
        [class.calendar-event-card--plain]="isPlain()"
        [attr.aria-label]="event().title"
      >
        <ng-container [ngTemplateOutlet]="cardContent"></ng-container>
      </article>
    }
  `,
  styleUrl: './calendar-event-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarEventCardComponent {
  private readonly language = inject(LanguageService);

  readonly event = input.required<DocumentCalendarEventDto>();
  readonly showSender = input(false);
  readonly linkToDocument = input(false);
  readonly appearance = input<CalendarEventCardAppearance>('card');

  readonly isPlain = computed(() => this.appearance() === 'plain');
  readonly visibleSender = computed(() => {
    if (!this.showSender()) {
      return null;
    }

    const sender = this.event().documentSender?.trim();
    return sender ? sender : null;
  });
  readonly dateLabel = computed(() =>
    formatCalendarEventDate(this.event().date, this.language.currentLocale()),
  );
  readonly eventColor = computed(() => calendarEventColor(this.event().kind));
  readonly calendarEventKindLabelKey = calendarEventKindLabelKey;
}

function formatCalendarEventDate(value: string, locale: string): string {
  const date = parseIsoDate(value);

  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  return Number.isNaN(date.getTime()) ? null : date;
}
