import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  it('returns parsed values for valid input', () => {
    const pipe = new ZodValidationPipe(
      z.object({
        page: z.coerce.number().int().min(1),
      }),
    );

    expect(pipe.transform({ page: '2' })).toEqual({ page: 2 });
  });

  it('throws a BadRequestException for invalid input', () => {
    const pipe = new ZodValidationPipe(
      z.object({
        email: z.string().email(),
      }),
    );

    expect(() => pipe.transform({ email: 'invalid' })).toThrow(
      BadRequestException,
    );
  });
});
