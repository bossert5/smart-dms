import {
  emailSenderMatchesRules,
  normalizeSenderRule,
} from './email-sender-rules';

describe('email sender rules', () => {
  it('allows every sender when no rules are configured', () => {
    expect(emailSenderMatchesRules('person@example.com', [])).toBe(true);
  });

  it('matches exact addresses and domain wildcards case-insensitively', () => {
    const rules = [
      normalizeSenderRule('rechnung@example.com'),
      normalizeSenderRule('*@supplier.example'),
    ];

    expect(emailSenderMatchesRules('Rechnung@Example.com', rules)).toBe(true);
    expect(emailSenderMatchesRules('team@supplier.example', rules)).toBe(true);
    expect(emailSenderMatchesRules('team@other.example', rules)).toBe(false);
    expect(emailSenderMatchesRules(null, rules)).toBe(false);
  });
});
