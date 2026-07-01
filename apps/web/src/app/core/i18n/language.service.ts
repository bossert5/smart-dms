import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { TranslateService } from '@ngx-translate/core';
import { de_DE, en_US, NzI18nService, type NzI18nInterface } from 'ng-zorro-antd/i18n';

export type SupportedLanguage = 'en' | 'de';

export interface LanguageOption {
  readonly code: SupportedLanguage;
  readonly labelKey: string;
}

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
export const LANGUAGE_STORAGE_KEY = 'smart-dms-language';
export const SUPPORTED_LANGUAGES = [
  DEFAULT_LANGUAGE,
  'de',
] as const satisfies readonly SupportedLanguage[];
export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { code: 'en', labelKey: 'language.options.en' },
  { code: 'de', labelKey: 'language.options.de' },
];

const NZ_LOCALE_BY_LANGUAGE: Record<SupportedLanguage, NzI18nInterface> = {
  de: de_DE,
  en: en_US,
};

const INTL_LOCALE_BY_LANGUAGE: Record<SupportedLanguage, string> = {
  de: 'de-DE',
  en: 'en-US',
};

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly document = inject(DOCUMENT);
  private readonly title = inject(Title);
  private readonly translate = inject(TranslateService);
  private readonly nzI18n = inject(NzI18nService);
  private readonly language = signal<SupportedLanguage>(this.resolveInitialLanguage());

  readonly currentLanguage = computed(() => this.language());
  readonly currentLocale = computed(() => INTL_LOCALE_BY_LANGUAGE[this.language()]);
  readonly options = LANGUAGE_OPTIONS;

  constructor() {
    this.translate.addLangs([...SUPPORTED_LANGUAGES]);
    this.translate.setFallbackLang(DEFAULT_LANGUAGE).subscribe();
    this.applyLanguage(this.language());
  }

  use(language: string): void {
    const nextLanguage = this.resolveSupportedLanguage(language);
    this.language.set(nextLanguage);
    this.persistLanguage(nextLanguage);
    this.applyLanguage(nextLanguage);
  }

  private applyLanguage(language: SupportedLanguage): void {
    this.document.documentElement.lang = language;
    this.nzI18n.setLocale(NZ_LOCALE_BY_LANGUAGE[language]);
    this.translate.use(language).subscribe(() => {
      this.title.setTitle(this.translate.instant('common.appName'));
    });
  }

  private resolveInitialLanguage(): SupportedLanguage {
    const storedLanguage = this.readStoredLanguage();
    if (storedLanguage) {
      return storedLanguage;
    }

    return this.resolveSupportedLanguage(this.browserLanguageCandidates());
  }

  private readStoredLanguage(): SupportedLanguage | null {
    try {
      const storedLanguage = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
      return storedLanguage ? this.findSupportedLanguage(storedLanguage) : null;
    } catch {
      return null;
    }
  }

  private browserLanguageCandidates(): readonly string[] {
    const navigatorLanguages = globalThis.navigator?.languages ?? [];
    return [
      ...navigatorLanguages,
      globalThis.navigator?.language,
      this.translate.getBrowserCultureLang(),
      this.translate.getBrowserLang(),
      this.document.documentElement.lang,
    ].filter((language): language is string => Boolean(language));
  }

  private resolveSupportedLanguage(
    language: string | readonly string[] | null | undefined,
  ): SupportedLanguage {
    const candidates = Array.isArray(language) ? language : [language];

    for (const candidate of candidates) {
      const supportedLanguage = this.findSupportedLanguage(candidate);

      if (supportedLanguage) {
        return supportedLanguage;
      }
    }

    return DEFAULT_LANGUAGE;
  }

  private findSupportedLanguage(language: string | null | undefined): SupportedLanguage | null {
    const normalized = language?.toLowerCase();
    const baseLanguage = normalized?.split('-')[0];
    return (
      SUPPORTED_LANGUAGES.find((entry) => entry === normalized || entry === baseLanguage) ?? null
    );
  }

  private persistLanguage(language: SupportedLanguage): void {
    try {
      globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Ignore unavailable storage so language switching remains usable.
    }
  }
}
