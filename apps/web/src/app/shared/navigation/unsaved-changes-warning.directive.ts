import { Directive, effect, input } from '@angular/core';

@Directive({
  selector: '[appUnsavedChangesWarning]',
})
export class UnsavedChangesWarningDirective {
  readonly enabled = input(false, { alias: 'appUnsavedChangesWarning' });

  private readonly beforeUnloadHandler = (event: BeforeUnloadEvent): void => {
    if (!this.enabled()) {
      return;
    }

    event.preventDefault();
    event.returnValue = '';
  };

  constructor() {
    effect((onCleanup) => {
      if (!this.enabled()) {
        return;
      }

      globalThis.addEventListener?.('beforeunload', this.beforeUnloadHandler);
      onCleanup(() =>
        globalThis.removeEventListener?.('beforeunload', this.beforeUnloadHandler),
      );
    });
  }
}
