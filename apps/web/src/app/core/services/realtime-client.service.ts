import { effect, inject, Injectable, signal } from '@angular/core';
import {
  AI_PROVIDER_CHANGED_EVENT,
  DOCUMENT_CHANGED_EVENT,
  EDIT_LOCK_CHANGED_EVENT,
  NOTIFICATIONS_CREATED_EVENT,
  NOTIFICATIONS_SNAPSHOT_EVENT,
  REALTIME_NAMESPACE,
  RealtimeAiProviderChangedEventSchema,
  RealtimeDocumentChangedEventSchema,
  RealtimeEditLockChangedEventSchema,
  RealtimeNotificationDtoSchema,
  RealtimeNotificationsSnapshotSchema,
} from '@smart-dms/shared-dto';
import type {
  RealtimeAiProviderChangedEvent,
  RealtimeDocumentChangedEvent,
  RealtimeEditLockChangedEvent,
  RealtimeNotificationDto,
  RealtimeNotificationsSnapshot,
} from '@smart-dms/shared-dto';
import { io, type Socket } from 'socket.io-client';
import { ApiUrlService } from '../api/api-url.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class RealtimeClientService {
  private readonly auth = inject(AuthService);
  private readonly urls = inject(ApiUrlService);
  private socket: Socket | null = null;
  private socketToken: string | null = null;
  private isRefreshing = false;

  readonly isConnected = signal(false);
  readonly socketId = signal<string | null>(null);
  readonly connectionRevision = signal(0);
  readonly latestNotification = signal<RealtimeNotificationDto | null>(null);
  readonly notificationsSnapshot = signal<RealtimeNotificationsSnapshot | null>(null);
  readonly latestDocumentChange = signal<RealtimeDocumentChangedEvent | null>(null);
  readonly latestAiProviderChange = signal<RealtimeAiProviderChangedEvent | null>(null);
  readonly latestEditLockChange = signal<RealtimeEditLockChangedEvent | null>(null);

  constructor() {
    effect(() => {
      const accessToken = this.auth.accessToken();
      const isAuthenticated = this.auth.isAuthenticated();

      if (accessToken && isAuthenticated) {
        this.connect(accessToken);
        return;
      }

      this.disconnect();
    });
  }

  private connect(accessToken: string): void {
    if (this.socket && this.socketToken === accessToken) {
      return;
    }

    this.disconnect();
    this.socketToken = accessToken;
    this.socket = io(this.realtimeUrl(), {
      transports: ['websocket'],
      auth: { accessToken },
      withCredentials: true,
      reconnection: true,
    });

    this.socket.on('connect', () => {
      this.isConnected.set(true);
      this.socketId.set(this.socket?.id ?? null);
      this.connectionRevision.update((revision) => revision + 1);
    });
    this.socket.on('disconnect', () => {
      this.isConnected.set(false);
      this.socketId.set(null);
    });
    this.socket.on('connect_error', (error) => {
      this.isConnected.set(false);
      if (error.message === 'Unauthorized') {
        this.refreshSession();
      }
    });
    this.socket.on(NOTIFICATIONS_SNAPSHOT_EVENT, (payload: unknown) => {
      const parsed = RealtimeNotificationsSnapshotSchema.safeParse(payload);
      if (parsed.success) {
        this.notificationsSnapshot.set(parsed.data);
      }
    });
    this.socket.on(NOTIFICATIONS_CREATED_EVENT, (payload: unknown) => {
      const parsed = RealtimeNotificationDtoSchema.safeParse(payload);
      if (parsed.success) {
        this.latestNotification.set(parsed.data);
      }
    });
    this.socket.on(DOCUMENT_CHANGED_EVENT, (payload: unknown) => {
      const parsed = RealtimeDocumentChangedEventSchema.safeParse(payload);
      if (parsed.success) {
        this.latestDocumentChange.set(parsed.data);
      }
    });
    this.socket.on(AI_PROVIDER_CHANGED_EVENT, (payload: unknown) => {
      const parsed = RealtimeAiProviderChangedEventSchema.safeParse(payload);
      if (parsed.success) {
        this.latestAiProviderChange.set(parsed.data);
      }
    });
    this.socket.on(EDIT_LOCK_CHANGED_EVENT, (payload: unknown) => {
      const parsed = RealtimeEditLockChangedEventSchema.safeParse(payload);
      if (parsed.success) {
        this.latestEditLockChange.set(parsed.data);
      }
    });
  }

  private disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.socketToken = null;
    this.isConnected.set(false);
    this.socketId.set(null);
  }

  private refreshSession(): void {
    if (this.isRefreshing) {
      return;
    }

    this.isRefreshing = true;
    this.auth.refresh().subscribe({
      next: (isAuthenticated) => {
        this.isRefreshing = false;
        const accessToken = this.auth.accessToken();
        if (isAuthenticated && accessToken) {
          this.connect(accessToken);
        } else {
          this.disconnect();
        }
      },
      error: () => {
        this.isRefreshing = false;
        this.disconnect();
      },
    });
  }

  private realtimeUrl(): string {
    return this.urls.endpoint(REALTIME_NAMESPACE);
  }
}
