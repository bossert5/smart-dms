import { TestBed } from '@angular/core/testing';
import { LANGUAGE_STORAGE_KEY, LanguageService } from './language.service';
import { provideI18nTesting } from '../../testing/i18n-testing';

function stubNavigatorLanguage(languages: readonly string[], language?: string): void {
  vi.stubGlobal('navigator', {
    languages,
    language,
  });
}

describe('LanguageService', () => {
  afterEach(() => {
    try {
      globalThis.localStorage?.removeItem?.(LANGUAGE_STORAGE_KEY);
    } catch {
      // Ignore mocked storage failures.
    }
    document.documentElement.lang = '';
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('initializes from a stored language preference', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    stubNavigatorLanguage(['de-DE'], 'de-DE');

    const service = TestBed.configureTestingModule({
      providers: [provideI18nTesting()],
    }).inject(LanguageService);

    expect(service.currentLanguage()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('falls back to the browser language when no preference is stored', () => {
    stubNavigatorLanguage(['en-US'], 'en-US');

    const service = TestBed.configureTestingModule({
      providers: [provideI18nTesting()],
    }).inject(LanguageService);

    expect(service.currentLanguage()).toBe('en');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });

  it('uses German from the browser language when no preference is stored', () => {
    stubNavigatorLanguage(['de-DE'], 'de-DE');

    const service = TestBed.configureTestingModule({
      providers: [provideI18nTesting()],
    }).inject(LanguageService);

    expect(service.currentLanguage()).toBe('de');
    expect(document.documentElement.lang).toBe('de');
  });

  it('initializes from a stored German language preference', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
    stubNavigatorLanguage(['en-US'], 'en-US');

    const service = TestBed.configureTestingModule({
      providers: [provideI18nTesting()],
    }).inject(LanguageService);

    expect(service.currentLanguage()).toBe('de');
    expect(document.documentElement.lang).toBe('de');
  });

  it('ignores invalid stored languages', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    stubNavigatorLanguage(['en-GB'], 'en-GB');

    const service = TestBed.configureTestingModule({
      providers: [provideI18nTesting()],
    }).inject(LanguageService);

    expect(service.currentLanguage()).toBe('en');
  });

  it('falls back from invalid stored languages to a supported browser language', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    stubNavigatorLanguage(['de-DE'], 'de-DE');

    const service = TestBed.configureTestingModule({
      providers: [provideI18nTesting()],
    }).inject(LanguageService);

    expect(service.currentLanguage()).toBe('de');
  });

  it('uses the document language when browser languages are unavailable', () => {
    document.documentElement.lang = 'en-US';
    stubNavigatorLanguage([]);

    const service = TestBed.configureTestingModule({
      providers: [provideI18nTesting()],
    }).inject(LanguageService);

    expect(service.currentLanguage()).toBe('en');
  });

  it('does not fail when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => {
        throw new Error('storage unavailable');
      }),
      setItem: vi.fn(() => {
        throw new Error('storage unavailable');
      }),
    });
    stubNavigatorLanguage(['en-US'], 'en-US');

    const service = TestBed.configureTestingModule({
      providers: [provideI18nTesting()],
    }).inject(LanguageService);

    expect(() => service.use('en')).not.toThrow();
    expect(service.currentLanguage()).toBe('en');
  });
});
