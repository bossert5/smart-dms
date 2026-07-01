import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CreateEditLockRequest,
  CreateEditLockResponse,
  EditLockScope,
} from '@smart-dms/shared-dto';
import { EMPTY, interval, Observable, Subscription, switchMap, throwError } from 'rxjs';
import { ApiUrlService } from '../api/api-url.service';
import { AuthService } from './auth.service';
import { RealtimeClientService } from './realtime-client.service';

const EDIT_LOCK_HEARTBEAT_INTERVAL_MS = 15_000;

@Injectable({ providedIn: 'root' })
export class EditLockService {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly realtime = inject(RealtimeClientService);
  private readonly urls = inject(ApiUrlService);
  private readonly clientId =
    globalThis.crypto?.randomUUID?.() ?? `client-${Date.now()}-${Math.random()}`;

  acquire(scope: EditLockScope, resourceId: string): Observable<CreateEditLockResponse> {
    const socketId = this.realtime.socketId();
    if (!socketId || !this.realtime.isConnected()) {
      return throwError(() => new Error('Edit locks require an active realtime connection.'));
    }

    const request: CreateEditLockRequest = {
      scope,
      resourceId,
      clientId: this.clientId,
      socketId,
    };

    return this.http.post<CreateEditLockResponse>(this.urls.endpoint('/edit-locks'), request);
  }

  release(lockId: string): Observable<void> {
    return this.http.delete<void>(this.urls.endpoint(`/edit-locks/${encodeURIComponent(lockId)}`));
  }

  heartbeat(lockId: string): Observable<CreateEditLockResponse> {
    return this.http.patch<CreateEditLockResponse>(
      this.urls.endpoint(`/edit-locks/${encodeURIComponent(lockId)}/heartbeat`),
      {},
    );
  }

  startHeartbeat(lockId: string, onLost: () => void): Subscription {
    return interval(EDIT_LOCK_HEARTBEAT_INTERVAL_MS)
      .pipe(
        switchMap(() => {
          if (!this.realtime.isConnected()) {
            return EMPTY;
          }

          return this.heartbeat(lockId);
        }),
      )
      .subscribe({
        error: onLost,
      });
  }

  releaseBestEffort(lockId: string | null): void {
    if (!lockId) {
      return;
    }

    this.release(lockId).subscribe({ error: () => undefined });
  }

  releaseBeforeUnload(lockId: string | null): void {
    if (!lockId || !globalThis.fetch) {
      return;
    }

    const headers = new Headers();
    const accessToken = this.auth.accessToken();
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    void globalThis.fetch(this.urls.endpoint(`/edit-locks/${encodeURIComponent(lockId)}`), {
      method: 'DELETE',
      headers,
      keepalive: true,
      credentials: 'include',
    });
  }
}
