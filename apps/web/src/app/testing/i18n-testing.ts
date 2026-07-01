import { ENVIRONMENT_INITIALIZER, inject, makeEnvironmentProviders } from '@angular/core';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { de_DE, en_US, provideNzI18n } from 'ng-zorro-antd/i18n';
import deTranslations from '../../../public/i18n/de.json';
import enTranslations from '../../../public/i18n/en.json';

export function provideI18nTesting(language: 'en' | 'de' = 'en') {
  return makeEnvironmentProviders([
    provideNzI18n(language === 'de' ? de_DE : en_US),
    provideTranslateService({
      fallbackLang: 'en',
      lang: language,
    }),
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: () => {
        const translate = inject(TranslateService);
        translate.setTranslation('en', enTranslations, true);
        translate.setTranslation('de', deTranslations, true);
        translate.use(language).subscribe();
      },
    },
  ]);
}
