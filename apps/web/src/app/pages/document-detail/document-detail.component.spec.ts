import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import {
  OpenDocumentsService,
  type OpenDocumentItem,
} from '../../core/services/open-documents.service';
import { DocumentDetailComponent } from './document-detail.component';

@Component({
  selector: 'app-document-detail-pane',
  template: '',
  host: {
    '[attr.data-document-id]': 'documentId()',
    '[attr.data-active]': 'isActive()',
    '[attr.data-back-link]': 'backLink()',
  },
})
class FakeDocumentDetailPaneComponent {
  readonly documentId = input.required<string>();
  readonly isActive = input(true);
  readonly backLink = input('/documents');
}

const openedAt = '2026-05-08T09:00:00.000Z';

function openDocument(id: string, title: string): OpenDocumentItem {
  return {
    id,
    title,
    openedAt,
    lastOpenedAt: openedAt,
  };
}

async function createComponent(options?: {
  readonly activeDocumentId?: string;
  readonly openItems?: OpenDocumentItem[];
  readonly returnTarget?: 'documents' | 'inbox';
  readonly returnTo?: string;
}) {
  const paramMap = new BehaviorSubject(
    convertToParamMap({ id: options?.activeDocumentId ?? 'doc-a' }),
  );
  const queryParamMap = new BehaviorSubject(
    convertToParamMap(options?.returnTo ? { returnTo: options.returnTo } : {}),
  );
  const openItems = signal(options?.openItems ?? []);
  const openDocuments = {
    items: openItems.asReadonly(),
    isOpen: (documentId: string) => openItems().some((item) => item.id === documentId),
  };

  await TestBed.configureTestingModule({
    imports: [DocumentDetailComponent],
    providers: [
      {
        provide: OpenDocumentsService,
        useValue: openDocuments,
      },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            data: { documentDetailReturnTarget: options?.returnTarget ?? 'documents' },
            paramMap: paramMap.value,
            queryParamMap: queryParamMap.value,
          },
          paramMap: paramMap.asObservable(),
          queryParamMap: queryParamMap.asObservable(),
        },
      },
    ],
  })
    .overrideComponent(DocumentDetailComponent, {
      set: {
        imports: [FakeDocumentDetailPaneComponent],
      },
    })
    .compileComponents();

  const fixture = TestBed.createComponent(DocumentDetailComponent);
  fixture.detectChanges();

  return { fixture, openItems, paramMap, queryParamMap };
}

describe('DocumentDetailComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders a single direct pane for documents that are not open', async () => {
    const { fixture } = await createComponent({ activeDocumentId: 'doc-a' });
    const panes = fixture.nativeElement.querySelectorAll('app-document-detail-pane');

    expect(panes).toHaveLength(1);
    expect(panes[0].getAttribute('data-document-id')).toBe('doc-a');
    expect(panes[0].getAttribute('data-active')).toBe('true');
    expect(panes[0].getAttribute('data-back-link')).toBe('/documents');
  });

  it('passes an inbox back link for the inbox detail route', async () => {
    const { fixture } = await createComponent({
      activeDocumentId: 'doc-a',
      returnTarget: 'inbox',
    });
    const pane = fixture.nativeElement.querySelector('app-document-detail-pane');

    expect(pane.getAttribute('data-back-link')).toBe('/inbox');
  });

  it('keeps supporting the inbox return target query parameter', async () => {
    const { fixture } = await createComponent({ activeDocumentId: 'doc-a', returnTo: 'inbox' });
    const pane = fixture.nativeElement.querySelector('app-document-detail-pane');

    expect(pane.getAttribute('data-back-link')).toBe('/inbox');
  });

  it('falls back to documents for unknown return targets', async () => {
    const { fixture } = await createComponent({ activeDocumentId: 'doc-a', returnTo: 'settings' });
    const pane = fixture.nativeElement.querySelector('app-document-detail-pane');

    expect(pane.getAttribute('data-back-link')).toBe('/documents');
  });

  it('renders all open document panes and marks only the active pane interactive', async () => {
    const { fixture } = await createComponent({
      activeDocumentId: 'doc-b',
      openItems: [openDocument('doc-a', 'Invoice A'), openDocument('doc-b', 'Invoice B')],
    });
    const panes = fixture.nativeElement.querySelectorAll('app-document-detail-pane');

    expect(panes).toHaveLength(2);
    expect(panes[0].getAttribute('data-document-id')).toBe('doc-a');
    expect(panes[0].getAttribute('aria-hidden')).toBe('true');
    expect(panes[0].hasAttribute('inert')).toBe(true);
    expect(panes[1].getAttribute('data-document-id')).toBe('doc-b');
    expect(panes[1].getAttribute('aria-hidden')).toBeNull();
    expect(panes[1].hasAttribute('inert')).toBe(false);
  });

  it('keeps existing open panes mounted when switching active documents', async () => {
    const { fixture, paramMap } = await createComponent({
      activeDocumentId: 'doc-a',
      openItems: [openDocument('doc-a', 'Invoice A'), openDocument('doc-b', 'Invoice B')],
    });
    const firstPane = fixture.nativeElement.querySelector(
      'app-document-detail-pane[data-document-id="doc-a"]',
    );

    paramMap.next(convertToParamMap({ id: 'doc-b' }));
    fixture.detectChanges();

    const retainedPane = fixture.nativeElement.querySelector(
      'app-document-detail-pane[data-document-id="doc-a"]',
    );
    expect(retainedPane).toBe(firstPane);
    expect(retainedPane.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps open panes mounted while showing a direct non-open document', async () => {
    const { fixture } = await createComponent({
      activeDocumentId: 'doc-c',
      openItems: [openDocument('doc-a', 'Invoice A'), openDocument('doc-b', 'Invoice B')],
    });
    const panes = fixture.nativeElement.querySelectorAll('app-document-detail-pane');

    expect(panes).toHaveLength(3);
    expect(panes[0].getAttribute('data-document-id')).toBe('doc-a');
    expect(panes[1].getAttribute('data-document-id')).toBe('doc-b');
    expect(panes[2].getAttribute('data-document-id')).toBe('doc-c');
    expect(panes[2].getAttribute('data-active')).toBe('true');
  });
});
