import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';

@Component({
  selector: 'app-table-actions',
  imports: [NzButtonModule, NzIconModule],
  template: `
    <div class="app-table-actions">
      @if (hasChanges()) {
        <div class="app-table-actions__changes">
          <button nz-button type="button" [disabled]="revertDisabled()" (click)="revert.emit()">
            <span nz-icon nzType="undo"></span>
            {{ revertLabel() }}
          </button>
          <button
            nz-button
            nzType="primary"
            type="button"
            [nzLoading]="saveLoading()"
            [disabled]="saveDisabled()"
            (click)="save.emit()"
          >
            <span nz-icon nzType="save"></span>
            {{ saveLabel() }}
          </button>
        </div>
      } @else if (createLabel(); as label) {
        <button
          class="app-table-actions__create"
          nz-button
          nzType="primary"
          type="button"
          [disabled]="createDisabled()"
          (click)="create.emit()"
        >
          <span nz-icon [nzType]="createIcon()"></span>
          {{ label }}
        </button>
      }
    </div>
  `,
  styleUrl: './table-actions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableActionsComponent {
  readonly revertLabel = input.required<string>();
  readonly saveLabel = input.required<string>();
  readonly createLabel = input('');
  readonly createIcon = input('plus');
  readonly hasChanges = input(false);
  readonly revertDisabled = input(false);
  readonly saveDisabled = input(false);
  readonly saveLoading = input(false);
  readonly createDisabled = input(false);

  readonly revert = output<void>();
  readonly save = output<void>();
  readonly create = output<void>();
}
