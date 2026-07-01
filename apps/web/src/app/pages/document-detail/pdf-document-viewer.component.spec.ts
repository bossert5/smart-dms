import { Component, NgModule, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MinusOutline, PlusOutline } from '@ant-design/icons-angular/icons';
import type { PDFDocumentProxy, PDFProgressData } from 'ng2-pdf-viewer';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { provideI18nTesting } from '../../testing/i18n-testing';
import { PDF_VIEWER_LOADER, PdfDocumentViewerComponent } from './pdf-document-viewer.component';

@Component({
  selector: 'pdf-viewer',
  template: '',
})
class FakeNg2PdfViewerComponent {
  readonly src = input<string | null>(null);
  readonly renderText = input(false, { alias: 'render-text' });
  readonly showAll = input(false, { alias: 'show-all' });
  readonly originalSize = input(true, { alias: 'original-size' });
  readonly fitToPage = input(false, { alias: 'fit-to-page' });
  readonly autoresize = input(false);
  readonly showBorders = input(false, { alias: 'show-borders' });
  readonly zoom = input(1);
  readonly zoomScale = input('page-width', { alias: 'zoom-scale' });
  readonly page = input(1);
  readonly cMapsUrl = input('', { alias: 'c-maps-url' });
  readonly externalLinkTarget = input('blank', { alias: 'external-link-target' });
  readonly pageChange = output<number>();
  readonly afterLoadComplete = output<PDFDocumentProxy>({ alias: 'after-load-complete' });
  readonly pageRendered = output<CustomEvent>({ alias: 'page-rendered' });
  readonly onProgress = output<PDFProgressData>({ alias: 'on-progress' });
  readonly onError = output<unknown>({ alias: 'error' });
}

@NgModule({
  imports: [FakeNg2PdfViewerComponent],
})
class FakePdfViewerModule {}

async function createComponent() {
  await TestBed.configureTestingModule({
    imports: [PdfDocumentViewerComponent],
    providers: [
      provideI18nTesting(),
      provideNzIcons([MinusOutline, PlusOutline]),
      {
        provide: PDF_VIEWER_LOADER,
        useValue: vi.fn().mockResolvedValue({
          PdfViewerComponent: FakeNg2PdfViewerComponent,
          PdfViewerModule: FakePdfViewerModule,
        }),
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(PdfDocumentViewerComponent);
  fixture.detectChanges();

  return { component: fixture.componentInstance, fixture };
}

function createTextSpan(text: string, rect: DOMRect): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = text;
  span.getBoundingClientRect = () => rect;

  return span;
}

function createDomRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('PdfDocumentViewerComponent', () => {
  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    TestBed.resetTestingModule();
  });

  it('starts loading when a PDF source is assigned', async () => {
    const { component, fixture } = await createComponent();

    fixture.componentRef.setInput('src', 'blob:http://localhost/document-a');
    fixture.detectChanges();

    expect(component.state()).toEqual({
      page: 1,
      pageCount: 0,
      zoom: 1,
      isLoading: true,
      progressPercent: 0,
      errorKey: null,
    });
  });

  it('tracks page count and loading progress', async () => {
    const { component } = await createComponent();

    component.handleProgress({ loaded: 40, total: 100 });
    component.handleLoadComplete({ numPages: 7 } as PDFDocumentProxy);
    component.setPage(4);

    expect(component.state()).toEqual({
      page: 4,
      pageCount: 7,
      zoom: 1,
      isLoading: false,
      progressPercent: 100,
      errorKey: null,
    });
  });

  it('keeps zoom bounded and resettable', async () => {
    const { component } = await createComponent();

    component.zoomIn();
    component.zoomIn();
    expect(component.state().zoom).toBe(1.2);

    component.zoomOut();
    expect(component.state().zoom).toBe(1.1);

    component.resetZoom();
    expect(component.state().zoom).toBe(1);
  });

  it('stores a PDF error state', async () => {
    const { component } = await createComponent();

    component.handleError(new Error('load failed'));

    expect(component.state().isLoading).toBe(false);
    expect(component.state().errorKey).toBe('documentDetail.errors.pdfFailed');
  });

  it('starts text selection from the first text span when the mouse starts before a line', async () => {
    const { fixture } = await createComponent();

    fixture.componentRef.setInput('src', 'blob:http://localhost/document-a');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const viewerElement = fixture.nativeElement.querySelector('pdf-viewer') as HTMLElement | null;
    expect(viewerElement).not.toBeNull();

    const firstLineStart = createTextSpan('Alpha', createDomRect(40, 10, 40, 10));
    const firstLineSecond = createTextSpan('Beta', createDomRect(96, 10, 32, 10));
    const secondLineStart = createTextSpan('Gamma', createDomRect(52, 32, 48, 10));
    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    textLayer.append(firstLineStart, firstLineSecond, secondLineStart);
    viewerElement?.append(textLayer);

    const startEvent = new MouseEvent('mousedown', {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 20,
      clientY: 15,
    });
    textLayer.dispatchEvent(startEvent);

    expect(startEvent.defaultPrevented).toBe(true);
    expect(document.getSelection()?.anchorNode).toBe(firstLineStart.firstChild);
    expect(document.getSelection()?.anchorOffset).toBe(0);
    expect(document.getSelection()?.focusNode).toBe(firstLineStart.firstChild);
    expect(document.getSelection()?.focusOffset).toBe(0);
  });

  it('waits for the first text contact when the mouse starts away from text', async () => {
    const { fixture } = await createComponent();

    fixture.componentRef.setInput('src', 'blob:http://localhost/document-a');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const viewerElement = fixture.nativeElement.querySelector('pdf-viewer') as HTMLElement | null;
    expect(viewerElement).not.toBeNull();

    const firstLineStart = createTextSpan('Alpha', createDomRect(40, 10, 40, 10));
    const firstLineSecond = createTextSpan('Beta', createDomRect(96, 10, 32, 10));
    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    textLayer.append(firstLineStart, firstLineSecond);
    viewerElement?.append(textLayer);

    const originalElementsFromPoint = document.elementsFromPoint;
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [firstLineSecond, textLayer]),
    });

    try {
      const startEvent = new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 88,
        clientY: 15,
      });
      textLayer.dispatchEvent(startEvent);

      expect(startEvent.defaultPrevented).toBe(false);

      const firstContactEvent = new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        clientX: 96,
        clientY: 15,
      });
      document.dispatchEvent(firstContactEvent);

      expect(firstContactEvent.defaultPrevented).toBe(true);
      expect(document.getSelection()?.anchorNode).toBe(firstLineSecond.firstChild);
      expect(document.getSelection()?.anchorOffset).toBe(0);
      expect(document.getSelection()?.focusNode).toBe(firstLineSecond.firstChild);
      expect(document.getSelection()?.focusOffset).toBe(0);
    } finally {
      Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: originalElementsFromPoint,
      });
    }
  });
});
