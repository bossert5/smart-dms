import { HttpEventType } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import type { UploadConfigResponse } from '@smart-dms/shared-dto';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { finalize } from 'rxjs';
import { UploadApiService } from '../core/api/upload-api.service';
import { AuthService } from '../core/services/auth.service';
import { TenantContextService } from '../core/services/tenant-context.service';

@Component({
  selector: 'app-document-upload-action',
  imports: [
    FormsModule,
    TranslatePipe,
    NzAlertModule,
    NzIconModule,
    NzModalModule,
    NzProgressModule,
    NzSelectModule,
  ],
  template: `
    @if (auth.canEditDocuments()) {
      <div class="document-upload-action">
        <input
          #uploadFileInput
          class="document-upload-action__input"
          type="file"
          accept=".pdf,application/pdf"
          (change)="handleUploadInputChange($event)"
        />
        <div
          class="document-upload-action__dropzone"
          data-testid="document-upload-action"
          role="button"
          tabindex="0"
          [attr.aria-label]="'documents.upload.title' | translate"
          [class.document-upload-action__dropzone--active]="isUploadDragActive()"
          [class.document-upload-action__dropzone--uploading]="isUploadingDocument()"
          [attr.aria-disabled]="isUploadingDocument()"
          [attr.aria-busy]="isUploadingDocument()"
          (click)="openUploadFilePicker(uploadFileInput)"
          (keydown)="handleUploadDropzoneKeydown($event, uploadFileInput)"
          (dragover)="handleUploadDragOver($event)"
          (dragleave)="handleUploadDragLeave($event)"
          (drop)="handleUploadDrop($event)"
        >
          <span class="document-upload-action__icon" nz-icon nzType="cloud-upload"></span>
          <span class="document-upload-action__title">
            {{ 'documents.upload.title' | translate }}
          </span>
        </div>

        @if (isUploadingDocument()) {
          <nz-progress
            class="document-upload-action__progress"
            [nzPercent]="uploadProgress()"
            [nzShowInfo]="false"
          ></nz-progress>
        }

        @if (uploadError(); as errorKey) {
          <nz-alert
            class="document-upload-action__alert"
            nzType="error"
            [nzMessage]="errorKey | translate"
          ></nz-alert>
        }

        <nz-modal
          [nzVisible]="isTenantDialogOpen()"
          [nzTitle]="'documents.upload.selectTenantTitle' | translate"
          [nzOkText]="'documents.upload.start' | translate"
          [nzCancelText]="'common.cancel' | translate"
          [nzOkDisabled]="!selectedUploadTenantId()"
          (nzOnCancel)="cancelTenantSelection()"
          (nzOnOk)="confirmTenantSelection()"
        >
          <ng-container *nzModalContent>
            <nz-select
              class="document-upload-action__tenant-select"
              [ngModel]="selectedUploadTenantId()"
              (ngModelChange)="selectedUploadTenantId.set($event)"
              [attr.aria-label]="'documents.upload.selectTenantTitle' | translate"
            >
              @for (tenant of tenantContext.uploadTenantOptions(); track tenant.id) {
                <nz-option [nzValue]="tenant.id" [nzLabel]="tenant.name"></nz-option>
              }
            </nz-select>
          </ng-container>
        </nz-modal>
      </div>
    }
  `,
  styleUrl: './document-upload-action.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentUploadActionComponent {
  readonly auth = inject(AuthService);
  readonly tenantContext = inject(TenantContextService);
  private readonly uploadsApi = inject(UploadApiService);

  readonly uploadConfig = signal<UploadConfigResponse | null>(null);
  readonly uploadError = signal<string | null>(null);
  readonly uploadProgress = signal(0);
  readonly isUploadDragActive = signal(false);
  readonly isUploadingDocument = signal(false);
  readonly isTenantDialogOpen = signal(false);
  readonly selectedUploadTenantId = signal<string | null>(null);
  private pendingUploadFile: File | null = null;

  constructor() {
    this.loadUploadConfig();
  }

  openUploadFilePicker(fileInput: HTMLInputElement): void {
    if (this.isUploadingDocument()) {
      return;
    }

    fileInput.click();
  }

  handleUploadDropzoneKeydown(event: KeyboardEvent, fileInput: HTMLInputElement): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    this.openUploadFilePicker(fileInput);
  }

  handleUploadInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    input.value = '';

    this.prepareUploadDocumentFile(file);
  }

  handleUploadDragOver(event: DragEvent): void {
    event.preventDefault();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = this.isUploadingDocument() ? 'none' : 'copy';
    }

    if (!this.isUploadingDocument()) {
      this.isUploadDragActive.set(true);
    }
  }

  handleUploadDragLeave(event: DragEvent): void {
    const dropzone = event.currentTarget;
    if (
      dropzone instanceof HTMLElement &&
      event.relatedTarget instanceof Node &&
      dropzone.contains(event.relatedTarget)
    ) {
      return;
    }

    this.isUploadDragActive.set(false);
  }

  handleUploadDrop(event: DragEvent): void {
    event.preventDefault();
    this.isUploadDragActive.set(false);

    if (this.isUploadingDocument()) {
      return;
    }

    this.prepareUploadDocumentFile(event.dataTransfer?.files.item(0) ?? null);
  }

  prepareUploadDocumentFile(file: File | null): void {
    if (!file || this.isUploadingDocument()) {
      return;
    }

    if (!this.isPdfUpload(file)) {
      this.uploadError.set('documents.upload.errors.unsupportedType');
      return;
    }

    const config = this.uploadConfig();
    if (config && file.size > config.maxUploadSizeBytes) {
      this.uploadError.set('documents.upload.errors.sizeExceeded');
      return;
    }

    this.uploadError.set(null);
    const directTenantId =
      this.tenantContext.activeTenant()?.id ??
      (this.tenantContext.hasSingleActiveTenant()
        ? (this.tenantContext.activeTenants()[0]?.id ?? null)
        : null);
    if (directTenantId) {
      this.uploadDocumentFile(file, directTenantId);
      return;
    }

    if (this.tenantContext.isAllTenants()) {
      this.pendingUploadFile = file;
      this.selectedUploadTenantId.set(
        this.auth.user()?.defaultTenantId ??
          this.tenantContext.uploadTenantOptions()[0]?.id ??
          null,
      );
      this.isTenantDialogOpen.set(true);
      return;
    }

    this.uploadError.set('documents.upload.errors.missingTenant');
  }

  cancelTenantSelection(): void {
    this.pendingUploadFile = null;
    this.isTenantDialogOpen.set(false);
    this.selectedUploadTenantId.set(null);
  }

  confirmTenantSelection(): void {
    const file = this.pendingUploadFile;
    const tenantId = this.selectedUploadTenantId();
    if (!file || !tenantId) {
      return;
    }

    this.pendingUploadFile = null;
    this.isTenantDialogOpen.set(false);
    this.uploadDocumentFile(file, tenantId);
  }

  private uploadDocumentFile(file: File, tenantId: string): void {
    this.uploadError.set(null);
    this.uploadProgress.set(0);
    this.isUploadingDocument.set(true);

    this.uploadsApi
      .uploadDocument(file, tenantId)
      .pipe(finalize(() => this.isUploadingDocument.set(false)))
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            this.uploadProgress.set(Math.round((event.loaded / event.total) * 100));
          }

          if (event.type === HttpEventType.Response && event.body) {
            this.uploadProgress.set(100);
          }
        },
        error: () => {
          this.uploadError.set('documents.upload.errors.uploadFailed');
        },
      });
  }

  private loadUploadConfig(): void {
    if (!this.auth.canEditDocuments()) {
      return;
    }

    this.uploadsApi.config().subscribe({
      next: (config) => this.uploadConfig.set(config),
      error: () => this.uploadError.set('documents.upload.errors.configFailed'),
    });
  }

  private isPdfUpload(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }
}
