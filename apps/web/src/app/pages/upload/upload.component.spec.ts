import { HttpEventType } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Router } from '@angular/router';
import { CloudUploadOutline, FileTextOutline } from '@ant-design/icons-angular/icons';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { of, Subject, throwError } from 'rxjs';
import { UploadApiService } from '../../core/api/upload-api.service';
import { TenantContextService } from '../../core/services/tenant-context.service';
import { provideI18nTesting } from '../../testing/i18n-testing';
import { UploadComponent } from './upload.component';

const tenant = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd900',
  key: 'default',
  name: 'Default',
  isActive: true,
};

describe('UploadComponent', () => {
  it('loads upload config and accepts valid files', async () => {
    const fixture = await createComponent();
    const component = fixture.componentInstance;

    expect(component.config()).toEqual({
      maxUploadSizeBytes: 10,
      allowedMimeTypes: ['application/pdf'],
    });
    component.selectFile(fileEvent(new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' })));

    expect(component.selectedFile()?.name).toBe('invoice.pdf');
    expect(component.error()).toBeNull();
    expect(component.acceptList()).toBe('application/pdf');
  });

  it('rejects unsupported or oversized files and missing tenants', async () => {
    const fixture = await createComponent();
    const component = fixture.componentInstance;

    component.selectFile(fileEvent(new File(['txt'], 'note.txt', { type: 'text/plain' })));
    expect(component.error()).toBe('upload.errors.unsupportedType');

    component.selectFile(
      fileEvent(new File(['01234567890'], 'large.pdf', { type: 'application/pdf' })),
    );
    expect(component.error()).toBe('upload.errors.sizeExceeded');

    component.selectedFile.set(new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' }));
    component.selectedTenantId.set(null);
    component.upload();
    expect(component.error()).toBe('upload.errors.missingTenant');
  });

  it('tracks upload progress and navigates to the created document', async () => {
    const uploadEvents = new Subject<unknown>();
    const uploadsApi = {
      config: vi.fn().mockReturnValue(
        of({ maxUploadSizeBytes: 10, allowedMimeTypes: ['application/pdf'] }),
      ),
      uploadDocument: vi.fn().mockReturnValue(uploadEvents.asObservable()),
    };
    const router = { navigate: vi.fn() };
    const fixture = await createComponent(uploadsApi, router);
    const component = fixture.componentInstance;
    const file = new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' });

    component.selectedFile.set(file);
    component.upload();
    uploadEvents.next({ type: HttpEventType.UploadProgress, loaded: 5, total: 10 });
    uploadEvents.next({
      type: HttpEventType.Response,
      body: { document: { id: 'document-id' }, jobId: 'job-id' },
    });
    uploadEvents.complete();

    expect(uploadsApi.uploadDocument).toHaveBeenCalledWith(file, tenant.id);
    expect(component.progress()).toBe(50);
    expect(router.navigate).toHaveBeenCalledWith(['/documents', 'document-id']);
    expect(component.isUploading()).toBe(false);
  });

  it('shows config and upload errors', async () => {
    const uploadsApi = {
      config: vi.fn().mockReturnValue(throwError(() => new Error('config failed'))),
      uploadDocument: vi.fn().mockReturnValue(throwError(() => new Error('upload failed'))),
    };
    const fixture = await createComponent(uploadsApi);
    const component = fixture.componentInstance;

    expect(component.error()).toBe('upload.errors.configFailed');
    component.selectedFile.set(new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' }));
    component.upload();

    expect(component.error()).toBe('upload.errors.uploadFailed');
    expect(component.isUploading()).toBe(false);
  });
});

async function createComponent(
  uploadsApi: Partial<UploadApiService> = {
    config: vi.fn().mockReturnValue(
      of({ maxUploadSizeBytes: 10, allowedMimeTypes: ['application/pdf'] }),
    ),
    uploadDocument: vi.fn(),
  },
  router: Partial<Router> = { navigate: vi.fn() },
) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [UploadComponent],
    providers: [
      provideAnimationsAsync(),
      provideI18nTesting(),
      provideNzIcons([CloudUploadOutline, FileTextOutline]),
      { provide: UploadApiService, useValue: uploadsApi },
      {
        provide: TenantContextService,
        useValue: {
          activeTenant: () => tenant,
          hasNoActiveTenants: () => false,
          hasMultipleActiveTenants: () => false,
          uploadTenantOptions: () => [tenant],
        },
      },
      { provide: Router, useValue: router },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(UploadComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

function fileEvent(file: File): Event {
  return {
    target: {
      files: [file],
    },
  } as unknown as Event;
}
