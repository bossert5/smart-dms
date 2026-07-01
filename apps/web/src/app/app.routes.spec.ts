import { TestBed } from '@angular/core/testing';
import type { RedirectFunction } from '@angular/router';
import { routes } from './app.routes';
import { authGuard } from './core/guards/auth.guard';
import { UserPreferencesService } from './core/services/user-preferences.service';
import { pendingChangesGuard } from './shared/navigation/pending-changes.guard';

describe('routes', () => {
  it('protects the dashboard route', () => {
    const dashboardRoute = routes.find((entry) => entry.path === 'dashboard');

    expect(dashboardRoute?.canActivate).toContain(authGuard);
    expect(dashboardRoute?.loadComponent).toBeDefined();
  });

  it('redirects the root URL to the selected start route', () => {
    const rootRoute = routes.find((entry) => entry.path === '');
    const preferences = { startRoute: () => '/inbox' };

    TestBed.configureTestingModule({
      providers: [{ provide: UserPreferencesService, useValue: preferences }],
    });

    const redirectTo = rootRoute?.redirectTo as RedirectFunction;

    expect(rootRoute?.pathMatch).toBe('full');
    expect(TestBed.runInInjectionContext(() => redirectTo({} as never))).toBe('/inbox');
  });

  it('protects the documents route behind the auth guard', () => {
    const route = routes.find((entry) => entry.path === 'documents');

    expect(route?.canActivate).toContain(authGuard);
  });

  it('adds a protected inbox document detail route', () => {
    const route = routes.find((entry) => entry.path === 'inbox/:id');

    expect(route?.canActivate).toContain(authGuard);
    expect(route?.loadComponent).toBeDefined();
    expect(route?.canDeactivate).toContain(pendingChangesGuard);
    expect(route?.data?.['documentDetailReturnTarget']).toBe('inbox');
  });

  it('protects accepted document details from leaving with unsaved changes', () => {
    const route = routes.find((entry) => entry.path === 'documents/:id');

    expect(route?.canActivate).toContain(authGuard);
    expect(route?.canDeactivate).toContain(pendingChangesGuard);
  });

  it('protects the inbox from leaving with unsaved changes', () => {
    const route = routes.find((entry) => entry.path === 'inbox');

    expect(route?.canActivate).toContain(authGuard);
    expect(route?.canDeactivate).toContain(pendingChangesGuard);
  });

  it('adds the email inbox route', () => {
    const route = routes.find((entry) => entry.path === 'email');

    expect(route?.canActivate).toContain(authGuard);
    expect(route?.loadComponent).toBeDefined();
  });

  it('protects the users route from leaving with unsaved changes', () => {
    const route = routes.find((entry) => entry.path === 'users');

    expect(route?.canActivate).toContain(authGuard);
    expect(route?.canDeactivate).toContain(pendingChangesGuard);
  });

  it('adds the admin email settings route', () => {
    const settingsRoute = routes.find((entry) => entry.path === 'settings');
    const route = settingsRoute?.children?.find((entry) => entry.path === 'email');

    expect(route?.loadComponent).toBeDefined();
  });

  it('protects document settings from leaving with unsaved changes', () => {
    const settingsRoute = routes.find((entry) => entry.path === 'settings');
    const route = settingsRoute?.children?.find((entry) => entry.path === 'documents');

    expect(route?.loadComponent).toBeDefined();
    expect(route?.canDeactivate).toContain(pendingChangesGuard);
  });

  it('protects tenant settings from leaving with unsaved changes', () => {
    const settingsRoute = routes.find((entry) => entry.path === 'settings');
    const route = settingsRoute?.children?.find((entry) => entry.path === 'tenants');

    expect(route?.loadComponent).toBeDefined();
    expect(route?.canDeactivate).toContain(pendingChangesGuard);
  });
});
