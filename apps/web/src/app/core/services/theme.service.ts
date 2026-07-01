import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const storageKey = 'smart-dms-theme';
const darkThemeLinkId = 'smart-dms-ng-zorro-dark-theme';
const darkThemeHref = '/assets/theme/ng-zorro-antd.dark.layer.css';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly mode = signal<ThemeMode>(this.resolveInitialMode());

  readonly currentMode = computed(() => this.mode());
  readonly isDark = computed(() => this.mode() === 'dark');
  readonly toggleIcon = computed(() => (this.isDark() ? 'sun' : 'moon'));
  readonly toggleLabelKey = computed(() =>
    this.isDark() ? 'theme.activateLight' : 'theme.activateDark',
  );

  constructor() {
    this.applyMode(this.mode());
  }

  toggle(): void {
    const nextMode: ThemeMode = this.isDark() ? 'light' : 'dark';
    this.use(nextMode);
  }

  use(mode: ThemeMode): void {
    this.mode.set(mode);
    this.persistMode(mode);
    this.applyMode(mode);
  }

  private resolveInitialMode(): ThemeMode {
    const storedMode = this.readStoredMode();
    if (storedMode) {
      return storedMode;
    }

    return this.prefersDarkMode() ? 'dark' : 'light';
  }

  private readStoredMode(): ThemeMode | null {
    try {
      const value = globalThis.localStorage?.getItem(storageKey);
      return value === 'dark' || value === 'light' ? value : null;
    } catch {
      return null;
    }
  }

  private prefersDarkMode(): boolean {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }

  private persistMode(mode: ThemeMode): void {
    try {
      globalThis.localStorage?.setItem(storageKey, mode);
    } catch {
      // Ignore unavailable storage so the UI remains usable in restricted contexts.
    }
  }

  private applyMode(mode: ThemeMode): void {
    const root = this.document.documentElement;

    root.dataset['theme'] = mode;
    root.style.colorScheme = mode;

    if (mode === 'dark') {
      this.ensureDarkThemeLink();
      return;
    }

    this.removeDarkThemeLink();
  }

  private ensureDarkThemeLink(): void {
    if (this.document.getElementById(darkThemeLinkId)) {
      return;
    }

    const link = this.document.createElement('link');
    link.id = darkThemeLinkId;
    link.rel = 'stylesheet';
    link.href = darkThemeHref;
    this.document.head.appendChild(link);
  }

  private removeDarkThemeLink(): void {
    this.document.getElementById(darkThemeLinkId)?.remove();
  }
}
