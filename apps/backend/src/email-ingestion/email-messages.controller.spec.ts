import { ROLES_KEY } from '../common/auth.decorators';
import { EmailMessagesController } from './email-messages.controller';

describe('EmailMessagesController', () => {
  it('allows admins and users to read email messages', () => {
    expect(Reflect.getMetadata(ROLES_KEY, EmailMessagesController)).toEqual([
      'Admin',
      'User',
    ]);
  });
});
