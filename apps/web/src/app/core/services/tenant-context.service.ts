import { computed, effect, inject, Injectable, signal } from '@angular/core';
import type { TenantScope, TenantSummaryDto } from '@smart-dms/shared-dto';
import { AuthService } from './auth.service';

const TENANT_SCOPE_STORAGE_KEY = 'smart-dms-tenant-scope';
export const ALL_TENANTS_SCOPE = 'all';

@Injectable({ providedIn: 'root' })
export class TenantContextService {
  private readonly auth = inject(AuthService);

  readonly activeScope = signal<TenantScope>(this.readStoredScope());
  readonly tenants = computed(() => this.auth.user()?.tenants ?? []);
  readonly activeTenants = computed(() => this.tenants().filter((tenant) => tenant.isActive));
  readonly hasNoActiveTenants = computed(
    () => this.auth.user() !== null && this.activeTenants().length === 0,
  );
  readonly hasSingleActiveTenant = computed(() => this.activeTenants().length === 1);
  readonly hasMultipleActiveTenants = computed(() => this.activeTenants().length > 1);
  readonly activeTenant = computed(() => {
    const scope = this.activeScope();
    return scope === ALL_TENANTS_SCOPE
      ? null
      : (this.activeTenants().find((tenant) => tenant.id === scope) ?? null);
  });
  readonly isAllTenants = computed(() => this.activeScope() === ALL_TENANTS_SCOPE);

  constructor() {
    effect(() => {
      const activeTenants = this.activeTenants();
      if (activeTenants.length === 0) {
        if (this.activeScope() !== ALL_TENANTS_SCOPE) {
          this.setScope(ALL_TENANTS_SCOPE);
        }
        return;
      }

      const scope = this.activeScope();
      if (
        scope === ALL_TENANTS_SCOPE ||
        activeTenants.some((tenant) => tenant.id === scope)
      ) {
        return;
      }

      this.setScope(
        activeTenants.find((tenant) => tenant.id === this.auth.user()?.defaultTenantId)?.id ??
          activeTenants[0].id,
      );
    });
  }

  setScope(scope: TenantScope): void {
    this.activeScope.set(scope);
    this.persistScope(scope);
  }

  uploadTenantOptions(): readonly TenantSummaryDto[] {
    return this.activeTenants();
  }

  private readStoredScope(): TenantScope {
    try {
      const value = globalThis.localStorage?.getItem(TENANT_SCOPE_STORAGE_KEY);
      return value && value.length > 0 ? value : ALL_TENANTS_SCOPE;
    } catch {
      return ALL_TENANTS_SCOPE;
    }
  }

  private persistScope(scope: TenantScope): void {
    try {
      globalThis.localStorage?.setItem(TENANT_SCOPE_STORAGE_KEY, scope);
    } catch {
      // Ignore unavailable storage so tenant switching remains usable.
    }
  }
}
