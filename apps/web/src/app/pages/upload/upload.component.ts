import { HttpEventType } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import type { UploadConfigResponse, UploadDocumentResponse } from '@smart-dms/shared-dto';
import { TranslatePipe } from '@ngx-translate/core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { UploadApiService } from '../../core/api/upload-api.service';
import { TenantContextService } from '../../core/services/tenant-context.service';
import { formatFileSize } from '../../shared/formatters/file-size.formatter';

@Component({
  selector: 'app-upload',
  imports: [
    FormsModule,
    TranslatePipe,
    NzAlertModule,
    NzButtonModule,
    NzIconModule,
    NzProgressModule,
    NzSelectModule,
  ],
  templateUrl: './upload.component.html',
  styleUrl: './upload.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadComponent implements OnInit {
  private readonly uploadsApi = inject(UploadApiService);
  readonly tenantContext = inject(TenantContextService);
  private readonly router = inject(Router);

  readonly config = signal<UploadConfigResponse | null>(null);
  readonly selectedFile = signal<File | null>(null);
  readonly isUploading = signal(false);
  readonly progress = signal(0);
  readonly error = signal<string | null>(null);
  readonly selectedTenantId = signal<string | null>(null);

  ngOnInit(): void {
    if (this.tenantContext.hasNoActiveTenants()) {
      this.selectedTenantId.set(null);
      return;
    }

    this.uploadsApi.config().subscribe({
      next: (config) => this.config.set(config),
      error: () => this.error.set('upload.errors.configFailed'),
    });
    this.selectedTenantId.set(
      this.tenantContext.activeTenant()?.id ??
        this.tenantContext.uploadTenantOptions()[0]?.id ??
        null,
    );
  }

  acceptList(): string {
    return this.config()?.allowedMimeTypes.join(',') ?? '.pdf,.tif,.tiff,.jpg,.jpeg,.png';
  }

  selectFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    const config = this.config();

    if (file && config) {
      if (!config.allowedMimeTypes.includes(file.type)) {
        this.error.set('upload.errors.unsupportedType');
        this.selectedFile.set(null);
        return;
      }
      if (file.size > config.maxUploadSizeBytes) {
        this.error.set('upload.errors.sizeExceeded');
        this.selectedFile.set(null);
        return;
      }
    }

    this.error.set(null);
    this.selectedFile.set(file);
  }

  upload(): void {
    const file = this.selectedFile();
    if (!file) {
      return;
    }
    const tenantId = this.selectedTenantId();
    if (!tenantId) {
      this.error.set(
        this.tenantContext.hasNoActiveTenants()
          ? 'app.shell.noTenantAssigned'
          : 'upload.errors.missingTenant',
      );
      return;
    }

    this.isUploading.set(true);
    this.progress.set(0);
    this.uploadsApi.uploadDocument(file, tenantId).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.progress.set(Math.round((event.loaded / event.total) * 100));
        }
        if (event.type === HttpEventType.Response) {
          const body = event.body as UploadDocumentResponse;
          void this.router.navigate(['/documents', body.document.id]);
        }
      },
      error: () => {
        this.error.set('upload.errors.uploadFailed');
        this.isUploading.set(false);
      },
      complete: () => this.isUploading.set(false),
    });
  }

  formatBytes(size: number): string {
    return formatFileSize(size);
  }
}
