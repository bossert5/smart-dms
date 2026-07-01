import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

const storageKey = 'smart-dms-theme';
const darkThemeLinkId = 'smart-dms-ng-zorro-dark-theme';

function stubPreferredColorScheme(isDark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: isDark && query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function resetThemeDom(): void {
  localStorage.removeItem(storageKey);
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
  document.getElementById(darkThemeLinkId)?.remove();
}

describe('ThemeService', () => {
  afterEach(() => {
    resetThemeDom();
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('initializes from a stored dark mode preference', () => {
    localStorage.setItem(storageKey, 'dark');
    stubPreferredColorScheme(false);

    const service = TestBed.inject(ThemeService);

    expect(service.isDark()).toBe(true);
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.getElementById(darkThemeLinkId)).not.toBeNull();
  });

  it('falls back to the system color scheme when no preference is stored', () => {
    stubPreferredColorScheme(true);

    const service = TestBed.inject(ThemeService);

    expect(service.isDark()).toBe(true);
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('toggles, persists, and applies the theme mode', () => {
    stubPreferredColorScheme(false);
    const service = TestBed.inject(ThemeService);

    service.toggle();

    expect(service.isDark()).toBe(true);
    expect(localStorage.getItem(storageKey)).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.getElementById(darkThemeLinkId)?.getAttribute('href')).toBe(
      '/assets/theme/ng-zorro-antd.dark.layer.css',
    );

    service.toggle();

    expect(service.isDark()).toBe(false);
    expect(localStorage.getItem(storageKey)).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(document.getElementById(darkThemeLinkId)).toBeNull();
  });
});
