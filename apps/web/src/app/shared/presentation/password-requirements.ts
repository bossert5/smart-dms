export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 256;
export const PASSWORD_DIGIT_PATTERN = /\d/;
export const PASSWORD_SPECIAL_PATTERN = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

export interface PasswordRequirement {
  readonly id: 'minLength' | 'number' | 'special' | 'confirmation';
  readonly labelKey: string;
  readonly isMet: boolean;
}

export function buildPasswordRequirements(
  password: string,
  confirmation: string,
): readonly PasswordRequirement[] {
  return [
    {
      id: 'minLength',
      labelKey: 'validation.password.minLength',
      isMet: password.length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: 'number',
      labelKey: 'validation.password.number',
      isMet: PASSWORD_DIGIT_PATTERN.test(password),
    },
    {
      id: 'special',
      labelKey: 'validation.password.special',
      isMet: PASSWORD_SPECIAL_PATTERN.test(password),
    },
    {
      id: 'confirmation',
      labelKey: 'validation.password.confirmation',
      isMet: password.length > 0 && password === confirmation,
    },
  ];
}

export function passwordRequirementsMet(requirements: readonly PasswordRequirement[]): boolean {
  return requirements.every((requirement) => requirement.isMet);
}
