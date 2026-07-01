import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { RealtimeNotificationDto } from '@smart-dms/shared-dto';
import { NzMessageService, type NzMessageType } from 'ng-zorro-antd/message';
import { RealtimeClientService } from './realtime-client.service';

const MUTED_STORAGE_KEY = 'smart-dms-notifications-muted';
const HISTORY_WINDOW_MS = 5 * 60 * 1000;
const MAX_NOTIFICATIONS = 100;
const TOAST_DURATION_MS = 2500;
const WORKFLOW_REORDER_WINDOW_MS = 1000;
const SILENT_TOAST_NOTIFICATION_TYPES = new Set<RealtimeNotificationDto['type']>([
  'document.archived',
  'document.deleted',
  'document.moved_to_inbox',
  'document.moved_to_tenant',
]);
const WORKFLOW_NOTIFICATION_ORDER: Record<RealtimeNotificationDto['type'], number> = {
  'document.uploaded': 10,
  'document.scanner_ingested': 10,
  'document.status_changed': 10,
  'document.accepted': 15,
  'document.moved_to_inbox': 15,
  'document.moved_to_tenant': 15,
  'document.archived': 20,
  'document.deleted': 20,
  'ocr.started': 30,
  'ocr.completed': 40,
  'extraction.started': 45,
  'extraction.completed': 50,
  'extraction.failed': 55,
  'processing.failed': 60,
  'ai.started': 60,
  'ai.failed': 70,
  'ai.metadata_extracted': 80,
};

@Injectable({ providedIn: 'root' })
export class NotificationCenterService {
  private readonly messages = inject(NzMessageService);
  private readonly realtime = inject(RealtimeClientService);

  readonly notifications = signal<RealtimeNotificationDto[]>([]);
  readonly isConnected = this.realtime.isConnected;
  readonly isMuted = signal(this.loadMutedPreference());
  readonly lastSeenAt = signal(Date.now());
  readonly unreadCount = computed(() => {
    const seenAt = this.lastSeenAt();
    return this.notifications().filter(
      (notification) => Date.parse(notification.createdAt) > seenAt,
    ).length;
  });

  constructor() {
    effect(() => {
      const snapshot = this.realtime.notificationsSnapshot();
      if (snapshot) {
        untracked(() => this.replaceNotifications(snapshot.items));
      }
    });
    effect(() => {
      const notification = this.realtime.latestNotification();
      if (notification) {
        untracked(() => this.addNotification(notification));
      }
    });
  }

  setMuted(muted: boolean): void {
    this.isMuted.set(muted);

    if (muted) {
      localStorage.setItem(MUTED_STORAGE_KEY, 'true');
      return;
    }

    localStorage.removeItem(MUTED_STORAGE_KEY);
  }

  markSeen(): void {
    this.lastSeenAt.set(Date.now());
  }

  private replaceNotifications(items: RealtimeNotificationDto[]): void {
    this.notifications.set(this.normalizeNotifications(items));
  }

  private addNotification(notification: RealtimeNotificationDto): void {
    const isKnown = this.notifications().some((item) => item.id === notification.id);

    this.notifications.update((items) => this.normalizeNotifications([notification, ...items]));

    if (!isKnown) {
      this.showToast(notification);
    }
  }

  private normalizeNotifications(items: RealtimeNotificationDto[]): RealtimeNotificationDto[] {
    const minCreatedAt = Date.now() - HISTORY_WINDOW_MS;
    const uniqueById = new Map<string, RealtimeNotificationDto>();

    for (const item of items) {
      if (Date.parse(item.createdAt) >= minCreatedAt) {
        uniqueById.set(item.id, item);
      }
    }

    return [...uniqueById.values()]
      .sort(compareNotifications)
      .slice(0, MAX_NOTIFICATIONS);
  }

  private showToast(notification: RealtimeNotificationDto): void {
    if (this.isMuted() || SILENT_TOAST_NOTIFICATION_TYPES.has(notification.type)) {
      return;
    }

    this.messages.create(this.messageType(notification.severity), this.toastContent(notification), {
      nzDuration: TOAST_DURATION_MS,
    });
  }

  private messageType(severity: RealtimeNotificationDto['severity']): NzMessageType {
    switch (severity) {
      case 'success':
        return 'success';
      case 'warning':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'info';
    }
  }

  private toastContent(notification: RealtimeNotificationDto): string {
    return `${notification.title}: ${notification.message}`;
  }

  private loadMutedPreference(): boolean {
    return localStorage.getItem(MUTED_STORAGE_KEY) === 'true';
  }
}

function compareNotifications(
  left: RealtimeNotificationDto,
  right: RealtimeNotificationDto,
): number {
  const leftCreatedAt = Date.parse(left.createdAt);
  const rightCreatedAt = Date.parse(right.createdAt);
  const createdAtDelta = rightCreatedAt - leftCreatedAt;
  const leftVisibleSecond = visibleSecond(left.createdAt);
  const rightVisibleSecond = visibleSecond(right.createdAt);

  if (
    left.documentId &&
    left.documentId === right.documentId &&
    (leftVisibleSecond === rightVisibleSecond ||
      Math.abs(leftCreatedAt - rightCreatedAt) <= WORKFLOW_REORDER_WINDOW_MS)
  ) {
    const workflowDelta =
      WORKFLOW_NOTIFICATION_ORDER[left.type] - WORKFLOW_NOTIFICATION_ORDER[right.type];

    if (workflowDelta !== 0) {
      return workflowDelta;
    }
  }

  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  return left.id.localeCompare(right.id);
}

function visibleSecond(value: string): number {
  return Math.floor(Date.parse(value) / 1000);
}
