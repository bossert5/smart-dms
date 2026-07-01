import { toHttpParams } from './http-params';

describe('toHttpParams', () => {
  it('omits empty optional values and keeps false boolean values', () => {
    const params = toHttpParams({
      query: '',
      status: undefined,
      includeArchived: false,
      page: 2,
    });

    expect(params.has('query')).toBe(false);
    expect(params.has('status')).toBe(false);
    expect(params.get('includeArchived')).toBe('false');
    expect(params.get('page')).toBe('2');
  });

  it('serializes array values as repeated query parameters', () => {
    const params = toHttpParams({
      status: ['READY', 'FAILED'],
    });

    expect(params.getAll('status')).toEqual(['READY', 'FAILED']);
  });
});
