import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import type { RealtimeNotificationDto } from '@smart-dms/shared-dto';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NotificationCenterService } from './notification-center.service';
import { RealtimeClientService } from './realtime-client.service';
import { provideI18nTesting } from '../../testing/i18n-testing';

const messages = {
  create: vi.fn(),
};

const baseNotification: RealtimeNotificationDto = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd99f',
  type: 'ocr.completed' as const,
  severity: 'success' as const,
  createdAt: '2026-05-07T18:05:01.000Z',
  documentId: '018f1a44-9093-7f55-a515-278f4d9bd99f',
  documentTitle: 'Document',
  jobId: '018f1a44-9093-7f55-a515-278f4d9bd990',
  status: 'READY' as const,
};

describe('NotificationCenterService', () => {
  let notification: RealtimeNotificationDto;
  let realtime: {
    isConnected: ReturnType<typeof signal<boolean>>;
    notificationsSnapshot: ReturnType<typeof signal<{ items: RealtimeNotificationDto[] } | null>>;
    latestNotification: ReturnType<typeof signal<RealtimeNotificationDto | null>>;
  };

  beforeEach(() => {
    notification = {
      ...baseNotification,
      createdAt: new Date(Date.now() + 1000).toISOString(),
    };
    messages.create.mockClear();
    localStorage.removeItem('smart-dms-notifications-muted');
    realtime = {
      isConnected: signal(false),
      notificationsSnapshot: signal<{ items: RealtimeNotificationDto[] } | null>(null),
      latestNotification: signal<RealtimeNotificationDto | null>(null),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: NzMessageService, useValue: messages },
        { provide: RealtimeClientService, useValue: realtime },
        provideI18nTesting(),
      ],
    });
  });

  it('stores incoming notifications from the realtime client', () => {
    const service = TestBed.inject(NotificationCenterService);
    TestBed.flushEffects();

    realtime.latestNotification.set(notification);
    TestBed.flushEffects();

    expect(service.notifications()).toEqual([notification]);
    expect(service.unreadCount()).toBe(1);
    expect(messages.create).toHaveBeenCalledWith('success', 'OCR completed: Document is ready.', {
      nzDuration: 2500,
    });
  });

  it('loads snapshots and persists mute state locally without clearing the badge', () => {
    const service = TestBed.inject(NotificationCenterService);
    TestBed.flushEffects();

    realtime.notificationsSnapshot.set({
      items: [notification],
    });
    TestBed.flushEffects();
    service.setMuted(true);

    expect(service.notifications()).toEqual([notification]);
    expect(service.unreadCount()).toBe(1);
    expect(localStorage.getItem('smart-dms-notifications-muted')).toBe('true');

    service.setMuted(false);

    expect(localStorage.getItem('smart-dms-notifications-muted')).toBeNull();
  });

  it('renders toast messages in the active frontend language', () => {
    const service = TestBed.inject(NotificationCenterService);
    TestBed.inject(TranslateService).use('de').subscribe();
    TestBed.flushEffects();

    realtime.latestNotification.set(notification);
    TestBed.flushEffects();

    expect(messages.create).toHaveBeenCalledWith(
      'success',
      'OCR abgeschlossen: Document ist bereit.',
      { nzDuration: 2500 },
    );
    expect(service.notificationTitleKey(notification)).toBe(
      'notifications.events.ocrCompleted.title',
    );
  });

  it('does not show toasts while notifications are muted', () => {
    const service = TestBed.inject(NotificationCenterService);
    TestBed.flushEffects();

    service.setMuted(true);
    realtime.latestNotification.set(notification);
    TestBed.flushEffects();

    expect(service.notifications()).toEqual([notification]);
    expect(service.unreadCount()).toBe(1);
    expect(messages.create).not.toHaveBeenCalled();
  });

  it('stores document move and delete notifications without showing toasts', () => {
    const service = TestBed.inject(NotificationCenterService);
    const silentNotifications: RealtimeNotificationDto[] = [
      { ...notification, id: `${notification.id}-inbox`, type: 'document.moved_to_inbox' },
      { ...notification, id: `${notification.id}-archive`, type: 'document.archived' },
      { ...notification, id: `${notification.id}-delete`, type: 'document.deleted' },
    ];
    TestBed.flushEffects();

    for (const silentNotification of silentNotifications) {
      realtime.latestNotification.set(silentNotification);
      TestBed.flushEffects();
    }

    expect(new Set(service.notifications().map((item) => item.type))).toEqual(
      new Set(['document.archived', 'document.deleted', 'document.moved_to_inbox']),
    );
    expect(messages.create).not.toHaveBeenCalled();
  });

  it('orders same-second document workflow notifications by pipeline sequence', () => {
    const service = TestBed.inject(NotificationCenterService);
    const visibleSecondMs = Math.floor((Date.now() + 2000) / 1000) * 1000;
    const scannerNotification: RealtimeNotificationDto = {
      ...baseNotification,
      id: '018f1a44-9093-7f55-a515-278f4d9bd991',
      type: 'document.scanner_ingested',
      severity: 'info',
      createdAt: new Date(visibleSecondMs + 100).toISOString(),
      status: 'OCR_PENDING',
    };
    const ocrStartedNotification: RealtimeNotificationDto = {
      ...baseNotification,
      id: '018f1a44-9093-7f55-a515-278f4d9bd992',
      type: 'ocr.started',
      severity: 'info',
      createdAt: new Date(visibleSecondMs + 800).toISOString(),
      status: 'OCR_RUNNING',
    };
    TestBed.flushEffects();

    realtime.notificationsSnapshot.set({
      items: [ocrStartedNotification, scannerNotification],
    });
    TestBed.flushEffects();

    expect(service.notifications().map((item) => item.type)).toEqual([
      'document.scanner_ingested',
      'ocr.started',
    ]);
  });

  it('orders near-simultaneous OCR completion before AI metadata start across visible seconds', () => {
    const service = TestBed.inject(NotificationCenterService);
    const visibleSecondMs = Math.floor((Date.now() + 2000) / 1000) * 1000;
    const ocrCompletedNotification: RealtimeNotificationDto = {
      ...baseNotification,
      id: '018f1a44-9093-7f55-a515-278f4d9bd993',
      type: 'ocr.completed',
      severity: 'success',
      createdAt: new Date(visibleSecondMs + 950).toISOString(),
      status: 'READY',
    };
    const aiStartedNotification: RealtimeNotificationDto = {
      ...baseNotification,
      id: '018f1a44-9093-7f55-a515-278f4d9bd994',
      type: 'ai.started',
      severity: 'info',
      createdAt: new Date(visibleSecondMs + 1050).toISOString(),
      status: 'READY',
    };
    TestBed.flushEffects();

    realtime.notificationsSnapshot.set({
      items: [aiStartedNotification, ocrCompletedNotification],
    });
    TestBed.flushEffects();

    expect(service.notifications().map((item) => item.type)).toEqual([
      'ocr.completed',
      'ai.started',
    ]);
  });

  it('orders near-simultaneous document status changes before OCR start across visible seconds', () => {
    const service = TestBed.inject(NotificationCenterService);
    const visibleSecondMs = Math.floor((Date.now() + 2000) / 1000) * 1000;
    const statusChangedNotification: RealtimeNotificationDto = {
      ...baseNotification,
      id: '018f1a44-9093-7f55-a515-278f4d9bd995',
      type: 'document.reprocess_queued',
      severity: 'info',
      createdAt: new Date(visibleSecondMs + 950).toISOString(),
      status: 'OCR_PENDING',
    };
    const ocrStartedNotification: RealtimeNotificationDto = {
      ...baseNotification,
      id: '018f1a44-9093-7f55-a515-278f4d9bd996',
      type: 'ocr.started',
      severity: 'info',
      createdAt: new Date(visibleSecondMs + 1050).toISOString(),
      status: 'OCR_RUNNING',
    };
    TestBed.flushEffects();

    realtime.notificationsSnapshot.set({
      items: [ocrStartedNotification, statusChangedNotification],
    });
    TestBed.flushEffects();

    expect(service.notifications().map((item) => item.type)).toEqual([
      'document.reprocess_queued',
      'ocr.started',
    ]);
  });

  it('keeps newest-first ordering for clearly separated workflow notifications', () => {
    const service = TestBed.inject(NotificationCenterService);
    const visibleSecondMs = Math.floor((Date.now() + 2000) / 1000) * 1000;
    const statusChangedNotification: RealtimeNotificationDto = {
      ...baseNotification,
      id: '018f1a44-9093-7f55-a515-278f4d9bd997',
      type: 'document.reprocess_queued',
      severity: 'info',
      createdAt: new Date(visibleSecondMs + 100).toISOString(),
      status: 'OCR_PENDING',
    };
    const ocrStartedNotification: RealtimeNotificationDto = {
      ...baseNotification,
      id: '018f1a44-9093-7f55-a515-278f4d9bd998',
      type: 'ocr.started',
      severity: 'info',
      createdAt: new Date(visibleSecondMs + 1600).toISOString(),
      status: 'OCR_RUNNING',
    };
    TestBed.flushEffects();

    realtime.notificationsSnapshot.set({
      items: [statusChangedNotification, ocrStartedNotification],
    });
    TestBed.flushEffects();

    expect(service.notifications().map((item) => item.type)).toEqual([
      'ocr.started',
      'document.reprocess_queued',
    ]);
  });
});
