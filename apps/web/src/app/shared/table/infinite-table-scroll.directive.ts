import {
  AfterViewInit,
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { APP_LAYOUT_RESIZE_EVENT } from '../layout/layout-resize-event';

export interface InfiniteTableScroll {
  readonly x?: string | null;
  readonly y?: string | null;
}

const DEFAULT_MIN_BODY_HEIGHT = 160;
const DEFAULT_THRESHOLD_PX = 240;

@Directive({
  selector: 'nz-table[appInfiniteTable]',
  exportAs: 'appInfiniteTable',
  host: {
    class: 'app-infinite-table',
  },
})
export class InfiniteTableScrollDirective implements AfterViewInit {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly scrollY = signal(`${DEFAULT_MIN_BODY_HEIGHT}px`);
  private readonly handleResize = (): void => this.refresh();
  private readonly handleLayoutResize = (): void => this.scheduleRefresh();
  private readonly handleScroll = (): void => this.checkNearEnd();
  private resizeObserver: ResizeObserver | null = null;
  private tableBody: HTMLElement | null = null;
  private observedResizeElements: HTMLElement[] = [];
  private resizeRefreshFrame: number | null = null;
  private refreshScheduled = false;
  private widthSyncScheduled = false;
  private initialized = false;
  private destroyed = false;

  readonly scrollX = input<string | null>(null, { alias: 'appInfiniteTableX' });
  readonly minBodyHeight = input(DEFAULT_MIN_BODY_HEIGHT, {
    alias: 'appInfiniteTableMinBodyHeight',
  });
  readonly thresholdPx = input(DEFAULT_THRESHOLD_PX, {
    alias: 'appInfiniteTableThresholdPx',
  });
  readonly hasMore = input(false, { alias: 'appInfiniteTableHasMore' });
  readonly isLoading = input(false, { alias: 'appInfiniteTableLoading' });
  readonly isLoadingMore = input(false, {
    alias: 'appInfiniteTableLoadingMore',
  });
  readonly renderKey = input<unknown>(null, { alias: 'appInfiniteTableRenderKey' });
  readonly nearEnd = output<void>({ alias: 'appInfiniteTableNearEnd' });
  readonly scroll = computed<InfiniteTableScroll>(() => {
    const x = this.scrollX();
    const y = this.scrollY();
    return x ? { x, y } : { y };
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.destroy());
    effect(() => {
      this.renderKey();
      this.hasMore();
      this.isLoading();
      this.isLoadingMore();
      this.scheduleRefresh();
    });
  }

  ngAfterViewInit(): void {
    this.initialized = true;
    this.refresh();
    globalThis.addEventListener?.('resize', this.handleResize);
    globalThis.addEventListener?.(APP_LAYOUT_RESIZE_EVENT, this.handleLayoutResize);
    this.observeHostResize();
  }

  refresh(): void {
    if (!this.initialized || this.destroyed) {
      return;
    }

    const host = this.elementRef.nativeElement;
    if (!host.isConnected) {
      return;
    }

    const height = this.availableBodyHeight(host);
    if (height !== null) {
      const nextHeight = `${Math.max(this.minBodyHeight(), height)}px`;
      this.scrollY.set(nextHeight);
      this.applyBodyHeight(nextHeight);
    }

    this.syncScrollTarget();
    this.syncResponsiveColumnWidths();
    this.resetHorizontalScrollIfNeeded();
    this.scheduleNearEndCheck();
  }

  scrollToTop(): void {
    const target = this.tableBody;
    if (!target) {
      return;
    }

    if (typeof target.scrollTo === 'function') {
      target.scrollTo({ top: 0, left: 0 });
      return;
    }

    target.scrollTop = 0;
    target.scrollLeft = 0;
  }

  checkNearEnd(): void {
    const target = this.tableBody;
    if (
      !target ||
      target.clientHeight <= 0 ||
      !this.hasMore() ||
      this.isLoading() ||
      this.isLoadingMore()
    ) {
      return;
    }

    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToBottom <= this.thresholdPx()) {
      this.nearEnd.emit();
    }
  }

  private scheduleRefresh(): void {
    if (!this.initialized || this.refreshScheduled) {
      return;
    }

    this.refreshScheduled = true;
    queueMicrotask(() => {
      if (this.destroyed) {
        return;
      }

      this.refreshScheduled = false;
      this.refresh();
    });
    globalThis.setTimeout?.(() => {
      if (!this.destroyed) {
        this.refresh();
      }
    }, 0);
  }

  private scheduleNearEndCheck(): void {
    globalThis.setTimeout?.(() => {
      if (!this.destroyed) {
        this.checkNearEnd();
      }
    }, 0);
  }

  private availableBodyHeight(host: HTMLElement): number | null {
    const containerHeight = this.availableContainerHeight(host);
    if (containerHeight > 0) {
      const headerHeight =
        this.elementOuterHeight(host.querySelector<HTMLElement>('.ant-table-header')) ||
        this.elementOuterHeight(host.querySelector<HTMLElement>('.ant-table-thead'));
      return containerHeight - headerHeight - 2;
    }

    const viewportHeight = globalThis.innerHeight;
    const tableTop = host.getBoundingClientRect().top;
    if (viewportHeight <= 0 || tableTop < 0) {
      return null;
    }

    return Math.floor(viewportHeight - tableTop);
  }

  private availableContainerHeight(host: HTMLElement): number {
    const parentHeight = Math.floor(host.parentElement?.getBoundingClientRect().height ?? 0);
    if (parentHeight > 0) {
      return parentHeight;
    }

    return Math.floor(host.getBoundingClientRect().height);
  }

  private elementOuterHeight(element: HTMLElement | null): number {
    if (!element) {
      return 0;
    }

    const style = globalThis.getComputedStyle(element);
    const marginTop = Number.parseFloat(style.marginTop) || 0;
    const marginBottom = Number.parseFloat(style.marginBottom) || 0;
    return Math.ceil(element.getBoundingClientRect().height + marginTop + marginBottom);
  }

  private applyBodyHeight(height: string): void {
    const tableBody = this.elementRef.nativeElement.querySelector<HTMLElement>('.ant-table-body');
    if (!tableBody) {
      return;
    }

    tableBody.style.height = height;
    tableBody.style.maxHeight = height;
  }

  private syncScrollTarget(): void {
    const nextBody = this.elementRef.nativeElement.querySelector<HTMLElement>('.ant-table-body');
    if (this.tableBody === nextBody) {
      return;
    }

    this.detachScrollTarget();
    this.tableBody = nextBody;
    this.tableBody?.addEventListener('scroll', this.handleScroll, { passive: true });
  }

  private resetHorizontalScrollIfNeeded(): void {
    const target = this.tableBody;
    if (!target || this.scrollX()) {
      return;
    }

    target.scrollLeft = 0;
  }

  private syncResponsiveColumnWidths(): void {
    if (this.scrollX()) {
      return;
    }

    this.applyResponsiveColumnWidths();
    this.scheduleResponsiveColumnWidthSync();
  }

  private scheduleResponsiveColumnWidthSync(): void {
    if (this.destroyed || this.widthSyncScheduled) {
      return;
    }

    this.widthSyncScheduled = true;
    queueMicrotask(() => {
      this.widthSyncScheduled = false;
      if (!this.destroyed) {
        this.applyResponsiveColumnWidths();
      }
    });
    globalThis.setTimeout?.(() => {
      if (!this.destroyed) {
        this.applyResponsiveColumnWidths();
      }
    }, 0);
  }

  private applyResponsiveColumnWidths(): void {
    const host = this.elementRef.nativeElement;
    const configuredWidthColumns = this.configuredWidthColumns(host);
    const tables = host.querySelectorAll<HTMLTableElement>(
      '.ant-table-header table, .ant-table-body table, .ant-table-content table',
    );

    tables.forEach((table) => {
      table.style.width = '100%';
      table.style.minWidth = '0';
      Array.from(table.querySelectorAll<HTMLTableColElement>('col')).forEach((column, index) => {
        if (configuredWidthColumns[index]) {
          return;
        }

        column.style.width = '';
        column.style.minWidth = '0';
      });
    });
  }

  private configuredWidthColumns(host: HTMLElement): readonly boolean[] {
    const headerCells = Array.from(
      host.querySelectorAll<HTMLTableCellElement>(
        '.ant-table-header .ant-table-thead > tr:first-child > th',
      ),
    );
    const cells =
      headerCells.length > 0
        ? headerCells
        : Array.from(
            host.querySelectorAll<HTMLTableCellElement>('.ant-table-thead > tr:first-child > th'),
          );
    const columns: boolean[] = [];

    cells.forEach((cell) => {
      const hasConfiguredWidth = this.hasConfiguredColumnWidth(cell);
      const span = Math.max(1, cell.colSpan || 1);
      for (let index = 0; index < span; index += 1) {
        columns.push(hasConfiguredWidth);
      }
    });

    return columns;
  }

  private hasConfiguredColumnWidth(cell: HTMLTableCellElement): boolean {
    return (
      cell.hasAttribute('nzwidth') ||
      cell.hasAttribute('ng-reflect-nz-width') ||
      cell.style.width.length > 0 ||
      cell.style.minWidth.length > 0
    );
  }

  private detachScrollTarget(): void {
    this.tableBody?.removeEventListener('scroll', this.handleScroll);
    this.tableBody = null;
  }

  private observeHostResize(): void {
    if (!('ResizeObserver' in globalThis)) {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      if (this.destroyed || this.resizeRefreshFrame !== null) {
        return;
      }
      this.resizeRefreshFrame = globalThis.requestAnimationFrame(() => {
        this.resizeRefreshFrame = null;
        this.refresh();
      });
    });
    const host = this.elementRef.nativeElement;
    this.observedResizeElements = [host, host.parentElement].filter(
      (element): element is HTMLElement => !!element,
    );
    this.observedResizeElements.forEach((element) => this.resizeObserver?.observe(element));
  }

  private destroy(): void {
    this.destroyed = true;
    globalThis.removeEventListener?.('resize', this.handleResize);
    globalThis.removeEventListener?.(APP_LAYOUT_RESIZE_EVENT, this.handleLayoutResize);
    this.resizeObserver?.disconnect();
    if (this.resizeRefreshFrame !== null) {
      globalThis.cancelAnimationFrame(this.resizeRefreshFrame);
      this.resizeRefreshFrame = null;
    }
    this.observedResizeElements = [];
    this.detachScrollTarget();
  }
}
