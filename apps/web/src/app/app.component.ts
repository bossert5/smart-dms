import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { filter } from 'rxjs';
import { DocumentsRouteReuseStrategy } from './core/routing/documents-route-reuse.strategy';
import { AuthService } from './core/services/auth.service';
import {
  OpenDocumentsService,
  type OpenDocumentItem,
} from './core/services/open-documents.service';
import { ThemeService } from './core/services/theme.service';
import { TenantContextService } from './core/services/tenant-context.service';
import { UserPreferencesService } from './core/services/user-preferences.service';
import { AiLogoComponent } from './shared/ai-logo.component';
import { DocumentUploadActionComponent } from './shared/document-upload-action.component';
import { APP_LAYOUT_RESIZE_EVENT } from './shared/layout/layout-resize-event';
import { NotificationCenterComponent } from './shared/notifications/notification-center.component';

const siderCollapsedStorageKey = 'smart-dms-sider-collapsed';

@Component({
  selector: 'app-root',
  imports: [
    RouterLink,
    RouterOutlet,
    NzAlertModule,
    NzButtonModule,
    NzDropDownModule,
    NzIconModule,
    NzLayoutModule,
    NzMenuModule,
    NzSelectModule,
    NzTooltipModule,
    DragDropModule,
    FormsModule,
    TranslatePipe,
    AiLogoComponent,
    DocumentUploadActionComponent,
    NotificationCenterComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly auth = inject(AuthService);
  readonly openDocuments = inject(OpenDocumentsService);
  readonly theme = inject(ThemeService);
  readonly tenantContext = inject(TenantContextService);
  readonly preferences = inject(UserPreferencesService);
  private readonly documentsRouteReuse = inject(DocumentsRouteReuseStrategy);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly activeDocumentId = signal<string | null>(this.documentIdFromUrl(this.router.url));
  readonly activePath = signal(this.pathFromUrl(this.router.url));
  readonly shellTitleKeys = signal(this.shellTitleKeysFromRoute());
  readonly isSiderCollapsed = signal(this.readStoredSiderCollapsed());
  readonly isOpenDocumentsDropdownVisible = signal(false);

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        this.activeDocumentId.set(this.documentIdFromUrl(event.urlAfterRedirects));
        this.activePath.set(this.pathFromUrl(event.urlAfterRedirects));
        this.shellTitleKeys.set(this.shellTitleKeysFromRoute());
      });
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => {
        this.documentsRouteReuse.clearDocumentsListRoute(
          this.isDocumentsListRoute(this.router.url),
        );
        this.openDocuments.closeAll();
        void this.router.navigateByUrl('/login');
      },
    });
  }

  closeOpenDocument(documentId: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const isActiveDocument = this.activeDocumentId() === documentId;
    const nextDocument = this.openDocuments.close(documentId);
    if (!isActiveDocument) {
      return;
    }

    void this.router.navigateByUrl(nextDocument ? `/documents/${nextDocument.id}` : '/documents');
  }

  closeOpenDocumentFromDropdown(documentId: string, event: MouseEvent): void {
    this.closeOpenDocument(documentId, event);
    this.hideOpenDocumentsDropdown();
  }

  dropOpenDocument(event: CdkDragDrop<OpenDocumentItem[]>): void {
    this.openDocuments.reorder(event.previousIndex, event.currentIndex);
  }

  toggleSider(): void {
    this.updateSiderCollapsed(!this.isSiderCollapsed());
  }

  updateSiderCollapsed(isCollapsed: boolean): void {
    this.isSiderCollapsed.set(isCollapsed);
    this.hideOpenDocumentsDropdown();
    this.persistSiderCollapsed(isCollapsed);
    this.notifyLayoutResize();
  }

  toggleAdminNavigationHidden(): void {
    this.preferences.toggleAdminNavigationHidden();
  }

  setOpenDocumentsDropdownVisible(isVisible: boolean): void {
    if (isVisible && (!this.isSiderCollapsed() || this.openDocuments.items().length === 0)) {
      return;
    }

    this.isOpenDocumentsDropdownVisible.set(isVisible);
  }

  hideOpenDocumentsDropdown(): void {
    this.isOpenDocumentsDropdownVisible.set(false);
  }

  handleOpenDocumentsDropdownKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.hideOpenDocumentsDropdown();
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    this.setOpenDocumentsDropdownVisible(!this.isOpenDocumentsDropdownVisible());
  }

  isRouteActive(path: string): boolean {
    const activePath = this.activePath();
    return activePath === path || activePath.startsWith(`${path}/`);
  }

  private readStoredSiderCollapsed(): boolean {
    try {
      return globalThis.localStorage?.getItem(siderCollapsedStorageKey) === 'true';
    } catch {
      return false;
    }
  }

  private persistSiderCollapsed(isCollapsed: boolean): void {
    try {
      globalThis.localStorage?.setItem(siderCollapsedStorageKey, String(isCollapsed));
    } catch {
      // Ignore unavailable storage so the shell remains usable in restricted contexts.
    }
  }

  private notifyLayoutResize(): void {
    this.dispatchLayoutResize();
    globalThis.requestAnimationFrame?.(() => this.dispatchLayoutResize());
    globalThis.setTimeout?.(() => this.dispatchLayoutResize(), 240);
  }

  private dispatchLayoutResize(): void {
    if (!globalThis.dispatchEvent || typeof Event === 'undefined') {
      return;
    }

    globalThis.dispatchEvent(new Event(APP_LAYOUT_RESIZE_EVENT));
  }

  private documentIdFromUrl(url: string): string | null {
    const path = this.pathFromUrl(url);
    const match = /^\/(?:documents|inbox)\/([^/]+)\/?$/.exec(path);
    return match ? decodeURIComponent(match[1]) : null;
  }

  private isDocumentsListRoute(url: string): boolean {
    return this.pathFromUrl(url) === '/documents';
  }

  private pathFromUrl(url: string): string {
    return url.split(/[?#]/, 1)[0];
  }

  private shellTitleKeysFromRoute(): readonly string[] {
    let route = this.activatedRoute;
    while (route.firstChild) {
      route = route.firstChild;
    }

    const value = route.snapshot.data['shellTitle'];
    return Array.isArray(value) &&
      value.every((entry): entry is string => typeof entry === 'string')
      ? value
      : [];
  }
}
