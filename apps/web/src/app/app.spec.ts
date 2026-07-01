import { provideHttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  AppstoreOutline,
  BellOutline,
  CalendarOutline,
  CheckCircleOutline,
  CloudUploadOutline,
  CloseCircleOutline,
  CloseOutline,
  DashboardOutline,
  DownOutline,
  EyeInvisibleOutline,
  EyeOutline,
  FileOutline,
  FileTextOutline,
  InboxOutline,
  LogoutOutline,
  MailOutline,
  MenuFoldOutline,
  MenuUnfoldOutline,
  MoonOutline,
  MutedOutline,
  PushpinOutline,
  RightOutline,
  SaveOutline,
  SettingOutline,
  SunOutline,
  TeamOutline,
  UpOutline,
  UserAddOutline,
  UserOutline,
} from '@ant-design/icons-angular/icons';
import type { UserDto } from '@smart-dms/shared-dto';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { of } from 'rxjs';
import { AppComponent } from './app.component';
import { UploadApiService } from './core/api/upload-api.service';
import { DocumentsRouteReuseStrategy } from './core/routing/documents-route-reuse.strategy';
import { AuthService } from './core/services/auth.service';
import {
  OPEN_DOCUMENTS_STORAGE_KEY,
  OpenDocumentsService,
} from './core/services/open-documents.service';
import { ThemeService } from './core/services/theme.service';
import { APP_LAYOUT_RESIZE_EVENT } from './shared/layout/layout-resize-event';
import { provideI18nTesting } from './testing/i18n-testing';

const tenant = {
  id: '00000000-0000-4000-8000-000000000010',
  key: 'default',
  name: 'Default',
  isActive: true,
};

const testUser: UserDto = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'admin',
  displayName: 'Admin User',
  role: 'Admin',
  isActive: true,
  passwordChangeRequired: false,
  tenants: [tenant],
  defaultTenantId: tenant.id,
  createdAt: '2026-05-07T00:00:00.000Z',
  updatedAt: '2026-05-07T00:00:00.000Z',
};

const adminNavigationHiddenStorageKey = 'smart-dms-admin-navigation-hidden';

@Component({
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class EmptyRouteComponent {}

function stubPreferredColorScheme(isDark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: isDark && query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('App', () => {
  beforeEach(async () => {
    localStorage.removeItem('smart-dms-theme');
    localStorage.removeItem('smart-dms-language');
    localStorage.removeItem('smart-dms-sider-collapsed');
    localStorage.removeItem(adminNavigationHiddenStorageKey);
    localStorage.removeItem(OPEN_DOCUMENTS_STORAGE_KEY);
    document.getElementById('smart-dms-ng-zorro-dark-theme')?.remove();
    stubPreferredColorScheme(false);

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideHttpClient(),
        provideRouter([
          {
            path: 'dashboard',
            component: EmptyRouteComponent,
            data: { shellTitle: ['app.nav.dashboard'] },
          },
          {
            path: 'documents',
            component: EmptyRouteComponent,
            data: { shellTitle: ['app.nav.documents'] },
          },
          {
            path: 'documents/:id',
            component: EmptyRouteComponent,
            data: { shellTitle: ['app.nav.documents'] },
          },
          {
            path: 'inbox',
            component: EmptyRouteComponent,
            data: { shellTitle: ['app.nav.inbox'] },
          },
          {
            path: 'inbox/:id',
            component: EmptyRouteComponent,
            data: { shellTitle: ['app.nav.inbox'] },
          },
          {
            path: 'calendar',
            component: EmptyRouteComponent,
            data: { shellTitle: ['app.nav.calendar'] },
          },
          {
            path: 'email',
            component: EmptyRouteComponent,
            data: { shellTitle: ['app.nav.email'] },
          },
          {
            path: 'account/settings',
            component: EmptyRouteComponent,
            data: { shellTitle: ['accountSettings.title'] },
          },
          {
            path: 'users',
            component: EmptyRouteComponent,
            data: { shellTitle: ['app.breadcrumb.administration', 'app.nav.users'] },
          },
          {
            path: 'settings',
            children: [
              {
                path: 'general',
                component: EmptyRouteComponent,
                data: { shellTitle: ['app.breadcrumb.administration', 'app.nav.general'] },
              },
              {
                path: 'documents',
                component: EmptyRouteComponent,
                data: { shellTitle: ['app.breadcrumb.administration', 'app.nav.documents'] },
              },
              {
                path: 'ai',
                component: EmptyRouteComponent,
                data: { shellTitle: ['app.breadcrumb.administration', 'app.nav.ai'] },
              },
              {
                path: 'email',
                component: EmptyRouteComponent,
                data: { shellTitle: ['app.breadcrumb.administration', 'app.nav.email'] },
              },
            ],
          },
        ]),
        provideI18nTesting(),
        {
          provide: UploadApiService,
          useValue: {
            config: vi.fn().mockReturnValue(
              of({
                maxUploadSizeBytes: 10_000_000,
                allowedMimeTypes: ['application/pdf'],
              }),
            ),
            uploadDocument: vi.fn(),
          },
        },
        provideNzIcons([
          AppstoreOutline,
          BellOutline,
          CalendarOutline,
          CheckCircleOutline,
          CloudUploadOutline,
          CloseCircleOutline,
          CloseOutline,
          DashboardOutline,
          DownOutline,
          EyeInvisibleOutline,
          EyeOutline,
          FileOutline,
          FileTextOutline,
          InboxOutline,
          LogoutOutline,
          MailOutline,
          MenuFoldOutline,
          MenuUnfoldOutline,
          MoonOutline,
          MutedOutline,
          PushpinOutline,
          RightOutline,
          SaveOutline,
          SettingOutline,
          SunOutline,
          TeamOutline,
          UpOutline,
          UserAddOutline,
          UserOutline,
        ]),
      ],
    }).compileComponents();
  });

  afterEach(() => {
    localStorage.removeItem('smart-dms-sider-collapsed');
    localStorage.removeItem(adminNavigationHiddenStorageKey);
    localStorage.removeItem(OPEN_DOCUMENTS_STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    document.getElementById('smart-dms-ng-zorro-dark-theme')?.remove();
    document.querySelector('.cdk-overlay-container')?.remove();
    vi.unstubAllGlobals();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('starts without an authenticated shell', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.app-shell')).toBeNull();
  });

  it('renders the authenticated shell brand and primary navigation', () => {
    const auth = TestBed.inject(AuthService);
    auth.user.set(testUser);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const text = compiled.textContent ?? '';
    const shell = compiled.querySelector<HTMLElement>('.app-shell');

    expect(shell?.firstElementChild?.classList.contains('app-header')).toBe(true);
    expect(shell?.children.item(1)?.classList.contains('app-main')).toBe(true);
    expect(text).toContain('SmartDMS');
    expect(text).toContain('Dashboard');
    expect(text).toContain('Documents');
    expect(text).toContain('Inbox');
    expect(text).toContain('Calendar');
    expect(text).toContain('Email');
    expect(text).toContain('Settings');
    expect(compiled.querySelector('[data-testid="document-upload-action"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="language-selector"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="user-menu-trigger"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="logout-button"]')?.textContent?.trim()).toBe('');
    expect(
      compiled.querySelector('[data-testid="logout-button"]')?.getAttribute('aria-label'),
    ).toBe('Log out');
    expect(text).not.toContain('Pinned documents');
  });

  it('replaces the header upload action with a tenant assignment warning when no active tenant is assigned', () => {
    const auth = TestBed.inject(AuthService);
    const userWithoutTenants: UserDto = {
      ...testUser,
      tenants: [],
      defaultTenantId: null,
    };
    auth.user.set(userWithoutTenants);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const text = compiled.textContent ?? '';

    expect(compiled.querySelector('[data-testid="document-upload-action"]')).toBeNull();
    expect(compiled.querySelector('.header-tenant-warning')).not.toBeNull();
    expect(text).toContain('No tenant is assigned to this user. A tenant is required.');
  });

  it('marks the active side navigation item from the current route', async () => {
    const auth = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    auth.user.set(testUser);

    const fixture = TestBed.createComponent(AppComponent);
    await router.navigateByUrl('/documents/doc-a');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const primaryMenuItems = compiled.querySelectorAll<HTMLElement>(
      '.sider-content > ul.sider-menu > li.ant-menu-item',
    );

    expect(primaryMenuItems.item(0).classList.contains('ant-menu-item-selected')).toBe(false);
    expect(primaryMenuItems.item(1).classList.contains('ant-menu-item-selected')).toBe(true);
    expect(primaryMenuItems.item(1).classList.contains('sider-menu-item-active')).toBe(true);
    expect(primaryMenuItems.item(2).classList.contains('ant-menu-item-selected')).toBe(false);
    expect(primaryMenuItems.item(3).classList.contains('ant-menu-item-selected')).toBe(false);
    expect(primaryMenuItems.item(4).classList.contains('ant-menu-item-selected')).toBe(false);

    await router.navigateByUrl('/calendar');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(primaryMenuItems.item(0).classList.contains('ant-menu-item-selected')).toBe(false);
    expect(primaryMenuItems.item(1).classList.contains('ant-menu-item-selected')).toBe(false);
    expect(primaryMenuItems.item(2).classList.contains('ant-menu-item-selected')).toBe(false);
    expect(primaryMenuItems.item(3).classList.contains('ant-menu-item-selected')).toBe(true);
    expect(primaryMenuItems.item(3).classList.contains('sider-menu-item-active')).toBe(true);
    expect(primaryMenuItems.item(4).classList.contains('ant-menu-item-selected')).toBe(false);

    await router.navigateByUrl('/inbox');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(primaryMenuItems.item(0).classList.contains('ant-menu-item-selected')).toBe(false);
    expect(primaryMenuItems.item(1).classList.contains('ant-menu-item-selected')).toBe(false);
    expect(primaryMenuItems.item(3).classList.contains('ant-menu-item-selected')).toBe(false);
    expect(primaryMenuItems.item(2).classList.contains('ant-menu-item-selected')).toBe(true);
    expect(primaryMenuItems.item(2).classList.contains('sider-menu-item-active')).toBe(true);
    expect(primaryMenuItems.item(4).classList.contains('ant-menu-item-selected')).toBe(false);

    await router.navigateByUrl('/inbox/doc-a');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(primaryMenuItems.item(1).classList.contains('ant-menu-item-selected')).toBe(false);
    expect(primaryMenuItems.item(2).classList.contains('ant-menu-item-selected')).toBe(true);
    expect(primaryMenuItems.item(2).classList.contains('sider-menu-item-active')).toBe(true);
    expect(fixture.componentInstance.activeDocumentId()).toBe('doc-a');

    const accountMenuItems = compiled.querySelectorAll<HTMLElement>(
      '.account-settings-nav ul.sider-menu > li.ant-menu-item',
    );

    await router.navigateByUrl('/account/settings');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(accountMenuItems.item(0).classList.contains('ant-menu-item-selected')).toBe(true);
    expect(accountMenuItems.item(0).classList.contains('sider-menu-item-active')).toBe(true);

    const adminMenuItems = compiled.querySelectorAll<HTMLElement>(
      '.administration-nav ul.sider-menu > li.ant-menu-item',
    );

    await router.navigateByUrl('/users');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(adminMenuItems.item(0).classList.contains('ant-menu-item-selected')).toBe(false);
    expect(adminMenuItems.item(1).classList.contains('ant-menu-item-selected')).toBe(true);
    expect(adminMenuItems.item(1).classList.contains('sider-menu-item-active')).toBe(true);
    expect(adminMenuItems.item(2).classList.contains('ant-menu-item-selected')).toBe(false);
    expect(adminMenuItems.item(3).classList.contains('ant-menu-item-selected')).toBe(false);
    expect(adminMenuItems.item(4).classList.contains('ant-menu-item-selected')).toBe(false);
    expect(adminMenuItems.item(5).classList.contains('ant-menu-item-selected')).toBe(false);

    await router.navigateByUrl('/settings/email');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(adminMenuItems.item(0).classList.contains('ant-menu-item-selected')).toBe(false);
    expect(adminMenuItems.item(1).classList.contains('ant-menu-item-selected')).toBe(false);
    expect(adminMenuItems.item(2).classList.contains('ant-menu-item-selected')).toBe(false);
    expect(adminMenuItems.item(3).classList.contains('ant-menu-item-selected')).toBe(false);
    expect(adminMenuItems.item(4).classList.contains('ant-menu-item-selected')).toBe(false);
    expect(adminMenuItems.item(5).classList.contains('ant-menu-item-selected')).toBe(true);
    expect(adminMenuItems.item(5).classList.contains('sider-menu-item-active')).toBe(true);
  });

  it('renders open documents in a separate sidebar section', () => {
    const auth = TestBed.inject(AuthService);
    const openDocuments = TestBed.inject(OpenDocumentsService);
    auth.user.set(testUser);
    openDocuments.open({ id: 'doc-a', title: 'Invoice A' });
    openDocuments.open({ id: 'doc-b', title: 'Invoice B' });

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    const documentsIndex = text.indexOf('Documents');
    const openDocumentsIndex = text.indexOf('Pinned documents');
    const accountSettingsIndex = text.indexOf('Settings');
    const administrationIndex = text.indexOf('ADMINISTRATION');

    expect(text).not.toContain('Document overview');
    expect(documentsIndex).toBeGreaterThanOrEqual(0);
    expect(openDocumentsIndex).toBeGreaterThan(documentsIndex);
    expect(accountSettingsIndex).toBeGreaterThan(openDocumentsIndex);
    expect(administrationIndex).toBeGreaterThan(accountSettingsIndex);
    expect(text).toContain('Pinned documents');
    expect(text).toContain('Invoice A');
    expect(text).toContain('Invoice B');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="open-documents-close-all"]',
      ),
    ).toBeNull();
  });

  it('renders one collapsed open documents trigger instead of inline document entries', () => {
    localStorage.setItem('smart-dms-sider-collapsed', 'true');
    const auth = TestBed.inject(AuthService);
    const openDocuments = TestBed.inject(OpenDocumentsService);
    auth.user.set(testUser);
    openDocuments.open({ id: 'doc-a', title: 'Invoice A' });
    openDocuments.open({ id: 'doc-b', title: 'Invoice B' });

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const trigger = compiled.querySelector<HTMLButtonElement>(
      '[data-testid="open-documents-collapsed-trigger"]',
    );

    expect(trigger).not.toBeNull();
    expect(trigger?.textContent).toContain('2');
    expect(trigger?.getAttribute('aria-label')).toBe('Pinned documents (2)');
    expect(trigger?.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(compiled.querySelectorAll('.open-document-menu-item')).toHaveLength(0);
    expect(compiled.querySelector('[data-testid="open-documents-close-all"]')).toBeNull();
  });

  it('opens the collapsed open documents dropdown from the keyboard and closes the active document', async () => {
    localStorage.setItem('smart-dms-sider-collapsed', 'true');
    const auth = TestBed.inject(AuthService);
    const openDocuments = TestBed.inject(OpenDocumentsService);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    auth.user.set(testUser);
    openDocuments.open({ id: 'doc-a', title: 'Invoice A' });
    openDocuments.open({
      id: 'doc-b',
      title: 'Invoice B with a long title that can wrap in the dropdown',
    });

    const fixture = TestBed.createComponent(AppComponent);
    fixture.componentInstance.activeDocumentId.set('doc-b');
    fixture.detectChanges();

    const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="open-documents-collapsed-trigger"]',
    );
    trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 180));
    fixture.detectChanges();

    const menu = document.querySelector<HTMLElement>(
      '[data-testid="open-documents-dropdown-menu"]',
    );

    expect(fixture.componentInstance.isOpenDocumentsDropdownVisible()).toBe(true);
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(menu?.textContent).toContain('Invoice A');
    expect(menu?.textContent).toContain('Invoice B with a long title');

    document
      .querySelector<HTMLButtonElement>('[data-testid="open-document-dropdown-close-doc-b"]')
      ?.click();
    fixture.detectChanges();

    expect(openDocuments.isOpen('doc-a')).toBe(true);
    expect(openDocuments.isOpen('doc-b')).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/documents/doc-a');
    expect(fixture.componentInstance.isOpenDocumentsDropdownVisible()).toBe(false);
  });

  it('renders open documents without administration for non-admin users', () => {
    const auth = TestBed.inject(AuthService);
    const openDocuments = TestBed.inject(OpenDocumentsService);
    auth.user.set({ ...testUser, role: 'User' });
    openDocuments.open({ id: 'doc-a', title: 'Invoice A' });

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Pinned documents');
    expect(text).toContain('Invoice A');
    expect(text).not.toContain('ADMINISTRATION');
    expect(text).toContain('Email');
    expect(text.indexOf('Settings')).toBeGreaterThan(text.indexOf('Invoice A'));
  });

  it('reorders open documents from the sidebar drag list', () => {
    const auth = TestBed.inject(AuthService);
    const openDocuments = TestBed.inject(OpenDocumentsService);
    auth.user.set(testUser);
    openDocuments.open({ id: 'doc-a', title: 'Invoice A' });
    openDocuments.open({ id: 'doc-b', title: 'Invoice B' });
    const reorder = vi.spyOn(openDocuments, 'reorder');

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.dropOpenDocument({
      previousIndex: 0,
      currentIndex: 1,
    } as Parameters<AppComponent['dropOpenDocument']>[0]);
    fixture.detectChanges();

    expect(reorder).toHaveBeenCalledWith(0, 1);
    expect(openDocuments.items().map((item) => item.id)).toEqual(['doc-b', 'doc-a']);
    expect(compiled.querySelector('[data-testid^="open-document-drag-"]')).toBeNull();
    expect(compiled.querySelectorAll('.open-document-menu-item.cdk-drag')).toHaveLength(2);
  });

  it('closes inactive open documents without changing the route', () => {
    const auth = TestBed.inject(AuthService);
    const openDocuments = TestBed.inject(OpenDocumentsService);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    auth.user.set(testUser);
    openDocuments.open({ id: 'doc-a', title: 'Invoice A' });
    openDocuments.open({ id: 'doc-b', title: 'Invoice B' });

    const fixture = TestBed.createComponent(AppComponent);
    fixture.componentInstance.activeDocumentId.set('doc-b');
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="open-document-close-doc-a"]')
      ?.click();

    expect(openDocuments.isOpen('doc-a')).toBe(false);
    expect(openDocuments.isOpen('doc-b')).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('navigates to the next open document when closing the active document', () => {
    const auth = TestBed.inject(AuthService);
    const openDocuments = TestBed.inject(OpenDocumentsService);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    auth.user.set(testUser);
    openDocuments.open({ id: 'doc-a', title: 'Invoice A' });
    openDocuments.open({ id: 'doc-b', title: 'Invoice B' });

    const fixture = TestBed.createComponent(AppComponent);
    fixture.componentInstance.activeDocumentId.set('doc-b');
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="open-document-close-doc-b"]')
      ?.click();

    expect(openDocuments.isOpen('doc-b')).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/documents/doc-a');
  });

  it('renders a toolbar theme toggle for authenticated users', () => {
    const auth = TestBed.inject(AuthService);
    const theme = TestBed.inject(ThemeService);
    const toggle = vi.spyOn(theme, 'toggle');
    auth.user.set(testUser);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"]');

    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toBe('Activate dark mode');
    expect(button?.getAttribute('aria-pressed')).toBe('false');

    button?.click();

    expect(toggle).toHaveBeenCalledOnce();
  });

  it('renders light sider shell and menus until dark mode is active', () => {
    const auth = TestBed.inject(AuthService);
    const theme = TestBed.inject(ThemeService);
    auth.user.set(testUser);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const sider = compiled.querySelector<HTMLElement>('.app-sider');
    const lightMenus = Array.from(compiled.querySelectorAll<HTMLElement>('.app-sider ul.sider-menu'));

    expect(sider?.classList.contains('ant-layout-sider-light')).toBe(true);
    expect(sider?.classList.contains('ant-layout-sider-dark')).toBe(false);
    expect(lightMenus.length).toBeGreaterThan(0);
    expect(lightMenus.every((menu) => menu.classList.contains('ant-menu-light'))).toBe(true);
    expect(lightMenus.some((menu) => menu.classList.contains('ant-menu-dark'))).toBe(false);

    theme.use('dark');
    fixture.detectChanges();

    const darkMenus = Array.from(compiled.querySelectorAll<HTMLElement>('.app-sider ul.sider-menu'));

    expect(sider?.classList.contains('ant-layout-sider-dark')).toBe(true);
    expect(sider?.classList.contains('ant-layout-sider-light')).toBe(false);
    expect(darkMenus.every((menu) => menu.classList.contains('ant-menu-dark'))).toBe(true);
    expect(darkMenus.some((menu) => menu.classList.contains('ant-menu-light'))).toBe(false);
  });

  it('keeps lower sider section geometry stable across themes', () => {
    const auth = TestBed.inject(AuthService);
    const theme = TestBed.inject(ThemeService);
    const openDocuments = TestBed.inject(OpenDocumentsService);
    auth.user.set(testUser);
    openDocuments.open({ id: 'doc-a', title: 'Invoice A' });
    openDocuments.open({
      id: 'doc-b',
      title: 'Invoice B with a long title that can wrap in the sidebar',
    });

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const shell = compiled.querySelector<HTMLElement>('.app-shell');
    const sider = compiled.querySelector<HTMLElement>('.app-sider');
    const siderMenuItems = () =>
      Array.from(compiled.querySelectorAll<HTMLElement>('.app-sider ul.sider-menu > li.ant-menu-item'));
    const siderMenuTitleContents = () =>
      Array.from(compiled.querySelectorAll<HTMLElement>('.app-sider .ant-menu-title-content'));
    const lowerMenuItems = () =>
      Array.from(
        compiled.querySelectorAll<HTMLElement>(
          [
            '.account-settings-nav ul.sider-menu > li.ant-menu-item',
            '.administration-nav ul.sider-menu > li.ant-menu-item',
          ].join(', '),
        ),
      );
    const lowerMenus = () =>
      Array.from(
        compiled.querySelectorAll<HTMLElement>(
          '.account-settings-nav ul.sider-menu, .administration-nav ul.sider-menu',
        ),
      );
    const accountSettingsNav = () =>
      compiled.querySelector<HTMLElement>('.account-settings-nav');
    const administrationNav = () =>
      compiled.querySelector<HTMLElement>('.administration-nav');
    const administrationHeading = () =>
      compiled.querySelector<HTMLElement>('.administration-nav > .sidebar-section-heading');
    const administrationHeadingToggle = () =>
      compiled.querySelector<HTMLElement>('.administration-toggle-heading');
    const administrationHiddenToggle = () =>
      compiled.querySelector<HTMLElement>('.administration-toggle-hidden');
    const administrationCollapsedToggle = () =>
      compiled.querySelector<HTMLElement>('.administration-toggle-collapsed');
    const expectResolvedOrVariable = (
      actual: string,
      resolvedValue: string,
      variableReference: string,
    ) => {
      expect([resolvedValue, variableReference]).toContain(actual);
    };
    const expectLowerMenuGeometry = () => {
      expect(
        getComputedStyle(shell!).getPropertyValue('--app-sider-menu-item-height').trim(),
      ).toBe('40px');
      expect(getComputedStyle(shell!).getPropertyValue('--app-sider-collapsed-width').trim()).toBe(
        '64px',
      );

      const items = lowerMenuItems();
      expect(items).toHaveLength(7);

      for (const item of items) {
        const style = getComputedStyle(item);
        expectResolvedOrVariable(style.height, '40px', 'var(--app-sider-menu-item-height)');
        expectResolvedOrVariable(style.lineHeight, '40px', 'var(--app-sider-menu-item-height)');
        expect(style.marginTop).toBe('0px');
        expect(style.marginBottom).toBe('0px');
        expect(style.width).toBe('100%');
      }
    };
    const expectSiderMenuItemContract = (itemCount: number) => {
      const items = siderMenuItems();
      expect(items).toHaveLength(itemCount);

      for (const item of items) {
        const style = getComputedStyle(item);
        expect(style.left).toBe('0px');
        expect(style.width).toBe('100%');
      }

      const titleContents = siderMenuTitleContents();
      expect(titleContents.length).toBeGreaterThanOrEqual(itemCount);

      for (const titleContent of titleContents) {
        const style = getComputedStyle(titleContent);
        expect(style.minWidth).toBe('0px');
        expect(['40px', 'normal', 'inherit', '1.2', 'var(--app-sider-menu-item-height)']).toContain(
          style.lineHeight,
        );
      }
    };
    const expectLowerSectionGeometry = () => {
      const siderStyle = getComputedStyle(sider!);
      expect(siderStyle.overflowX).toBe('hidden');
      expect(siderStyle.overflowY).toBe('auto');

      const accountStyle = getComputedStyle(accountSettingsNav()!);
      expect(accountStyle.paddingTop).toBe('12px');
      expect(accountStyle.marginBottom).toBe('8px');

      const administrationStyle = getComputedStyle(administrationNav()!);
      expect(administrationStyle.paddingTop).toBe('12px');
    };
    const expectExpandedAdministrationHeadingGeometry = () => {
      const heading = administrationHeading();
      const toggle = administrationHeadingToggle();
      const label = heading?.querySelector<HTMLElement>('.sidebar-section-label');

      expect(heading).not.toBeNull();
      expect(toggle).not.toBeNull();
      expect(label).not.toBeNull();

      const headingStyle = getComputedStyle(heading!);
      expect(headingStyle.height).toBe('32px');
      expect(headingStyle.paddingBottom).toBe('8px');

      const labelStyle = getComputedStyle(label!);
      expect(labelStyle.lineHeight).toBe('24px');

      const toggleStyle = getComputedStyle(toggle!);
      expect(toggleStyle.width).toBe('24px');
      expect(toggleStyle.minWidth).toBe('24px');
      expect(toggleStyle.height).toBe('24px');
      expect(toggleStyle.paddingTop).toBe('0px');
      expect(toggleStyle.paddingBottom).toBe('0px');
    };
    const expectHiddenAdministrationToggleGeometry = () => {
      const toggle = administrationHiddenToggle();
      const label = toggle?.querySelector<HTMLElement>('.administration-toggle-label');

      expect(toggle).not.toBeNull();
      expect(label).not.toBeNull();

      const toggleStyle = getComputedStyle(toggle!);
      expect(toggleStyle.height).toBe('32px');

      const labelStyle = getComputedStyle(label!);
      expect(labelStyle.lineHeight).toBe('24px');
    };
    const expectCollapsedAdministrationToggleGeometry = () => {
      const toggle = administrationCollapsedToggle();

      expect(toggle).not.toBeNull();

      const toggleStyle = getComputedStyle(toggle!);
      expectResolvedOrVariable(
        toggleStyle.width,
        '64px',
        'var(--app-sider-collapsed-width)',
      );
      expectResolvedOrVariable(
        toggleStyle.height,
        '40px',
        'var(--app-sider-menu-item-height)',
      );
      expect(toggleStyle.paddingTop).toBe('0px');
      expect(toggleStyle.paddingBottom).toBe('0px');
    };

    expectLowerSectionGeometry();
    expectLowerMenuGeometry();
    expectSiderMenuItemContract(14);
    expectExpandedAdministrationHeadingGeometry();

    theme.use('dark');
    fixture.detectChanges();

    expectLowerSectionGeometry();
    expectLowerMenuGeometry();
    expectSiderMenuItemContract(14);
    expectExpandedAdministrationHeadingGeometry();

    administrationHeadingToggle()?.click();
    fixture.detectChanges();

    expectLowerSectionGeometry();
    expectLowerMenuGeometry();
    expectSiderMenuItemContract(14);
    expectHiddenAdministrationToggleGeometry();

    theme.use('light');
    fixture.detectChanges();

    expectLowerSectionGeometry();
    expectLowerMenuGeometry();
    expectSiderMenuItemContract(14);
    expectHiddenAdministrationToggleGeometry();

    administrationHiddenToggle()?.click();
    fixture.detectChanges();

    fixture.componentInstance.toggleSider();
    fixture.detectChanges();

    expectLowerSectionGeometry();
    expectLowerMenuGeometry();
    expectSiderMenuItemContract(12);
    expectCollapsedAdministrationToggleGeometry();

    for (const menu of lowerMenus()) {
      expect(menu.classList.contains('ant-menu-inline-collapsed')).toBe(true);
      expectResolvedOrVariable(
        getComputedStyle(menu).width,
        '64px',
        'var(--app-sider-collapsed-width)',
      );
    }

    theme.use('dark');
    fixture.detectChanges();

    expectLowerSectionGeometry();
    expectLowerMenuGeometry();
    expectSiderMenuItemContract(12);
    expectCollapsedAdministrationToggleGeometry();

    for (const menu of lowerMenus()) {
      expect(menu.classList.contains('ant-menu-dark')).toBe(true);
      expectResolvedOrVariable(
        getComputedStyle(menu).width,
        '64px',
        'var(--app-sider-collapsed-width)',
      );
    }
  });

  it('renders a toolbar notifications button for authenticated users', () => {
    const auth = TestBed.inject(AuthService);
    auth.user.set(testUser);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector<HTMLButtonElement>(
      '[data-testid="notifications-toggle"]',
    );

    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toBe('Notifications');
  });

  it('toggles and persists the sider collapsed state', () => {
    const auth = TestBed.inject(AuthService);
    auth.user.set(testUser);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector<HTMLButtonElement>('[data-testid="sider-toggle"]');

    expect(fixture.componentInstance.isSiderCollapsed()).toBe(false);
    expect(button?.getAttribute('aria-label')).toBe('Collapse menu');

    button?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.isSiderCollapsed()).toBe(true);
    expect(localStorage.getItem('smart-dms-sider-collapsed')).toBe('true');
    expect(button?.getAttribute('aria-label')).toBe('Expand menu');

    fixture.destroy();
    const restoredFixture = TestBed.createComponent(AppComponent);
    restoredFixture.detectChanges();

    expect(restoredFixture.componentInstance.isSiderCollapsed()).toBe(true);
  });

  it('toggles and persists the administration navigation visibility', () => {
    const auth = TestBed.inject(AuthService);
    auth.user.set(testUser);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const adminMenuItems = () =>
      compiled.querySelectorAll<HTMLElement>(
        '.administration-nav ul.sider-menu > li.ant-menu-item',
      );
    const adminMenuPanel = () => compiled.querySelector<HTMLElement>('#administration-menu-panel');
    const toggle = () =>
      compiled.querySelector<HTMLButtonElement>('[data-testid="admin-navigation-toggle"]');

    expect(adminMenuItems()).toHaveLength(6);
    expect(adminMenuPanel()?.getAttribute('aria-hidden')).toBe('false');
    expect(toggle()?.getAttribute('aria-label')).toBe('Hide administration');
    expect(toggle()?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle()?.textContent?.replace(/\s+/g, ' ').trim()).toBe('');

    toggle()?.click();
    fixture.detectChanges();

    expect(localStorage.getItem(adminNavigationHiddenStorageKey)).toBe('true');
    expect(adminMenuItems()).toHaveLength(6);
    expect(adminMenuPanel()?.getAttribute('aria-hidden')).toBe('true');
    expect(adminMenuPanel()?.getAttribute('inert')).toBe('');
    expect(adminMenuPanel()?.classList.contains('administration-menu-panel-hidden')).toBe(true);
    expect(toggle()?.getAttribute('aria-label')).toBe('Show administration');
    expect(toggle()?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle()?.textContent?.replace(/\s+/g, ' ').trim()).toBe('ADMINISTRATION');
    expect(toggle()?.textContent).not.toContain('Show administration');

    fixture.destroy();
    const restoredFixture = TestBed.createComponent(AppComponent);
    restoredFixture.detectChanges();
    const restoredCompiled = restoredFixture.nativeElement as HTMLElement;
    const restoredToggle = restoredCompiled.querySelector<HTMLButtonElement>(
      '[data-testid="admin-navigation-toggle"]',
    );

    expect(
      restoredCompiled.querySelectorAll<HTMLElement>(
        '.administration-nav ul.sider-menu > li.ant-menu-item',
      ),
    ).toHaveLength(6);
    expect(
      restoredCompiled
        .querySelector<HTMLElement>('#administration-menu-panel')
        ?.getAttribute('aria-hidden'),
    ).toBe('true');
    expect(restoredToggle?.getAttribute('aria-label')).toBe('Show administration');
    expect(restoredToggle?.textContent?.replace(/\s+/g, ' ').trim()).toBe('ADMINISTRATION');

    restoredToggle?.click();
    restoredFixture.detectChanges();

    expect(localStorage.getItem(adminNavigationHiddenStorageKey)).toBe('false');
    expect(
      restoredCompiled
        .querySelector<HTMLElement>('#administration-menu-panel')
        ?.getAttribute('aria-hidden'),
    ).toBe('false');
    expect(
      restoredCompiled.querySelectorAll<HTMLElement>(
        '.administration-nav ul.sider-menu > li.ant-menu-item',
      ),
    ).toHaveLength(6);
  });

  it('allows the content area to shrink when the sider expands', () => {
    const auth = TestBed.inject(AuthService);
    auth.user.set(testUser);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const main = compiled.querySelector<HTMLElement>('.app-main');
    const content = compiled.querySelector<HTMLElement>('.app-content');

    expect(getComputedStyle(main!).minWidth).toBe('0px');
    expect(getComputedStyle(content!).minWidth).toBe('0px');
    expect(getComputedStyle(content!).maxWidth).toBe('100%');
  });

  it('notifies responsive tables when the sider width changes', () => {
    const auth = TestBed.inject(AuthService);
    auth.user.set(testUser);
    const listener = vi.fn();
    globalThis.addEventListener(APP_LAYOUT_RESIZE_EVENT, listener);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    try {
      fixture.componentInstance.toggleSider();

      expect(listener).toHaveBeenCalled();
    } finally {
      globalThis.removeEventListener(APP_LAYOUT_RESIZE_EVENT, listener);
    }
  });

  it('shows the current route breadcrumb only when the sider is collapsed', async () => {
    const auth = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    auth.user.set(testUser);

    const fixture = TestBed.createComponent(AppComponent);
    await router.navigateByUrl('/documents');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector<HTMLButtonElement>('[data-testid="sider-toggle"]');

    expect(compiled.querySelector<HTMLElement>('.header-breadcrumb')).toBeNull();

    button?.click();
    fixture.detectChanges();

    const breadcrumb = compiled.querySelector<HTMLElement>('.header-breadcrumb');
    expect(breadcrumb?.getAttribute('aria-label')).toBe('Current page');
    expect(breadcrumb?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Documents');
  });

  it('updates the collapsed header breadcrumb from route data', async () => {
    localStorage.setItem('smart-dms-sider-collapsed', 'true');
    const auth = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    auth.user.set(testUser);

    const fixture = TestBed.createComponent(AppComponent);
    const compiled = fixture.nativeElement as HTMLElement;

    await router.navigateByUrl('/inbox');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      compiled
        .querySelector<HTMLElement>('.header-breadcrumb')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim(),
    ).toBe('Inbox');

    await router.navigateByUrl('/users');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      compiled
        .querySelector<HTMLElement>('.header-breadcrumb')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim(),
    ).toBe('Administration | Users');
  });

  it('shows ungrouped administration items only for admins', () => {
    const auth = TestBed.inject(AuthService);
    auth.user.set(testUser);

    const adminFixture = TestBed.createComponent(AppComponent);
    adminFixture.detectChanges();
    const adminText = (adminFixture.nativeElement as HTMLElement).textContent ?? '';

    expect(adminText).toContain('ADMINISTRATION');
    expect(adminText).toContain('Settings');
    expect(adminText).toContain('General');
    expect(adminText).toContain('Users');
    expect(adminText).toContain('AI');
    expect(adminText).toContain('Email');

    auth.user.set({ ...testUser, role: 'User' });
    const userFixture = TestBed.createComponent(AppComponent);
    userFixture.detectChanges();
    const userText = (userFixture.nativeElement as HTMLElement).textContent ?? '';

    expect(userText).not.toContain('ADMINISTRATION');
    expect(userText).not.toContain('General');
    expect(userText).not.toContain('Users');
    expect(userText).not.toContain('AI');
    expect(userText).toContain('Email');
    expect(userText).toContain('Settings');
    expect(
      (userFixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="admin-navigation-toggle"]',
      ),
    ).toBeNull();
  });

  it('logs out from the toolbar button', () => {
    const auth = TestBed.inject(AuthService);
    const documentsRouteReuse = TestBed.inject(DocumentsRouteReuseStrategy);
    const openDocuments = TestBed.inject(OpenDocumentsService);
    const router = TestBed.inject(Router);
    const logout = vi.spyOn(auth, 'logout').mockReturnValue(of(undefined));
    const clearDocumentsRoute = vi.spyOn(documentsRouteReuse, 'clearDocumentsListRoute');
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    auth.user.set(testUser);
    openDocuments.open({ id: 'doc-a', title: 'Invoice A' });

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector<HTMLButtonElement>('[data-testid="logout-button"]');
    expect(button?.textContent?.trim()).toBe('');
    expect(button?.getAttribute('aria-label')).toBe('Log out');

    button?.click();

    expect(logout).toHaveBeenCalledOnce();
    expect(clearDocumentsRoute).toHaveBeenCalledWith(false);
    expect(openDocuments.items()).toEqual([]);
    expect(navigate).toHaveBeenCalledWith('/login');
  });
});
