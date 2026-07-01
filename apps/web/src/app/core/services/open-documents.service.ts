import { Injectable, signal } from '@angular/core';

export interface OpenDocumentItem {
  readonly id: string;
  readonly title: string;
  readonly openedAt: string;
  readonly lastOpenedAt: string;
}

export const OPEN_DOCUMENTS_STORAGE_KEY = 'smart-dms-open-documents';

@Injectable({ providedIn: 'root' })
export class OpenDocumentsService {
  private readonly itemsSignal = signal<OpenDocumentItem[]>(this.readStoredItems());

  readonly items = this.itemsSignal.asReadonly();

  open(document: { readonly id: string; readonly title: string | null }): void {
    const now = new Date().toISOString();
    const currentItems = this.itemsSignal();
    const existingIndex = currentItems.findIndex((item) => item.id === document.id);
    const title = this.normalizedTitle(document.title);

    if (existingIndex === -1) {
      this.publish([
        ...currentItems,
        {
          id: document.id,
          title,
          openedAt: now,
          lastOpenedAt: now,
        },
      ]);
      return;
    }

    this.publish(
      currentItems.map((item, index) =>
        index === existingIndex
          ? {
              ...item,
              title,
              lastOpenedAt: now,
            }
          : item,
      ),
    );
  }

  updateTitleIfOpen(document: { readonly id: string; readonly title: string | null }): void {
    const currentItems = this.itemsSignal();
    const existingIndex = currentItems.findIndex((item) => item.id === document.id);
    if (existingIndex === -1) {
      return;
    }

    const title = this.normalizedTitle(document.title);
    if (currentItems[existingIndex].title === title) {
      return;
    }

    this.publish(
      currentItems.map((item, index) =>
        index === existingIndex
          ? {
              ...item,
              title,
            }
          : item,
      ),
    );
  }

  close(documentId: string): OpenDocumentItem | null {
    const currentItems = this.itemsSignal();
    const index = currentItems.findIndex((item) => item.id === documentId);
    if (index === -1) {
      return null;
    }

    const nextActiveDocument = currentItems[index + 1] ?? currentItems[index - 1] ?? null;
    this.publish(currentItems.filter((item) => item.id !== documentId));

    return nextActiveDocument;
  }

  closeAll(): void {
    this.publish([]);
  }

  isOpen(documentId: string): boolean {
    return this.itemsSignal().some((item) => item.id === documentId);
  }

  reorder(previousIndex: number, currentIndex: number): void {
    const currentItems = this.itemsSignal();
    if (
      previousIndex === currentIndex ||
      !Number.isInteger(previousIndex) ||
      !Number.isInteger(currentIndex) ||
      previousIndex < 0 ||
      currentIndex < 0 ||
      previousIndex >= currentItems.length ||
      currentIndex >= currentItems.length
    ) {
      return;
    }

    const nextItems = [...currentItems];
    const [movedItem] = nextItems.splice(previousIndex, 1);
    nextItems.splice(currentIndex, 0, movedItem);
    this.publish(nextItems);
  }

  private publish(items: OpenDocumentItem[]): void {
    this.itemsSignal.set(items);
    this.persistItems(items);
  }

  private normalizedTitle(title: string | null): string {
    return title?.trim() || '';
  }

  private readStoredItems(): OpenDocumentItem[] {
    try {
      const storedValue = globalThis.localStorage?.getItem(OPEN_DOCUMENTS_STORAGE_KEY);
      if (!storedValue) {
        return [];
      }

      const parsedValue: unknown = JSON.parse(storedValue);
      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue.filter((item): item is OpenDocumentItem =>
        this.isStoredItem(item),
      );
    } catch {
      return [];
    }
  }

  private isStoredItem(item: unknown): item is OpenDocumentItem {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const candidate = item as Partial<Record<keyof OpenDocumentItem, unknown>>;
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.title === 'string' &&
      typeof candidate.openedAt === 'string' &&
      typeof candidate.lastOpenedAt === 'string'
    );
  }

  private persistItems(items: OpenDocumentItem[]): void {
    try {
      if (items.length === 0) {
        globalThis.localStorage?.removeItem(OPEN_DOCUMENTS_STORAGE_KEY);
        return;
      }

      globalThis.localStorage?.setItem(OPEN_DOCUMENTS_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignore unavailable storage so document navigation remains usable.
    }
  }
}
