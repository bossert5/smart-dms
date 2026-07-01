import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, TemplateRef, input } from '@angular/core';

@Component({
  selector: 'app-table-panel',
  imports: [NgTemplateOutlet],
  template: `
    <section class="app-table-panel">
      @if (leftActions() || actions()) {
        <div
          class="app-table-panel__actions"
          [class.app-table-panel__actions--start]="actionsAlign() === 'start'"
          [class.app-table-panel__actions--split]="!!leftActions() && !!actions()"
        >
          @if (leftActions(); as leftActionTemplate) {
            <div class="app-table-panel__actions-group app-table-panel__actions-group--left">
              <ng-container [ngTemplateOutlet]="leftActionTemplate"></ng-container>
            </div>
          }
          @if (actions(); as actionTemplate) {
            <div class="app-table-panel__actions-group app-table-panel__actions-group--right">
              <ng-container [ngTemplateOutlet]="actionTemplate"></ng-container>
            </div>
          }
        </div>
      }

      <div class="app-table-panel__content">
        <ng-content></ng-content>
      </div>
    </section>
  `,
  styleUrl: './table-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TablePanelComponent {
  readonly leftActions = input<TemplateRef<unknown> | null>(null);
  readonly actions = input<TemplateRef<unknown> | null>(null);
  readonly actionsAlign = input<'start' | 'end'>('end');
}
