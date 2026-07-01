import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';
import { OpenDocumentsService } from '../../core/services/open-documents.service';
import type { PendingChangesAware } from '../../shared/navigation/pending-changes.guard';
import { DocumentDetailPaneComponent } from './document-detail-pane.component';

const DETAIL_BACK_LINKS = {
  documents: '/documents',
  inbox: '/inbox',
} as const;
const DETAIL_RETURN_TARGET_DATA_KEY = 'documentDetailReturnTarget';

type DetailReturnTarget = keyof typeof DETAIL_BACK_LINKS;

@Component({
  selector: 'app-document-detail',
  imports: [DocumentDetailPaneComponent],
  templateUrl: './document-detail.component.html',
  styleUrl: './document-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentDetailComponent implements PendingChangesAware {
  readonly openDocuments = inject(OpenDocumentsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  readonly activeDocumentId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  readonly backLink = signal(
    this.backLinkFromRoute(this.route.snapshot.queryParamMap.get('returnTo')),
  );
  readonly directDocumentId = computed(() => {
    const activeDocumentId = this.activeDocumentId();
    if (!activeDocumentId || this.openDocuments.isOpen(activeDocumentId)) {
      return null;
    }

    return activeDocumentId;
  });
  private readonly panes = viewChildren(DocumentDetailPaneComponent);

  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => params.get('id')),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((documentId) => this.activeDocumentId.set(documentId));
    this.route.queryParamMap
      .pipe(
        map((params) => this.backLinkFromRoute(params.get('returnTo'))),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((backLink) => this.backLink.set(backLink));
  }

  isActive(documentId: string): boolean {
    return this.activeDocumentId() === documentId;
  }

  hasPendingChanges(): boolean {
    return this.panes().some((pane) => pane.hasPendingChanges());
  }

  private backLinkFromRoute(queryReturnTarget: string | null): string {
    const returnTarget = isDetailReturnTarget(queryReturnTarget)
      ? queryReturnTarget
      : this.returnTargetFromRouteData();

    return DETAIL_BACK_LINKS[returnTarget];
  }

  private returnTargetFromRouteData(): DetailReturnTarget {
    const value = this.route.snapshot.data[DETAIL_RETURN_TARGET_DATA_KEY];
    return isDetailReturnTarget(value) ? value : 'documents';
  }
}

function isDetailReturnTarget(value: string | null): value is DetailReturnTarget {
  return value === 'documents' || value === 'inbox';
}
