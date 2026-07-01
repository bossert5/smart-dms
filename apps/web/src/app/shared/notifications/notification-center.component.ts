import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import type { RealtimeNotificationDto, RealtimeNotificationSeverity } from '@smart-dms/shared-dto';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzListModule } from 'ng-zorro-antd/list';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationCenterService } from '../../core/services/notification-center.service';

@Component({
  selector: 'app-notification-center',
  imports: [
    FormsModule,
    NzBadgeModule,
    NzButtonModule,
    NzEmptyModule,
    NzIconModule,
    NzListModule,
    NzPopoverModule,
    NzSwitchModule,
    NzTagModule,
    TranslatePipe,
  ],
  templateUrl: './notification-center.component.html',
  styleUrl: './notification-center.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationCenterComponent {
  readonly center = inject(NotificationCenterService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  popoverVisibleChanged(isVisible: boolean): void {
    if (isVisible) {
      this.center.markSeen();
    }
  }

  mutedChanged(isMuted: boolean): void {
    this.center.setMuted(isMuted);
  }

  openNotification(notification: RealtimeNotificationDto): void {
    if (!notification.documentId) {
      return;
    }

    void this.router.navigate(['/documents', notification.documentId]);
  }

  canOpen(notification: RealtimeNotificationDto): boolean {
    return Boolean(notification.documentId);
  }

  time(value: string): string {
    return new Intl.DateTimeFormat(this.language.currentLocale(), {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(value));
  }

  severityColor(severity: RealtimeNotificationSeverity): string {
    switch (severity) {
      case 'success':
        return 'success';
      case 'warning':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'processing';
    }
  }

  severityLabelKey(severity: RealtimeNotificationSeverity): string {
    return `enums.notificationSeverity.${severity}`;
  }
}
