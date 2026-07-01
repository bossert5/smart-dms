import { computed, Injectable, signal } from '@angular/core';

export type UserStartRoute = '/dashboard' | '/documents' | '/inbox' | '/calendar' | '/email';

export interface UserStartRouteOption {
  readonly route: UserStartRoute;
  readonly labelKey: string;
}

export const DEFAULT_USER_START_ROUTE: UserStartRoute = '/documents';
export const USER_START_ROUTE_OPTIONS = [
  { route: '/dashboard', labelKey: 'accountSettings.startPage.options.dashboard' },
  { route: '/documents', labelKey: 'accountSettings.startPage.options.documents' },
  { route: '/inbox', labelKey: 'accountSettings.startPage.options.inbox' },
  { route: '/calendar', labelKey: 'accountSettings.startPage.options.calendar' },
  { route: '/email', labelKey: 'accountSettings.startPage.options.email' },
] as const satisfies readonly UserStartRouteOption[];

const startRouteStorageKey = 'smart-dms-user-start-route';
const adminNavigationHiddenStorageKey = 'smart-dms-admin-navigation-hidden';

@Injectable({ providedIn: 'root' })
export class UserPreferencesService {
  private readonly startRouteValue = signal<UserStartRoute>(this.readStartRoute());
  private readonly adminNavigationHiddenValue = signal(
    this.readStoredBoolean(adminNavigationHiddenStorageKey),
  );

  readonly startRoute = computed(() => this.startRouteValue());
  readonly isAdminNavigationHidden = computed(() => this.adminNavigationHiddenValue());
  readonly startRouteOptions = USER_START_ROUTE_OPTIONS;

  setStartRoute(route: UserStartRoute): void {
    this.startRouteValue.set(route);
    this.writeStorageValue(startRouteStorageKey, route);
  }

  setAdminNavigationHidden(isHidden: boolean): void {
    this.adminNavigationHiddenValue.set(isHidden);
    this.writeStorageValue(adminNavigationHiddenStorageKey, String(isHidden));
  }

  toggleAdminNavigationHidden(): void {
    this.setAdminNavigationHidden(!this.adminNavigationHiddenValue());
  }

  private readStartRoute(): UserStartRoute {
    const storedRoute = this.readStorageValue(startRouteStorageKey);
    return isUserStartRoute(storedRoute) ? storedRoute : DEFAULT_USER_START_ROUTE;
  }

  private readStoredBoolean(key: string): boolean {
    return this.readStorageValue(key) === 'true';
  }

  private readStorageValue(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private writeStorageValue(key: string, value: string): void {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Ignore unavailable storage so account preferences remain usable.
    }
  }
}

function isUserStartRoute(value: string | null): value is UserStartRoute {
  return USER_START_ROUTE_OPTIONS.some((option) => option.route === value);
}
