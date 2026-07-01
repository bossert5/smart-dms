import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NzTableModule } from 'ng-zorro-antd/table';
import { InfiniteTableScrollDirective } from './infinite-table-scroll.directive';

@Component({
  imports: [NzTableModule, InfiniteTableScrollDirective],
  template: `
    <div class="table-container">
      <nz-table
        #tableScroller="appInfiniteTable"
        appInfiniteTable
        [nzData]="rows"
        [nzScroll]="tableScroller.scroll()"
        [nzShowPagination]="false"
      >
        <thead>
          <tr>
            <th>Name</th>
            <th nzWidth="112px">Status</th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows; track row) {
            <tr>
              <td>{{ row }}</td>
              <td>Ready</td>
            </tr>
          }
        </tbody>
      </nz-table>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class InfiniteTableScrollHostComponent {
  readonly rows = ['Inbox', 'Archive'];
}

describe('InfiniteTableScrollDirective', () => {
  let fixture: ComponentFixture<InfiniteTableScrollHostComponent>;
  let directive: InfiniteTableScrollDirective;
  let tableHost: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InfiniteTableScrollHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(InfiniteTableScrollHostComponent);
    fixture.detectChanges();

    const directiveDebugElement = fixture.debugElement.query(
      By.directive(InfiniteTableScrollDirective),
    );
    directive = directiveDebugElement.injector.get(InfiniteTableScrollDirective);
    tableHost = directiveDebugElement.nativeElement as HTMLElement;
  });

  it('shrinks the table body when the parent container gets smaller', () => {
    const parent = tableHost.parentElement!;
    const header =
      tableHost.querySelector<HTMLElement>('.ant-table-header') ??
      tableHost.querySelector<HTMLElement>('.ant-table-thead')!;
    const body = tableHost.querySelector<HTMLElement>('.ant-table-body')!;

    mockRect(parent, { height: 520 });
    mockRect(tableHost, { height: 900, top: 100 });
    mockRect(header, { height: 42 });

    directive.refresh();

    expect(body.style.height).toBe('476px');
    expect(body.style.maxHeight).toBe('476px');

    mockRect(parent, { height: 320 });
    mockRect(tableHost, { height: 900, top: 100 });

    directive.refresh();

    expect(body.style.height).toBe('276px');
    expect(body.style.maxHeight).toBe('276px');
  });

  it('resets horizontal body scroll when no horizontal table scroll is configured', () => {
    const body = tableHost.querySelector<HTMLElement>('.ant-table-body')!;
    body.scrollLeft = 120;

    directive.refresh();

    expect(body.scrollLeft).toBe(0);
  });

  it('releases stale measured widths for flexible columns while preserving configured widths', () => {
    const columns = Array.from(
      tableHost.querySelectorAll<HTMLTableColElement>('.ant-table-body col'),
    );
    expect(columns.length).toBe(2);

    const [nameColumn, statusColumn] = columns;
    nameColumn.style.width = '720px';
    nameColumn.style.minWidth = '720px';
    statusColumn.style.width = '112px';
    statusColumn.style.minWidth = '112px';

    directive.refresh();

    expect(nameColumn.style.width).toBe('');
    expect(nameColumn.style.minWidth).toBe('0px');
    expect(statusColumn.style.width).toBe('112px');
    expect(statusColumn.style.minWidth).toBe('112px');
  });
});

function mockRect(element: HTMLElement, rect: Partial<DOMRect>): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
      ...rect,
    }),
  });
}
