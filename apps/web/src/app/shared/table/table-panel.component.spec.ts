import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TablePanelComponent } from './table-panel.component';

@Component({
  imports: [TablePanelComponent],
  template: `
    <ng-template #actions>
      <button type="button">Refresh</button>
    </ng-template>

    <app-table-panel [actions]="actions">
      <table>
        <tbody>
          <tr>
            <td>Row</td>
          </tr>
        </tbody>
      </table>
    </app-table-panel>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TablePanelHostComponent {}

@Component({
  imports: [TablePanelComponent],
  template: `
    <ng-template #emptyActions></ng-template>

    <app-table-panel [actions]="emptyActions">
      <table>
        <tbody>
          <tr>
            <td>Row</td>
          </tr>
        </tbody>
      </table>
    </app-table-panel>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class EmptyTablePanelActionsHostComponent {}

describe('TablePanelComponent', () => {
  it('renders optional actions above projected table content by default', async () => {
    await TestBed.configureTestingModule({
      imports: [TablePanelHostComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(TablePanelHostComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const actions = compiled.querySelector('.app-table-panel__actions');

    expect(actions?.textContent).toContain('Refresh');
    expect(actions?.nextElementSibling?.classList).toContain('app-table-panel__content');
    expect(compiled.querySelector('.app-table-panel__content table')?.textContent).toContain('Row');
  });

  it('keeps an empty provided actions bar visible to reserve table layout space', async () => {
    await TestBed.configureTestingModule({
      imports: [EmptyTablePanelActionsHostComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(EmptyTablePanelActionsHostComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const actions = compiled.querySelector<HTMLElement>('.app-table-panel__actions');

    expect(actions).not.toBeNull();
    expect(actions?.textContent?.trim()).toBe('');
    expect(actions?.nextElementSibling?.classList).toContain('app-table-panel__content');
    expect(getComputedStyle(actions!).display).not.toBe('none');
    expect(getComputedStyle(actions!).minHeight).toBe('53px');
  });

  it('bounds projected table content to the available panel width', async () => {
    await TestBed.configureTestingModule({
      imports: [TablePanelHostComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(TablePanelHostComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const host = compiled.querySelector<HTMLElement>('app-table-panel');
    const panel = compiled.querySelector<HTMLElement>('.app-table-panel');
    const content = compiled.querySelector<HTMLElement>('.app-table-panel__content');

    expect(getComputedStyle(host!).minWidth).toBe('0px');
    expect(getComputedStyle(host!).maxWidth).toBe('100%');
    expect(getComputedStyle(panel!).maxWidth).toBe('100%');
    expect(getComputedStyle(content!).overflow).toBe('hidden');
    expect(getComputedStyle(content!).maxWidth).toBe('100%');
  });
});
