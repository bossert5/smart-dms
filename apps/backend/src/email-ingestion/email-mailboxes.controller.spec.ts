import { ROLES_KEY } from '../common/auth.decorators';
import { EmailMailboxesController } from './email-mailboxes.controller';

describe('EmailMailboxesController', () => {
  it('keeps mailbox management restricted to admins', () => {
    expect(Reflect.getMetadata(ROLES_KEY, EmailMailboxesController)).toEqual([
      'Admin',
    ]);
  });

  it('allows admins and users to read attachment PDFs', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      EmailMailboxesController.prototype,
      'attachmentPdf',
    );
    const attachmentPdfHandler = descriptor?.value as object;

    expect(Reflect.getMetadata(ROLES_KEY, attachmentPdfHandler)).toEqual([
      'Admin',
      'User',
    ]);
  });
});
