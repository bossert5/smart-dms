import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from './api-base-url.token';
import { AuthApiService } from './auth-api.service';
import { DashboardApiService } from './dashboard-api.service';
import { EmailMailboxesApiService } from './email-mailboxes-api.service';
import { SettingsApiService } from './settings-api.service';
import { TenantApiService } from './tenant-api.service';
import { UploadApiService } from './upload-api.service';
import { UserApiService } from './user-api.service';

describe('core API services', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://localhost:3010/api' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('sends auth requests to the auth endpoints', () => {
    const service = TestBed.inject(AuthApiService);

    service.login({ username: 'admin', password: 'admin' }).subscribe();
    expectRequest('POST', '/auth/login', { username: 'admin', password: 'admin' }).flush({
      accessToken: 'token',
      user: null,
    });

    service.refresh().subscribe();
    expectRequest('POST', '/auth/refresh', {}).flush({ accessToken: 'token', user: null });

    service.logout().subscribe();
    expectRequest('POST', '/auth/logout', {}).flush({ success: true });

    service.changePassword({ currentPassword: 'old', newPassword: 'new' }).subscribe();
    expectRequest('POST', '/auth/change-password', {
      currentPassword: 'old',
      newPassword: 'new',
    }).flush({ accessToken: 'token', user: null });

    service.me().subscribe();
    expectRequest('GET', '/auth/me').flush({ user: null });
  });

  it('loads the dashboard summary', () => {
    TestBed.inject(DashboardApiService).summary().subscribe();

    expectRequest('GET', '/dashboard').flush({});
  });

  it('covers email mailbox and message endpoints', () => {
    const service = TestBed.inject(EmailMailboxesApiService);

    service.mailboxes().subscribe();
    expectRequest('GET', '/email-mailboxes').flush([]);

    service.create({ name: 'Inbox' } as never).subscribe();
    expectRequest('POST', '/email-mailboxes', { name: 'Inbox' }).flush({});

    service.update('mailbox-id', { name: 'Updated' } as never).subscribe();
    expectRequest('PATCH', '/email-mailboxes/mailbox-id', { name: 'Updated' }).flush({});

    service.test('mailbox-id').subscribe();
    expectRequest('POST', '/email-mailboxes/mailbox-id/test', {}).flush({ success: true });

    service
      .testConnectionInput({
        host: 'imap.example.com',
        port: 993,
        username: 'user@example.com',
        password: 'secret',
        tls: true,
      })
      .subscribe();
    expectRequest('POST', '/email-mailboxes/test', {
      host: 'imap.example.com',
      port: 993,
      username: 'user@example.com',
      password: 'secret',
      tls: true,
    }).flush({ success: true });

    service.sync('mailbox-id').subscribe();
    expectRequest('POST', '/email-mailboxes/mailbox-id/sync', {}).flush({ accepted: true });

    service.folders('mailbox-id').subscribe();
    expectRequest('GET', '/email-mailboxes/mailbox-id/folders').flush([]);

    service
      .foldersFromConnectionInput({
        mailboxId: 'mailbox-id',
        host: 'imap.example.com',
        port: 993,
        username: 'user@example.com',
        tls: true,
      })
      .subscribe();
    expectRequest('POST', '/email-mailboxes/folders', {
      mailboxId: 'mailbox-id',
      host: 'imap.example.com',
      port: 993,
      username: 'user@example.com',
      tls: true,
    }).flush([]);

    service.messages('mailbox-id', { page: 2, pageSize: 25, folderPath: 'INBOX' }).subscribe();
    const mailboxMessages = http.expectOne(
      'http://localhost:3010/api/email-mailboxes/mailbox-id/messages?page=2&pageSize=25&folderPath=INBOX',
    );
    expect(mailboxMessages.request.method).toBe('GET');
    mailboxMessages.flush({ items: [], meta: {} });

    service
      .allMessages({ page: 1, pageSize: 10, mailboxId: 'mailbox-id', folderPath: 'INBOX' })
      .subscribe();
    const allMessages = http.expectOne(
      'http://localhost:3010/api/email-messages?page=1&pageSize=10&mailboxId=mailbox-id&folderPath=INBOX',
    );
    expect(allMessages.request.method).toBe('GET');
    allMessages.flush({ items: [], meta: {} });

    service.delete('mailbox-id').subscribe();
    expectRequest('DELETE', '/email-mailboxes/mailbox-id').flush({ success: true });
    expect(service.pdfUrl('/assets/mail.pdf')).toBe('http://localhost:3010/api/assets/mail.pdf');
    expect(service.pdfUrl(null)).toBeNull();
  });

  it('covers tenant endpoints including delete body', () => {
    const service = TestBed.inject(TenantApiService);

    service.list(3, 15).subscribe();
    const list = http.expectOne('http://localhost:3010/api/tenants?page=3&pageSize=15');
    expect(list.request.method).toBe('GET');
    list.flush({ items: [], meta: {} });

    service.create({ key: 'tenant', name: 'Tenant', isActive: true }).subscribe();
    expectRequest('POST', '/tenants', {
      key: 'tenant',
      name: 'Tenant',
      isActive: true,
    }).flush({});

    service.update('tenant/id', { name: 'Updated' }).subscribe();
    expectRequest('PATCH', '/tenants/tenant%2Fid', { name: 'Updated' }).flush({});

    service
      .delete('tenant/id', {
        confirmationName: 'Tenant',
        documentAction: 'MOVE',
        targetTenantId: 'target-id',
        userAction: 'REMOVE_ASSIGNMENTS',
      })
      .subscribe();
    expectRequest('DELETE', '/tenants/tenant%2Fid', {
      confirmationName: 'Tenant',
      documentAction: 'MOVE',
      targetTenantId: 'target-id',
      userAction: 'REMOVE_ASSIGNMENTS',
    }).flush({ success: true });
  });

  it('covers upload config and multipart upload', () => {
    const service = TestBed.inject(UploadApiService);

    service.config().subscribe();
    expectRequest('GET', '/uploads/config').flush({
      maxUploadSizeBytes: 100,
      allowedMimeTypes: ['application/pdf'],
    });

    const file = new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' });
    service.uploadDocument(file, 'tenant-id').subscribe();
    const upload = http.expectOne('http://localhost:3010/api/uploads/documents');
    expect(upload.request.method).toBe('POST');
    expect(upload.request.reportProgress).toBe(true);
    expect(upload.request.body.get('file')).toBe(file);
    expect(upload.request.body.get('tenantId')).toBe('tenant-id');
    upload.flush({ document: { id: 'document-id' }, jobId: 'job-id' });
  });

  it('covers user endpoints', () => {
    const service = TestBed.inject(UserApiService);

    service.list(2, 20).subscribe();
    const list = http.expectOne('http://localhost:3010/api/users?page=2&pageSize=20');
    expect(list.request.method).toBe('GET');
    list.flush({ items: [], meta: {} });

    service.assignees().subscribe();
    expectRequest('GET', '/users/assignees').flush({ items: [] });

    service.create({ username: 'user' } as never).subscribe();
    expectRequest('POST', '/users', { username: 'user' }).flush({});

    service.update('user-id', { displayName: 'User' }).subscribe();
    expectRequest('PATCH', '/users/user-id', { displayName: 'User' }).flush({});

    service.bulkUpdate({ users: [{ id: 'user-id', displayName: 'User' }] } as never).subscribe();
    expectRequest('PATCH', '/users', {
      users: [{ id: 'user-id', displayName: 'User' }],
    }).flush({ users: [] });

    service.delete('user-id').subscribe();
    expectRequest('DELETE', '/users/user-id').flush({ success: true });
  });

  it('covers representative settings endpoints', () => {
    const service = TestBed.inject(SettingsApiService);

    service.get().subscribe();
    expectRequest('GET', '/settings').flush({});

    service.update({ documentsRequireAiMetadataBeforeAcceptance: true }).subscribe();
    expectRequest('PATCH', '/settings', {
      documentsRequireAiMetadataBeforeAcceptance: true,
    }).flush({});

    service.aiMetadataPrompts().subscribe();
    expectRequest('GET', '/settings/ai-metadata-prompts').flush([]);

    service.updateAiMetadataPrompt('summary/default', { prompt: 'Extract' } as never).subscribe();
    expectRequest('PATCH', '/settings/ai-metadata-prompts/summary%2Fdefault', {
      prompt: 'Extract',
    }).flush({});

    service.resetAiMetadataPrompt('summary/default').subscribe();
    expectRequest('POST', '/settings/ai-metadata-prompts/summary%2Fdefault/reset', {}).flush({});

    service.aiProviders().subscribe();
    expectRequest('GET', '/settings/ai-providers').flush([]);

    service
      .loadAiProviderModels({
        baseUrl: 'http://localhost:11434/v1',
        apiKey: 'secret',
      })
      .subscribe();
    expectRequest('POST', '/settings/ai-providers/models/preview', {
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'secret',
    }).flush({ models: [] });

    service.reorderAiProviders({ providerIds: ['provider-id'] }).subscribe();
    expectRequest('PATCH', '/settings/ai-providers/reorder', {
      providerIds: ['provider-id'],
    }).flush([]);

    service.refreshAiProviderModels('provider/id').subscribe();
    expectRequest('POST', '/settings/ai-providers/provider%2Fid/models/refresh', {}).flush({});

    service.documentTypes().subscribe();
    expectRequest('GET', '/settings/document-types').flush([]);

    service.reorderDocumentTypes({ documentTypeIds: ['type-id'] }).subscribe();
    expectRequest('PATCH', '/settings/document-types/reorder', {
      documentTypeIds: ['type-id'],
    }).flush([]);

    service.fieldDefinitions().subscribe();
    expectRequest('GET', '/settings/document-field-definitions').flush([]);
  });

  function expectRequest(method: string, path: string, body?: unknown) {
    const request = http.expectOne(`http://localhost:3010/api${path}`);
    expect(request.request.method).toBe(method);
    if (arguments.length === 3) {
      expect(request.request.body).toEqual(body);
    }
    return request;
  }
});
