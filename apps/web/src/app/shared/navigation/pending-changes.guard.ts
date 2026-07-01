import { inject } from '@angular/core';
import type { CanDeactivateFn } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';

export interface PendingChangesAware {
  hasPendingChanges(): boolean;
}

export const pendingChangesGuard: CanDeactivateFn<PendingChangesAware> = (component) => {
  if (!component.hasPendingChanges()) {
    return true;
  }

  const translate = inject(TranslateService);
  const message = translate.instant('common.unsavedChangesConfirm');
  return globalThis.confirm?.(message) ?? true;
};
