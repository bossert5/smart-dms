import { HttpEventType } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { CloudUploadOutline } from '@ant-design/icons-angular/icons';
import type {
  DocumentSummaryDto,
  UploadDocumentResponse,
  UploadConfigResponse,
} from '@smart-dms/shared-dto';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { of } from 'rxjs';
import { UploadApiService } from '../core/api/upload-api.service';
import { AuthService } from '../core/services/auth.service';
import { TenantContextService } from '../core/services/tenant-context.service';
import { provideI18nTesting } from '../testing/i18n-testing';
import { DocumentUploadActionComponent } from './document-upload-action.component';

const uploadConfig: UploadConfigResponse = {
  maxUploadSizeBytes: 10_000_000,
  allowedMimeTypes: ['application/pdf'],
};
const tenant = {
  id: '00000000-0000-4000-8000-000000000010',
  key: 'default',
  name: 'Default',
  isActive: true,
};

const documentSummary: DocumentSummaryDto = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd99f',
  title: 'Invoice',
  tenant,
  documentType: {
    id: '018f1a44-9093-7f55-a515-278f4d9bd992',
    key: 'invoice',
    name: 'Invoice',
    active: true,
    isSystem: true,
    displayOrder: 10,
    createdAt: '2026-05-07T18:00:00.000Z',
    updatedAt: '2026-05-07T18:00:00.000Z',
  },
  originalFileName: 'invoice.pdf',
  source: 'UPLOAD',
  mimeType: 'application/pdf',
  status: 'READY',
  createdAt: '2026-05-07T18:00:00.000Z',
  updatedAt: '2026-05-07T18:00:00.000Z',
  acceptedAt: '2026-05-07T18:00:00.000Z',
  acceptedById: null,
  aiProcessedAt: null,
  documentDate: null,
  summary: null,
  sender: 'Sender GmbH',
  recipient: null,
  note: null,
  fileSize: 1234,
  pageCount: 1,
  tags: [],
  thumbnailUrl: null,
  calendarEventKinds: [],
};

async function createComponent() {
  const uploadsApi = {
    config: vi.fn().mockReturnValue(of(uploadConfig)),
    uploadDocument: vi.fn(),
  };

  await TestBed.configureTestingModule({
    imports: [DocumentUploadActionComponent],
    providers: [
      provideI18nTesting(),
      provideNzIcons([CloudUploadOutline]),
      { provide: AuthService, useValue: { canEditDocuments: () => true } },
      {
        provide: TenantContextService,
        useValue: {
          activeTenants: () => [tenant],
          activeTenant: () => tenant,
          hasSingleActiveTenant: () => true,
          hasMultipleActiveTenants: () => false,
          isAllTenants: () => false,
          uploadTenantOptions: () => [tenant],
        },
      },
      { provide: UploadApiService, useValue: uploadsApi },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(DocumentUploadActionComponent);
  fixture.detectChanges();

  return {
    component: fixture.componentInstance,
    fixture,
    uploadsApi,
  };
}

describe('DocumentUploadActionComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders a compact header upload dropzone', async () => {
    const { fixture } = await createComponent();
    const compiled = fixture.nativeElement as HTMLElement;
    const dropzone = compiled.querySelector('[data-testid="document-upload-action"]');

    expect(dropzone).not.toBeNull();
    expect(dropzone?.textContent).toContain('Upload area');
    expect(compiled.textContent).not.toContain('Drop a PDF here or click to choose one.');
    expect(compiled.textContent).not.toContain('PDF up to');
  });

  it('validates PDF uploads before calling the upload API', async () => {
    const { component, uploadsApi } = await createComponent();

    component.prepareUploadDocumentFile(new File(['image'], 'scan.png', { type: 'image/png' }));

    expect(component.uploadError()).toBe('documents.upload.errors.unsupportedType');
    expect(uploadsApi.uploadDocument).not.toHaveBeenCalled();

    component.uploadConfig.set({
      maxUploadSizeBytes: 2,
      allowedMimeTypes: ['application/pdf'],
    });
    component.prepareUploadDocumentFile(new File(['pdf'], 'scan.pdf', { type: 'application/pdf' }));

    expect(component.uploadError()).toBe('documents.upload.errors.sizeExceeded');
    expect(uploadsApi.uploadDocument).not.toHaveBeenCalled();
  });

  it('uploads selected PDFs without opening the created document', async () => {
    const { component, uploadsApi } = await createComponent();
    const file = new File(['pdf'], 'scan.pdf', { type: 'application/pdf' });
    const response: UploadDocumentResponse = {
      document: documentSummary,
      jobId: '018f1a44-9093-7f55-a515-278f4d9bd998',
    };
    uploadsApi.uploadDocument.mockReturnValue(
      of(
        { type: HttpEventType.UploadProgress, loaded: 5, total: 10 },
        {
          type: HttpEventType.Response,
          body: response,
        },
      ),
    );

    component.prepareUploadDocumentFile(file);

    expect(uploadsApi.uploadDocument).toHaveBeenCalledWith(file, tenant.id);
    expect(component.uploadProgress()).toBe(100);
  });
});
