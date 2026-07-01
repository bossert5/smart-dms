import type { AppConfigService } from '../common/app-config.service';
import { EmailCredentialService } from './email-credential.service';

describe('EmailCredentialService', () => {
  it('encrypts and decrypts mailbox secrets without storing plaintext', () => {
    const service = new EmailCredentialService({
      secretEncryptionKey: 'test-secret-key',
    } as AppConfigService);

    const encrypted = service.encrypt('imap-password');

    expect(encrypted).not.toContain('imap-password');
    expect(service.decrypt(encrypted)).toBe('imap-password');
  });
});
