import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { pendingChangesGuard, type PendingChangesAware } from './pending-changes.guard';

describe('pendingChangesGuard', () => {
  const cleanComponent: PendingChangesAware = { hasPendingChanges: () => false };
  const dirtyComponent: PendingChangesAware = { hasPendingChanges: () => true };

  function runGuard(component: PendingChangesAware) {
    return TestBed.runInInjectionContext(() =>
      pendingChangesGuard(component, {} as never, {} as never, {} as never),
    );
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: TranslateService,
          useValue: { instant: () => 'Discard unsaved changes?' },
        },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows navigation without pending changes', () => {
    const confirmSpy = vi.spyOn(globalThis, 'confirm');

    expect(runGuard(cleanComponent)).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('asks before navigating away with pending changes', () => {
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(false);

    expect(runGuard(dirtyComponent)).toBe(false);
    expect(confirmSpy).toHaveBeenCalledWith('Discard unsaved changes?');
  });
});
