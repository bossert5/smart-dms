export function expectAny<T>(classType: unknown): T {
  const matcher: unknown = expect.any(classType);
  return matcher as T;
}

export function expectArrayContaining<T>(sample: readonly T[]): T[] {
  const matcher: unknown = expect.arrayContaining(sample);
  return matcher as T[];
}

export function expectObjectContaining<T extends object>(sample: T): T {
  const matcher: unknown = expect.objectContaining(sample);
  return matcher as T;
}

export function expectNotObjectContaining<T extends object>(sample: T): T {
  const matcher: unknown = expect.not.objectContaining(sample);
  return matcher as T;
}

export function expectStringContaining<T extends string = string>(
  sample: string,
): T {
  const matcher: unknown = expect.stringContaining(sample);
  return matcher as T;
}

type MockWithCalls = {
  mock: {
    calls: readonly (readonly unknown[])[];
  };
};

export function mockArg<T>(
  mock: MockWithCalls,
  callIndex = 0,
  argIndex = 0,
): T {
  return mock.mock.calls[callIndex]?.[argIndex] as T;
}

export function mockCall<TArgs extends readonly unknown[]>(
  mock: MockWithCalls,
  callIndex = 0,
): TArgs {
  return mock.mock.calls[callIndex] as TArgs;
}

export function mockCalls<TArgs extends readonly unknown[]>(
  mock: MockWithCalls,
): TArgs[] {
  return mock.mock.calls as TArgs[];
}
