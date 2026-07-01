import { buildPasswordRequirements, passwordRequirementsMet } from './password-requirements';

describe('password requirements', () => {
  it('marks all requirements as met for a valid confirmed password', () => {
    const requirements = buildPasswordRequirements('Passwort1!', 'Passwort1!');

    expect(passwordRequirementsMet(requirements)).toBe(true);
  });

  it('tracks length, number, special character, and confirmation independently', () => {
    const requirements = buildPasswordRequirements('Passwort', 'Anders1!');

    expect(requirements).toEqual([
      { id: 'minLength', labelKey: 'validation.password.minLength', isMet: true },
      { id: 'number', labelKey: 'validation.password.number', isMet: false },
      { id: 'special', labelKey: 'validation.password.special', isMet: false },
      {
        id: 'confirmation',
        labelKey: 'validation.password.confirmation',
        isMet: false,
      },
    ]);
    expect(passwordRequirementsMet(requirements)).toBe(false);
  });
});
