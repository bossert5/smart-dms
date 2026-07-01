import { TestBed } from '@angular/core/testing';
import {
  OPEN_DOCUMENTS_STORAGE_KEY,
  OpenDocumentsService,
  type OpenDocumentItem,
} from './open-documents.service';

const storedDocument: OpenDocumentItem = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd990',
  title: 'Stored invoice',
  openedAt: '2026-05-08T09:00:00.000Z',
  lastOpenedAt: '2026-05-08T09:05:00.000Z',
};

describe('OpenDocumentsService', () => {
  afterEach(() => {
    localStorage.removeItem(OPEN_DOCUMENTS_STORAGE_KEY);
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('loads open documents from browser storage', () => {
    localStorage.setItem(OPEN_DOCUMENTS_STORAGE_KEY, JSON.stringify([storedDocument]));

    const service = TestBed.inject(OpenDocumentsService);

    expect(service.items()).toEqual([storedDocument]);
  });

  it('falls back to an empty list when browser storage is invalid', () => {
    localStorage.setItem(OPEN_DOCUMENTS_STORAGE_KEY, '{');

    const service = TestBed.inject(OpenDocumentsService);

    expect(service.items()).toEqual([]);
  });

  it('deduplicates documents without changing their position', () => {
    vi.useFakeTimers();
    const service = TestBed.inject(OpenDocumentsService);

    vi.setSystemTime(new Date('2026-05-08T09:00:00.000Z'));
    service.open({ id: 'doc-a', title: 'Invoice A' });

    vi.setSystemTime(new Date('2026-05-08T09:01:00.000Z'));
    service.open({ id: 'doc-b', title: 'Invoice B' });

    vi.setSystemTime(new Date('2026-05-08T09:02:00.000Z'));
    service.open({ id: 'doc-a', title: 'Invoice A updated' });

    expect(service.items()).toEqual([
      {
        id: 'doc-a',
        title: 'Invoice A updated',
        openedAt: '2026-05-08T09:00:00.000Z',
        lastOpenedAt: '2026-05-08T09:02:00.000Z',
      },
      {
        id: 'doc-b',
        title: 'Invoice B',
        openedAt: '2026-05-08T09:01:00.000Z',
        lastOpenedAt: '2026-05-08T09:01:00.000Z',
      },
    ]);
    expect(JSON.parse(localStorage.getItem(OPEN_DOCUMENTS_STORAGE_KEY) ?? '[]')).toEqual(
      service.items(),
    );
  });

  it('appends newly opened documents to the end of the list', () => {
    const service = TestBed.inject(OpenDocumentsService);

    service.open({ id: 'doc-a', title: 'Invoice A' });
    service.open({ id: 'doc-b', title: 'Invoice B' });
    service.open({ id: 'doc-c', title: 'Invoice C' });

    expect(service.items().map((item) => item.id)).toEqual(['doc-a', 'doc-b', 'doc-c']);
  });

  it('updates the title of existing open documents without changing their position', () => {
    const service = TestBed.inject(OpenDocumentsService);
    service.open({ id: 'doc-a', title: 'Invoice A' });
    service.open({ id: 'doc-b', title: 'Invoice B' });

    service.updateTitleIfOpen({ id: 'doc-a', title: 'Updated invoice' });

    expect(service.items().map((item) => item.id)).toEqual(['doc-a', 'doc-b']);
    expect(service.items()[0].title).toBe('Updated invoice');
    expect(JSON.parse(localStorage.getItem(OPEN_DOCUMENTS_STORAGE_KEY) ?? '[]')).toEqual(
      service.items(),
    );
  });

  it('does not create a new open document when updating an unknown title', () => {
    const service = TestBed.inject(OpenDocumentsService);

    service.updateTitleIfOpen({ id: 'doc-a', title: 'Invoice A' });

    expect(service.items()).toEqual([]);
    expect(localStorage.getItem(OPEN_DOCUMENTS_STORAGE_KEY)).toBeNull();
  });

  it('reorders open documents and persists the new order', () => {
    const service = TestBed.inject(OpenDocumentsService);
    service.open({ id: 'doc-a', title: 'Invoice A' });
    service.open({ id: 'doc-b', title: 'Invoice B' });
    service.open({ id: 'doc-c', title: 'Invoice C' });

    service.reorder(0, 2);

    expect(service.items().map((item) => item.id)).toEqual(['doc-b', 'doc-c', 'doc-a']);
    expect(
      JSON.parse(localStorage.getItem(OPEN_DOCUMENTS_STORAGE_KEY) ?? '[]').map(
        (item: OpenDocumentItem) => item.id,
      ),
    ).toEqual(['doc-b', 'doc-c', 'doc-a']);
  });

  it('returns the next visible document when closing an open document', () => {
    const service = TestBed.inject(OpenDocumentsService);
    service.open({ id: 'doc-a', title: 'Invoice A' });
    service.open({ id: 'doc-b', title: 'Invoice B' });
    service.open({ id: 'doc-c', title: 'Invoice C' });

    const nextDocument = service.close('doc-b');

    expect(nextDocument?.id).toBe('doc-c');
    expect(service.items().map((item) => item.id)).toEqual(['doc-a', 'doc-c']);
  });

  it('returns the previous document when closing the last visible document', () => {
    const service = TestBed.inject(OpenDocumentsService);
    service.open({ id: 'doc-a', title: 'Invoice A' });
    service.open({ id: 'doc-b', title: 'Invoice B' });
    service.open({ id: 'doc-c', title: 'Invoice C' });

    const nextDocument = service.close('doc-c');

    expect(nextDocument?.id).toBe('doc-b');
    expect(service.items().map((item) => item.id)).toEqual(['doc-a', 'doc-b']);
  });

  it('returns the next document from the manually reordered list', () => {
    const service = TestBed.inject(OpenDocumentsService);
    service.open({ id: 'doc-a', title: 'Invoice A' });
    service.open({ id: 'doc-b', title: 'Invoice B' });
    service.open({ id: 'doc-c', title: 'Invoice C' });
    service.reorder(0, 2);

    const nextDocument = service.close('doc-c');

    expect(nextDocument?.id).toBe('doc-a');
    expect(service.items().map((item) => item.id)).toEqual(['doc-b', 'doc-a']);
  });

  it('clears all open documents', () => {
    const service = TestBed.inject(OpenDocumentsService);
    service.open({ id: 'doc-a', title: 'Invoice A' });

    service.closeAll();

    expect(service.items()).toEqual([]);
    expect(localStorage.getItem(OPEN_DOCUMENTS_STORAGE_KEY)).toBeNull();
  });
});
