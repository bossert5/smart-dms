import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards/auth.guard';
import { UserPreferencesService } from './core/services/user-preferences.service';
import { pendingChangesGuard } from './shared/navigation/pending-changes.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
    canActivate: [authGuard],
    data: { shellTitle: ['app.nav.dashboard'] },
  },
  {
    path: 'documents',
    loadComponent: () =>
      import('./pages/documents/documents.component').then((m) => m.DocumentsComponent),
    canActivate: [authGuard],
    data: { reuseDocumentsList: true, shellTitle: ['app.nav.documents'] },
  },
  {
    path: 'inbox',
    loadComponent: () => import('./pages/inbox/inbox.component').then((m) => m.InboxComponent),
    canActivate: [authGuard],
    canDeactivate: [pendingChangesGuard],
    data: { shellTitle: ['app.nav.inbox'] },
  },
  {
    path: 'inbox/:id',
    loadComponent: () =>
      import('./pages/document-detail/document-detail.component').then(
        (m) => m.DocumentDetailComponent,
      ),
    canActivate: [authGuard],
    canDeactivate: [pendingChangesGuard],
    data: { documentDetailReturnTarget: 'inbox', shellTitle: ['app.nav.inbox'] },
  },
  {
    path: 'documents/:id',
    loadComponent: () =>
      import('./pages/document-detail/document-detail.component').then(
        (m) => m.DocumentDetailComponent,
      ),
    canActivate: [authGuard],
    canDeactivate: [pendingChangesGuard],
    data: { documentDetailReturnTarget: 'documents', shellTitle: ['app.nav.documents'] },
  },
  {
    path: 'upload',
    loadComponent: () => import('./pages/upload/upload.component').then((m) => m.UploadComponent),
    canActivate: [authGuard, roleGuard(['Admin', 'User'])],
    data: { shellTitle: ['app.nav.upload'] },
  },
  {
    path: 'calendar',
    loadComponent: () =>
      import('./pages/calendar/calendar.component').then((m) => m.CalendarComponent),
    canActivate: [authGuard],
    data: { shellTitle: ['app.nav.calendar'] },
  },
  {
    path: 'email',
    loadComponent: () => import('./pages/email/email.component').then((m) => m.EmailComponent),
    canActivate: [authGuard, roleGuard(['Admin', 'User'])],
    data: { shellTitle: ['app.nav.email'] },
  },
  {
    path: 'password-change',
    loadComponent: () =>
      import('./pages/password-change/password-change.component').then(
        (m) => m.PasswordChangeComponent,
      ),
    canActivate: [authGuard],
    data: { shellTitle: ['auth.passwordChange.title'] },
  },
  {
    path: 'account/settings',
    loadComponent: () =>
      import('./pages/account-settings/account-settings.component').then(
        (m) => m.AccountSettingsComponent,
      ),
    canActivate: [authGuard],
    data: { shellTitle: ['accountSettings.title'] },
  },
  {
    path: 'users',
    loadComponent: () => import('./pages/users/users.component').then((m) => m.UsersComponent),
    canActivate: [authGuard, roleGuard(['Admin'])],
    canDeactivate: [pendingChangesGuard],
    data: { shellTitle: ['app.breadcrumb.administration', 'app.nav.users'] },
  },
  {
    path: 'settings',
    canActivate: [authGuard, roleGuard(['Admin'])],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'general' },
      {
        path: 'general',
        loadComponent: () =>
          import('./pages/settings/settings-general.component').then(
            (m) => m.SettingsGeneralComponent,
          ),
        data: { shellTitle: ['app.breadcrumb.administration', 'app.nav.general'] },
      },
      {
        path: 'tenants',
        loadComponent: () =>
          import('./pages/settings/settings-tenants.component').then(
            (m) => m.SettingsTenantsComponent,
          ),
        canDeactivate: [pendingChangesGuard],
        data: { shellTitle: ['app.breadcrumb.administration', 'app.nav.tenants'] },
      },
      {
        path: 'documents',
        loadComponent: () =>
          import('./pages/settings/settings-documents.component').then(
            (m) => m.SettingsDocumentsComponent,
          ),
        canDeactivate: [pendingChangesGuard],
        data: { shellTitle: ['app.breadcrumb.administration', 'app.nav.documents'] },
      },
      {
        path: 'ai',
        loadComponent: () =>
          import('./pages/settings/settings-ai.component').then((m) => m.SettingsAiComponent),
        data: { shellTitle: ['app.breadcrumb.administration', 'app.nav.ai'] },
      },
      {
        path: 'email',
        loadComponent: () =>
          import('./pages/settings/settings-email.component').then((m) => m.SettingsEmailComponent),
        data: { shellTitle: ['app.breadcrumb.administration', 'app.nav.email'] },
      },
    ],
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: () => inject(UserPreferencesService).startRoute(),
  },
  { path: '**', redirectTo: 'documents' },
];
