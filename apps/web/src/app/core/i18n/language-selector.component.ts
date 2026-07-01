import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { LanguageService } from './language.service';

@Component({
  selector: 'app-language-selector',
  imports: [FormsModule, TranslatePipe, NzSelectModule],
  template: `
    <nz-select
      [id]="selectId()"
      data-testid="language-selector"
      class="language-selector"
      nzSize="small"
      [ngModel]="language.currentLanguage()"
      [ngModelOptions]="standaloneNgModelOptions"
      [attr.aria-label]="'language.label' | translate"
      (ngModelChange)="language.use($event)"
    >
      @for (option of language.options; track option.code) {
        <nz-option [nzValue]="option.code" [nzLabel]="option.labelKey | translate"></nz-option>
      }
    </nz-select>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }

      .language-selector {
        width: var(--language-selector-width, 112px);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageSelectorComponent {
  readonly language = inject(LanguageService);
  readonly selectId = input<string | null>(null);
  readonly standaloneNgModelOptions = { standalone: true };
}
