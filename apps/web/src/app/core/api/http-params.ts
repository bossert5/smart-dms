import { HttpParams } from '@angular/common/http';

export type QueryParamValue = string | number | boolean | readonly string[] | null | undefined;

export type QueryParams = Record<string, QueryParamValue>;

export function toHttpParams(values: QueryParams): HttpParams {
  let params = new HttpParams();

  for (const [key, value] of Object.entries(values)) {
    if (isEmptyParam(value)) {
      continue;
    }

    if (Array.isArray(value)) {
      params = appendArrayParam(params, key, value);
      continue;
    }

    params = params.set(key, String(value));
  }

  return params;
}

function isEmptyParam(value: QueryParamValue): value is null | undefined | '' {
  return value === undefined || value === null || value === '';
}

function appendArrayParam(params: HttpParams, key: string, values: readonly string[]): HttpParams {
  let nextParams = params;

  for (const value of values) {
    if (value !== '') {
      nextParams = nextParams.append(key, value);
    }
  }

  return nextParams;
}
