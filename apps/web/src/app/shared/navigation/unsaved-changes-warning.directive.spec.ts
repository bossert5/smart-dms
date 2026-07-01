import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UnsavedChangesWarningDirective } from './unsaved-changes-warning.directive';

@Component({
  imports: [UnsavedChangesWarningDirective],
  template: `<section [appUnsavedChangesWarning]="isDirty()">Content</section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class UnsavedChangesHostComponent {
  readonly isDirty = signal(false);
}

describe('UnsavedChangesWarningDirective', () => {
  it('prevents browser unload only while enabled', () => {
    const fixture = TestBed.configureTestingModule({
      imports: [UnsavedChangesHostComponent],
    }).createComponent(UnsavedChangesHostComponent);
    fixture.detectChanges();

    const cleanEvent = new Event('beforeunload', { cancelable: true });
    expect(globalThis.dispatchEvent(cleanEvent)).toBe(true);

    fixture.componentInstance.isDirty.set(true);
    fixture.detectChanges();

    const dirtyEvent = new Event('beforeunload', { cancelable: true });
    expect(globalThis.dispatchEvent(dirtyEvent)).toBe(false);

    fixture.componentInstance.isDirty.set(false);
    fixture.detectChanges();

    const revertedEvent = new Event('beforeunload', { cancelable: true });
    expect(globalThis.dispatchEvent(revertedEvent)).toBe(true);
  });
});
