import { expectObjectContaining } from '../testing/expect-matchers';
import { EmailMailboxesService } from './email-mailboxes.service';

const createdAt = new Date('2026-05-25T18:00:00.000Z');
const tenant = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd900',
  key: 'default',
  name: 'Default',
  isActive: true,
};

describe('EmailMailboxesService', () => {
  it('lists messages across mailboxes with mailbox names and document statuses', async () => {
    const prisma = {
      emailMessage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '018f1a44-9093-7f55-a515-278f4d9bd993',
            mailboxId: '018f1a44-9093-7f55-a515-278f4d9bd990',
            mailbox: { name: 'Invoices', tenant },
            folderPath: 'INBOX',
            uid: 10n,
            uidValidity: 1n,
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
                messageId: '018f1a44-9093-7f55-a515-278f4d9bd993',
                fileName: 'invoice.pdf',
                mimeType: 'application/pdf',
                size: 1234,
                checksum: 'abc',
                storagePath: 'email/message/invoice.pdf',
                documentId: '018f1a44-9093-7f55-a515-278f4d9bd995',
                document: { status: 'READY' },
                createdAt,
              },
            ],
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new EmailMailboxesService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const response = await service.listAllMessages({ page: 1, pageSize: 25 }, [
      tenant.id,
    ]);

    expect(prisma.emailMessage.findMany).toHaveBeenCalledWith({
      where: {
        mailboxId: undefined,
        mailbox: { tenantId: { in: [tenant.id] } },
        folderPath: undefined,
      },
      include: expectObjectContaining({
        mailbox: { include: { tenant: true } },
      }),
      orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
      skip: 0,
      take: 25,
    });
    expect(response.items[0].mailboxName).toBe('Invoices');
    expect(response.items[0].attachments[0].documentStatus).toBe('READY');
  });
});
