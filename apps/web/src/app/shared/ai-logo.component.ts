import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-ai-logo',
  host: {
    class: 'anticon app-ai-logo',
    '[attr.aria-hidden]': 'ariaHidden()',
    '[attr.aria-label]': 'label()',
    '[attr.role]': 'role()',
  },
  template: '<span class="app-ai-logo__glyph"></span>',
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1em;
        height: 1em;
        color: inherit;
        font-size: inherit;
        line-height: 0;
        vertical-align: -0.125em;
      }

      .app-ai-logo__glyph {
        display: block;
        width: 1em;
        height: 1em;
        background-color: currentColor;
        mask-image: url('/assets/svgs/ai.svg');
        mask-position: center;
        mask-repeat: no-repeat;
        mask-size: contain;
        -webkit-mask-image: url('/assets/svgs/ai.svg');
        -webkit-mask-position: center;
        -webkit-mask-repeat: no-repeat;
        -webkit-mask-size: contain;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiLogoComponent {
  readonly label = input<string | null>(null);

  protected readonly ariaHidden = computed(() => (this.label() ? null : 'true'));
  protected readonly role = computed(() => (this.label() ? 'img' : null));
}
