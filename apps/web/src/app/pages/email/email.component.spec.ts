import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  DownOutline,
  FilePdfOutline,
  ReloadOutline,
  SyncOutline,
} from '@ant-design/icons-angular/icons';
import type { EmailMessagesResponse } from '@smart-dms/shared-dto';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { of } from 'rxjs';
import { EmailMailboxesApiService } from '../../core/api/email-mailboxes-api.service';
import { provideI18nTesting } from '../../testing/i18n-testing';
import { EmailComponent } from './email.component';

const createdAt = '2026-05-25T18:00:00.000Z';
const tenant = {
  id: '00000000-0000-4000-8000-000000000010',
  key: 'default',
  name: 'Default',
  isActive: true,
};

const messages: EmailMessagesResponse = {
  items: [
    {
      id: '018f1a44-9093-7f55-a515-278f4d9bd993',
      tenant,
      mailboxId: '018f1a44-9093-7f55-a515-278f4d9bd990',
      mailboxName: 'Invoices',
      folderPath: 'INBOX',
      uid: '10',
      uidValidity: '1',
      messageId: '<invoice@example.com>',
      subject: 'Invoice May',
      fromAddress: 'billing@supplier.example',
      fromName: 'Supplier',
      sentAt: createdAt,
      receivedAt: createdAt,
      textPreview: 'Please see attached.',
      bodyText: 'Please see attached.',
      processedAt: createdAt,
      skippedReason: null,
      createdAt,
      updatedAt: createdAt,
      attachments: [
        {
          id: '018f1a44-9093-7f55-a515-278f4d9bd994',
          fileName: 'invoice.pdf',
          mimeType: 'application/pdf',
          size: 1234,
          checksum: 'abc',
          documentId: '018f1a44-9093-7f55-a515-278f4d9bd995',
          documentStatus: 'READY',
          pdfUrl: null,
          createdAt,
        },
      ],
    },
  ],
  meta: {
    page: 1,
    pageSize: 25,
    totalItems: 1,
    totalPages: 1,
  },
};

describe('EmailComponent', () => {
  let fixture: ComponentFixture<EmailComponent>;
  let api: {
    allMessages: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    api = {
      allMessages: vi.fn().mockReturnValue(of(messages)),
    };

    await TestBed.configureTestingModule({
      imports: [EmailComponent],
      providers: [
        provideI18nTesting(),
        provideRouter([]),
        provideNzIcons([DownOutline, FilePdfOutline, ReloadOutline, SyncOutline]),
        { provide: EmailMailboxesApiService, useValue: api },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EmailComponent);
  });

  it('loads all email messages in an infinite processing table', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const panelActions = compiled.querySelector('.app-table-panel__actions');

    expect(api.allMessages).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
    });
    expect(compiled.querySelector('.email-actions')).toBeNull();
    expect(panelActions?.textContent).toContain('Refresh');
    expect(panelActions?.nextElementSibling?.querySelector('nz-table')).not.toBeNull();
    expect(compiled.textContent).toContain('Invoices');
    expect(compiled.textContent).toContain('Invoice May');
    expect(compiled.textContent).toContain('Supplier');
    expect(compiled.textContent).toContain('Processed');
    expect(compiled.querySelector('nz-pagination')).toBeNull();
    expect(compiled.querySelector('iframe')).toBeNull();
  });

  it('loads and appends the next email message page', () => {
    fixture.detectChanges();
    const nextMessage = {
      ...messages.items[0],
      id: '018f1a44-9093-7f55-a515-278f4d9bd996',
      subject: 'Invoice June',
    };
    fixture.componentInstance.totalMessages.set(2);
    api.allMessages.mockClear();
    api.allMessages.mockReturnValueOnce(
      of({
        items: [nextMessage],
        meta: {
          page: 2,
          pageSize: 25,
          totalItems: 2,
          totalPages: 2,
        },
      }),
    );

    fixture.componentInstance.loadNextPage();

    expect(api.allMessages).toHaveBeenCalledWith({
      page: 2,
      pageSize: 25,
    });
    expect(fixture.componentInstance.messages().map((message) => message.subject)).toEqual([
      'Invoice May',
      'Invoice June',
    ]);
  });
});
