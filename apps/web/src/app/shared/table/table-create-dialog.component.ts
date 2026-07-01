import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule } from 'ng-zorro-antd/modal';

@Component({
  selector: 'app-table-create-dialog',
  imports: [NzButtonModule, NzIconModule, NzModalModule],
  template: `
    <nz-modal
      [nzVisible]="visible()"
      [nzTitle]="title()"
      [nzFooter]="dialogFooter"
      [nzWidth]="width()"
      (nzOnCancel)="cancel.emit()"
    >
      <ng-container *nzModalContent>
        <ng-content></ng-content>
      </ng-container>
    </nz-modal>

    <ng-template #dialogFooter>
      <button nz-button type="button" [disabled]="createLoading()" (click)="cancel.emit()">
        {{ cancelLabel() }}
      </button>
      <button
        nz-button
        nzType="primary"
        type="button"
        [nzLoading]="createLoading()"
        [disabled]="createDisabled()"
        (click)="create.emit()"
      >
        <span nz-icon nzType="plus"></span>
        {{ createLabel() }}
      </button>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableCreateDialogComponent {
  readonly visible = input(false);
  readonly title = input.required<string>();
  readonly createLabel = input.required<string>();
  readonly cancelLabel = input.required<string>();
  readonly createLoading = input(false);
  readonly createDisabled = input(false);
  readonly width = input<string | number>(520);

  readonly cancel = output<void>();
  readonly create = output<void>();
}
