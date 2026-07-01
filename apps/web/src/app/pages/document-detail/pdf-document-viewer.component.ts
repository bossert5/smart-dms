import { PercentPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  computed,
  createNgModule,
  effect,
  inject,
  InjectionToken,
  input,
  Injector,
  NgModuleRef,
  OnDestroy,
  signal,
  Type,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { PDFDocumentProxy, PDFProgressData } from 'ng2-pdf-viewer';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';

export interface DocumentPdfViewerState {
  readonly page: number;
  readonly pageCount: number;
  readonly zoom: number;
  readonly isLoading: boolean;
  readonly progressPercent: number;
  readonly errorKey: string | null;
}

interface SubscriptionLike {
  unsubscribe(): void;
}

interface SubscribableOutput<T> {
  subscribe(next: (value: T) => void): SubscriptionLike;
}

interface PdfViewerInstance {
  readonly afterLoadComplete: SubscribableOutput<PDFDocumentProxy>;
  readonly pageRendered: SubscribableOutput<CustomEvent>;
  readonly onError: SubscribableOutput<unknown>;
  readonly onProgress: SubscribableOutput<PDFProgressData>;
  readonly pageChange: SubscribableOutput<number>;
}

interface PdfViewerBundle {
  readonly PdfViewerComponent: Type<unknown>;
  readonly PdfViewerModule: Type<unknown>;
}

export type PdfViewerLoader = () => Promise<PdfViewerBundle>;

export const PDF_VIEWER_LOADER = new InjectionToken<PdfViewerLoader>('PDF_VIEWER_LOADER', {
  providedIn: 'root',
  factory: () => async () => {
    const bundle = await import('ng2-pdf-viewer');

    return {
      PdfViewerComponent: bundle.PdfViewerComponent,
      PdfViewerModule: bundle.PdfViewerModule,
    };
  },
});

const DEFAULT_ZOOM = 1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;
const TEXT_SELECTION_START_ZONE_PX = 64;
const TEXT_LINE_TOLERANCE_PX = 2;

interface TextLineCandidate {
  startElement: HTMLElement;
  endElement: HTMLElement;
  startRect: DOMRect;
  endRect: DOMRect;
  spans: TextLineSpan[];
  centerY: number;
  top: number;
  bottom: number;
}

interface TextLineSpan {
  element: HTMLElement;
  rect: DOMRect;
}

interface TextCaretPoint {
  node: Node;
  offset: number;
}

interface ActiveTextSelection {
  anchor: TextCaretPoint | null;
  host: HTMLElement;
}

@Component({
  selector: 'app-pdf-document-viewer',
  imports: [
    PercentPipe,
    TranslatePipe,
    NzAlertModule,
    NzButtonModule,
    NzIconModule,
    NzProgressModule,
    NzTooltipModule,
  ],
  templateUrl: './pdf-document-viewer.component.html',
  styleUrl: './pdf-document-viewer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfDocumentViewerComponent implements OnDestroy {
  readonly src = input<string | null>(null);
  readonly title = input('');
  readonly cMapsUrl = '/assets/pdfjs/cmaps/';
  readonly state = signal<DocumentPdfViewerState>(this.defaultState(false));
  readonly canZoomOut = computed(() => this.state().zoom > MIN_ZOOM);
  readonly canZoomIn = computed(() => this.state().zoom < MAX_ZOOM);
  private readonly injector = inject(Injector);
  private readonly loadPdfViewer = inject(PDF_VIEWER_LOADER);
  private readonly viewerContainer = viewChild('viewerContainer', { read: ViewContainerRef });
  private readonly subscriptions: SubscriptionLike[] = [];
  private viewerRef: ComponentRef<unknown> | null = null;
  private moduleRef: NgModuleRef<unknown> | null = null;
  private renderToken = 0;
  private isDestroyed = false;
  private textSelectionAbortController: AbortController | null = null;
  private textSelectionDragAbortController: AbortController | null = null;
  private activeTextSelection: ActiveTextSelection | null = null;

  constructor() {
    effect(() => {
      const source = this.src();
      const container = this.viewerContainer();
      this.state.update((current) => ({
        ...this.defaultState(Boolean(source)),
        zoom: current.zoom,
      }));

      void this.renderViewer(container ?? null, source);
    });
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.renderToken++;
    this.destroyViewer();
  }

  setPage(page: number): void {
    if (!Number.isFinite(page) || page < 1) {
      return;
    }

    this.state.update((current) => ({
      ...current,
      page: Math.min(page, current.pageCount || page),
    }));
    this.viewerRef?.setInput('page', this.state().page);
  }

  zoomOut(): void {
    this.setZoom(this.state().zoom - ZOOM_STEP);
  }

  zoomIn(): void {
    this.setZoom(this.state().zoom + ZOOM_STEP);
  }

  resetZoom(): void {
    this.setZoom(DEFAULT_ZOOM);
  }

  handleLoadComplete(pdf: PDFDocumentProxy): void {
    this.state.update((current) => ({
      ...current,
      pageCount: pdf.numPages,
      isLoading: false,
      progressPercent: 100,
      errorKey: null,
    }));
  }

  handleProgress(progress: PDFProgressData): void {
    if (!progress.total) {
      return;
    }

    this.state.update((current) => ({
      ...current,
      progressPercent: Math.min(100, Math.round((progress.loaded / progress.total) * 100)),
    }));
  }

  handlePageRendered(): void {
    this.state.update((current) => ({
      ...current,
      isLoading: false,
    }));
  }

  handleError(_error: unknown): void {
    this.state.update((current) => ({
      ...current,
      isLoading: false,
      errorKey: 'documentDetail.errors.pdfFailed',
    }));
  }

  private setZoom(zoom: number): void {
    const boundedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    this.state.update((current) => ({
      ...current,
      zoom: Number(boundedZoom.toFixed(2)),
    }));
    this.viewerRef?.setInput('zoom', this.state().zoom);
  }

  private defaultState(isLoading: boolean): DocumentPdfViewerState {
    return {
      page: 1,
      pageCount: 0,
      zoom: DEFAULT_ZOOM,
      isLoading,
      progressPercent: 0,
      errorKey: null,
    };
  }

  private async renderViewer(container: ViewContainerRef | null, source: string | null): Promise<void> {
    const token = ++this.renderToken;
    this.destroyViewer();

    if (!container || !source) {
      return;
    }

    const bundle = await this.loadPdfViewer();
    if (this.isDestroyed || token !== this.renderToken) {
      return;
    }

    this.moduleRef = createNgModule(bundle.PdfViewerModule, this.injector);
    this.viewerRef = container.createComponent(bundle.PdfViewerComponent, {
      ngModuleRef: this.moduleRef,
    });
    this.configureViewer(source);
  }

  private configureViewer(source: string): void {
    const viewerRef = this.viewerRef;
    if (!viewerRef) {
      return;
    }

    viewerRef.setInput('src', source);
    viewerRef.setInput('render-text', true);
    viewerRef.setInput('show-all', true);
    viewerRef.setInput('original-size', false);
    viewerRef.setInput('fit-to-page', true);
    viewerRef.setInput('autoresize', true);
    viewerRef.setInput('show-borders', true);
    viewerRef.setInput('zoom', this.state().zoom);
    viewerRef.setInput('zoom-scale', 'page-width');
    viewerRef.setInput('page', this.state().page);
    viewerRef.setInput('c-maps-url', this.cMapsUrl);
    viewerRef.setInput('external-link-target', 'blank');

    const instance = viewerRef.instance as PdfViewerInstance;
    this.subscriptions.push(
      instance.pageChange.subscribe((page) => this.setPage(page)),
      instance.afterLoadComplete.subscribe((pdf) => this.handleLoadComplete(pdf)),
      instance.pageRendered.subscribe(() => this.handlePageRendered()),
      instance.onProgress.subscribe((progress) => this.handleProgress(progress)),
      instance.onError.subscribe((error) => this.handleError(error)),
    );
    this.bindTextSelectionStartBehavior();
    viewerRef.changeDetectorRef.detectChanges();
  }

  private bindTextSelectionStartBehavior(): void {
    this.destroyTextSelectionStartBehavior();

    const host = this.viewerRef?.location.nativeElement as unknown;
    if (!isHTMLElement(host) || typeof AbortController === 'undefined') {
      return;
    }

    this.textSelectionAbortController = new AbortController();
    host.addEventListener('mousedown', this.handleTextSelectionMouseDown, {
      capture: true,
      signal: this.textSelectionAbortController.signal,
    });
  }

  private destroyTextSelectionStartBehavior(): void {
    this.textSelectionAbortController?.abort();
    this.textSelectionAbortController = null;
    this.endTextSelectionDrag();
  }

  private readonly handleTextSelectionMouseDown = (event: MouseEvent): void => {
    if (
      event.button !== 0 ||
      event.detail > 1 ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }

    const host = this.viewerRef?.location.nativeElement as unknown;
    if (!isHTMLElement(host)) {
      return;
    }

    const textLayer = getTextLayerFromEvent(event, host);
    if (!textLayer) {
      return;
    }

    const anchor =
      getLineStartCaretPoint(textLayer, event.clientX, event.clientY) ??
      getTextContactCaretPoint(host, event.clientX, event.clientY);

    this.bindTextSelectionDrag(host.ownerDocument);
    this.activeTextSelection = { anchor, host };

    if (!anchor) {
      return;
    }

    event.preventDefault();
    setSelectionFromPoints(anchor, anchor);
  };

  private bindTextSelectionDrag(ownerDocument: Document): void {
    this.endTextSelectionDrag();

    this.textSelectionDragAbortController = new AbortController();
    ownerDocument.addEventListener('mousemove', this.handleTextSelectionMouseMove, {
      capture: true,
      signal: this.textSelectionDragAbortController.signal,
    });
    ownerDocument.addEventListener('mouseup', this.handleTextSelectionMouseUp, {
      capture: true,
      signal: this.textSelectionDragAbortController.signal,
    });
  }

  private readonly handleTextSelectionMouseMove = (event: MouseEvent): void => {
    const activeSelection = this.activeTextSelection;
    if (!activeSelection) {
      return;
    }

    if (!activeSelection.anchor) {
      const anchor = getTextContactCaretPoint(activeSelection.host, event.clientX, event.clientY);
      if (!anchor) {
        return;
      }

      this.activeTextSelection = { ...activeSelection, anchor };
      event.preventDefault();
      setSelectionFromPoints(anchor, anchor);
      return;
    }

    const focus = getCaretPointFromCoordinates(activeSelection.host, event.clientX, event.clientY);
    if (!focus) {
      return;
    }

    event.preventDefault();
    setSelectionFromPoints(activeSelection.anchor, focus);
  };

  private readonly handleTextSelectionMouseUp = (event: MouseEvent): void => {
    const activeSelection = this.activeTextSelection;
    if (activeSelection?.anchor) {
      const focus = getCaretPointFromCoordinates(activeSelection.host, event.clientX, event.clientY);
      if (focus) {
        event.preventDefault();
        setSelectionFromPoints(activeSelection.anchor, focus);
      }
    }

    this.endTextSelectionDrag();
  };

  private endTextSelectionDrag(): void {
    this.textSelectionDragAbortController?.abort();
    this.textSelectionDragAbortController = null;
    this.activeTextSelection = null;
  }

  private destroyViewer(): void {
    this.destroyTextSelectionStartBehavior();

    for (const subscription of this.subscriptions.splice(0)) {
      subscription.unsubscribe();
    }

    this.viewerRef?.destroy();
    this.viewerRef = null;
    this.moduleRef?.destroy();
    this.moduleRef = null;
  }
}

function getTextLayerFromEvent(event: MouseEvent, host: HTMLElement): HTMLElement | null {
  if (event.target instanceof Element) {
    if (event.target.closest('.annotationLayer')) {
      return null;
    }

    const textLayer = event.target.closest('.textLayer');
    if (isHTMLElement(textLayer) && host.contains(textLayer)) {
      return textLayer;
    }
  }

  return getTextLayerFromCoordinates(host, event.clientX, event.clientY);
}

function getTextLayerFromCoordinates(host: HTMLElement, clientX: number, clientY: number): HTMLElement | null {
  for (const element of host.ownerDocument.elementsFromPoint(clientX, clientY)) {
    const textLayer = element.closest('.textLayer');
    if (isHTMLElement(textLayer) && host.contains(textLayer)) {
      return textLayer;
    }
  }

  return null;
}

function getLineStartCaretPoint(
  textLayer: HTMLElement,
  clientX: number,
  clientY: number,
): TextCaretPoint | null {
  const line = getTextLineAtCoordinates(textLayer, clientY);
  if (!line || clientX >= line.startRect.left || line.startRect.left - clientX > TEXT_SELECTION_START_ZONE_PX) {
    return null;
  }

  return getTextPoint(line.startElement, 0);
}

function getCaretPointFromCoordinates(
  host: HTMLElement,
  clientX: number,
  clientY: number,
): TextCaretPoint | null {
  const textContactPoint = getTextContactCaretPoint(host, clientX, clientY);

  if (textContactPoint) {
    return textContactPoint;
  }

  const textLayer = getTextLayerFromCoordinates(host, clientX, clientY);
  if (!textLayer) {
    return null;
  }

  const line = getTextLineAtCoordinates(textLayer, clientY);
  if (!line) {
    return null;
  }

  return getNearestLineCaretPoint(line, clientX);
}

function getTextContactCaretPoint(
  host: HTMLElement,
  clientX: number,
  clientY: number,
): TextCaretPoint | null {
  const nativeCaretPoint = getNativeCaretPoint(host, clientX, clientY);
  if (nativeCaretPoint) {
    return nativeCaretPoint;
  }

  const textLayer = getTextLayerFromCoordinates(host, clientX, clientY);
  if (!textLayer) {
    return null;
  }

  const textSpan = getTextSpanAtCoordinates(textLayer, clientX, clientY);

  return textSpan ? getEstimatedTextPoint(textSpan.element, clientX) : null;
}

function getNativeCaretPoint(host: HTMLElement, clientX: number, clientY: number): TextCaretPoint | null {
  const ownerDocument = host.ownerDocument;
  const caretPosition = ownerDocument.caretPositionFromPoint?.(clientX, clientY);
  if (caretPosition && host.contains(caretPosition.offsetNode)) {
    const normalizedPoint = normalizeTextCaretPoint(caretPosition.offsetNode, caretPosition.offset, clientX);
    if (normalizedPoint) {
      return normalizedPoint;
    }
  }

  const caretRange = ownerDocument.caretRangeFromPoint?.(clientX, clientY);
  if (caretRange && host.contains(caretRange.startContainer)) {
    return normalizeTextCaretPoint(caretRange.startContainer, caretRange.startOffset, clientX);
  }

  return null;
}

function normalizeTextCaretPoint(node: Node, offset: number, clientX: number): TextCaretPoint | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement;
    if (parent?.matches('span:not(.markedContent)')) {
      return { node, offset: clampTextOffset(node, offset) };
    }
  }

  if (isHTMLElement(node) && node.matches('span:not(.markedContent)')) {
    return getEstimatedTextPoint(node, clientX);
  }

  return null;
}

function getEstimatedTextPoint(element: HTMLElement, clientX: number): TextCaretPoint | null {
  const textLength = element.textContent?.length ?? 0;
  if (textLength === 0) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const ratio = rect.width > 0 ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) : 0;

  return getTextPoint(element, Math.round(textLength * ratio));
}

function getTextLineAtCoordinates(textLayer: HTMLElement, clientY: number): TextLineCandidate | null {
  const matchingLines = getTextLines(textLayer).filter(
    (line) => clientY >= line.top - TEXT_LINE_TOLERANCE_PX && clientY <= line.bottom + TEXT_LINE_TOLERANCE_PX,
  );

  if (matchingLines.length === 0) {
    return null;
  }

  return matchingLines.reduce((closest, line) =>
    Math.abs(line.centerY - clientY) < Math.abs(closest.centerY - clientY) ? line : closest,
  );
}

function getTextSpanAtCoordinates(
  textLayer: HTMLElement,
  clientX: number,
  clientY: number,
): TextLineSpan | null {
  const matchingSpans = getTextLineSpans(textLayer).filter(
    ({ rect }) =>
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top - TEXT_LINE_TOLERANCE_PX &&
      clientY <= rect.bottom + TEXT_LINE_TOLERANCE_PX,
  );

  if (matchingSpans.length === 0) {
    return null;
  }

  return matchingSpans.reduce((closest, span) =>
    Math.abs(getRectCenterY(span.rect) - clientY) < Math.abs(getRectCenterY(closest.rect) - clientY) ? span : closest,
  );
}

function getTextLines(textLayer: HTMLElement): readonly TextLineCandidate[] {
  const lineStarts: TextLineCandidate[] = [];
  const textSpans = getTextLineSpans(textLayer);

  for (const textSpan of textSpans) {
    const centerY = getRectCenterY(textSpan.rect);
    const existingLine = lineStarts.find((lineStart) => isSameTextLine(lineStart, textSpan.rect, centerY));

    if (!existingLine) {
      lineStarts.push({
        startElement: textSpan.element,
        endElement: textSpan.element,
        startRect: textSpan.rect,
        endRect: textSpan.rect,
        spans: [textSpan],
        centerY,
        top: textSpan.rect.top,
        bottom: textSpan.rect.bottom,
      });
      continue;
    }

    existingLine.spans.push(textSpan);
    existingLine.top = Math.min(existingLine.top, textSpan.rect.top);
    existingLine.bottom = Math.max(existingLine.bottom, textSpan.rect.bottom);

    if (textSpan.rect.left < existingLine.startRect.left) {
      existingLine.startElement = textSpan.element;
      existingLine.startRect = textSpan.rect;
      existingLine.centerY = centerY;
    }

    if (textSpan.rect.right > existingLine.endRect.right) {
      existingLine.endElement = textSpan.element;
      existingLine.endRect = textSpan.rect;
    }
  }

  return lineStarts.map((lineStart) => ({
    ...lineStart,
    spans: [...lineStart.spans].sort((left, right) => left.rect.left - right.rect.left),
  }));
}

function getTextLineSpans(textLayer: HTMLElement): readonly TextLineSpan[] {
  const textSpans = Array.from(textLayer.querySelectorAll<HTMLElement>('span:not(.markedContent)'));

  return textSpans.flatMap((element) => {
    if (!element.textContent?.trim()) {
      return [];
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return [];
    }

    return [{ element, rect }];
  });
}

function getNearestLineCaretPoint(line: TextLineCandidate, clientX: number): TextCaretPoint | null {
  if (clientX <= line.startRect.left) {
    return getTextPoint(line.startElement, 0);
  }

  if (clientX >= line.endRect.right) {
    return getTextPoint(line.endElement, line.endElement.textContent?.length ?? 0);
  }

  const closestSpan = line.spans.reduce((closest, span) =>
    getHorizontalDistanceToRect(span.rect, clientX) < getHorizontalDistanceToRect(closest.rect, clientX) ? span : closest,
  );

  if (clientX < closestSpan.rect.left) {
    return getTextPoint(closestSpan.element, 0);
  }

  if (clientX > closestSpan.rect.right) {
    return getTextPoint(closestSpan.element, closestSpan.element.textContent?.length ?? 0);
  }

  return getEstimatedTextPoint(closestSpan.element, clientX);
}

function getHorizontalDistanceToRect(rect: DOMRect, clientX: number): number {
  if (clientX < rect.left) {
    return rect.left - clientX;
  }

  if (clientX > rect.right) {
    return clientX - rect.right;
  }

  return 0;
}

function getRectCenterY(rect: DOMRect): number {
  return rect.top + rect.height / 2;
}

function isSameTextLine(lineStart: TextLineCandidate, rect: DOMRect, centerY: number): boolean {
  const tolerance = Math.max(TEXT_LINE_TOLERANCE_PX, Math.min(lineStart.startRect.height, rect.height) / 2);

  return Math.abs(lineStart.centerY - centerY) <= tolerance;
}

function getTextPoint(element: HTMLElement, offset: number): TextCaretPoint | null {
  const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
  if (!textNode) {
    return null;
  }

  return { node: textNode, offset: clampTextOffset(textNode, offset) };
}

function clampTextOffset(node: Node, offset: number): number {
  return Math.min(Math.max(offset, 0), node.textContent?.length ?? 0);
}

function setSelectionFromPoints(anchor: TextCaretPoint, focus: TextCaretPoint): void {
  const ownerDocument = anchor.node.ownerDocument;
  if (!ownerDocument) {
    return;
  }

  const selection = ownerDocument.getSelection();
  if (!selection) {
    return;
  }

  try {
    selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
    return;
  } catch {
    setSelectionRange(selection, anchor, focus);
  }
}

function setSelectionRange(selection: Selection, anchor: TextCaretPoint, focus: TextCaretPoint): void {
  const ownerDocument = anchor.node.ownerDocument;
  if (!ownerDocument) {
    return;
  }

  const range = ownerDocument.createRange();
  if (isBefore(focus, anchor)) {
    range.setStart(focus.node, focus.offset);
    range.setEnd(anchor.node, anchor.offset);
  } else {
    range.setStart(anchor.node, anchor.offset);
    range.setEnd(focus.node, focus.offset);
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

function isBefore(point: TextCaretPoint, reference: TextCaretPoint): boolean {
  const ownerDocument = reference.node.ownerDocument;
  if (!ownerDocument) {
    return false;
  }

  const range = ownerDocument.createRange();
  range.setStart(reference.node, reference.offset);
  range.collapse(true);

  try {
    return range.comparePoint(point.node, point.offset) < 0;
  } catch {
    return false;
  }
}

function isHTMLElement(value: unknown): value is HTMLElement {
  return typeof HTMLElement !== 'undefined' && value instanceof HTMLElement;
}
