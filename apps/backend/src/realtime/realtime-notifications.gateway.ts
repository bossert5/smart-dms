import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  AI_PROVIDER_CHANGED_EVENT,
  DOCUMENT_CHANGED_EVENT,
  EDIT_LOCK_CHANGED_EVENT,
  NOTIFICATIONS_CREATED_EVENT,
  NOTIFICATIONS_SNAPSHOT_EVENT,
  REALTIME_NAMESPACE,
} from '@smart-dms/shared-dto';
import type { RealtimeDomainEvent } from '@smart-dms/shared-dto';
import type { Namespace, Socket } from 'socket.io';
import { AccessTokenService } from '../auth/access-token.service';
import { API_ROUTE_PREFIX } from '../common/api-prefix';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { EditLocksService } from '../edit-locks/edit-locks.service';
import { RealtimeEventsSubscriber } from './realtime-events.subscriber';
import { RealtimeNotificationsService } from './realtime-notifications.service';
import { RealtimeNotificationsSubscriber } from './realtime-notifications.subscriber';

interface RealtimeSocketData {
  user?: AuthenticatedUser;
}

@WebSocketGateway({
  namespace: `${API_ROUTE_PREFIX}${REALTIME_NAMESPACE}`,
  cors: {
    origin: true,
    credentials: true,
  },
  transports: ['websocket'],
})
export class RealtimeNotificationsGateway implements OnGatewayInit {
  private readonly logger = new Logger(RealtimeNotificationsGateway.name);
  private unregisterEventHandler: (() => void) | undefined;
  private unregisterNotificationHandler: (() => void) | undefined;

  @WebSocketServer()
  private server!: Namespace;

  constructor(
    private readonly accessTokenService: AccessTokenService,
    private readonly notifications: RealtimeNotificationsService,
    private readonly subscriber: RealtimeNotificationsSubscriber,
    private readonly eventsSubscriber: RealtimeEventsSubscriber,
    private readonly editLocks: EditLocksService,
  ) {}

  afterInit(server: Namespace): void {
    server.use((client, next) => {
      const token = this.extractAccessToken(client);

      void this.accessTokenService
        .authenticate(token)
        .then((user) => {
          this.setSocketUser(client, user);
          next();
        })
        .catch(() => {
          next(new Error('Unauthorized'));
        });
    });

    this.unregisterNotificationHandler = this.subscriber.onNotification(
      (notification) => {
        for (const client of server.sockets.values()) {
          if (this.canReceiveTenantEvent(client, notification.tenantId)) {
            client.emit(NOTIFICATIONS_CREATED_EVENT, notification);
          }
        }
      },
    );
    this.unregisterEventHandler = this.eventsSubscriber.onEvent((event) =>
      this.emitRealtimeEvent(server, event),
    );
  }

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    this.logger.debug(`Realtime client connected: ${client.id}`);
    const items = await this.notifications.recentNotifications();
    client.emit(NOTIFICATIONS_SNAPSHOT_EVENT, {
      items: items.filter((item) =>
        this.canReceiveTenantEvent(client, item.tenantId),
      ),
    });
  }

  handleDisconnect(@ConnectedSocket() client: Socket): void {
    this.logger.debug(`Realtime client disconnected: ${client.id}`);
    void this.editLocks.releaseBySocketId(client.id);
  }

  onModuleDestroy(): void {
    this.unregisterEventHandler?.();
    this.unregisterNotificationHandler?.();
  }

  private emitRealtimeEvent(
    server: Namespace,
    event: RealtimeDomainEvent,
  ): void {
    if (event.type === DOCUMENT_CHANGED_EVENT) {
      for (const client of server.sockets.values()) {
        if (this.canReceiveTenantEvent(client, event.tenantId)) {
          client.emit(DOCUMENT_CHANGED_EVENT, event);
        }
      }
      return;
    }

    if (event.type === EDIT_LOCK_CHANGED_EVENT) {
      for (const client of server.sockets.values()) {
        client.emit(EDIT_LOCK_CHANGED_EVENT, event);
      }
      return;
    }

    for (const client of server.sockets.values()) {
      if (this.isAdminSocket(client)) {
        client.emit(AI_PROVIDER_CHANGED_EVENT, event);
      }
    }
  }

  private isAdminSocket(client: Socket): boolean {
    const user = this.getSocketUser(client);
    return user?.role === 'Admin';
  }

  private canReceiveTenantEvent(
    client: Socket,
    tenantId: string | undefined,
  ): boolean {
    if (!tenantId) {
      return true;
    }
    const user = this.getSocketUser(client);
    return (
      user?.tenants?.some(
        (tenant) => tenant.id === tenantId && tenant.isActive === true,
      ) ?? false
    );
  }

  private extractAccessToken(client: Socket): string | undefined {
    const auth = client.handshake.auth as Record<string, unknown> | undefined;
    const token = auth?.accessToken;

    return typeof token === 'string' && token.length > 0 ? token : undefined;
  }

  private getSocketUser(client: Socket): AuthenticatedUser | undefined {
    return (client.data as RealtimeSocketData).user;
  }

  private setSocketUser(client: Socket, user: AuthenticatedUser): void {
    (client.data as RealtimeSocketData).user = user;
  }
}
