import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

export const DEFAULT_API_BASE_URL = environment.apiBaseUrl;

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => DEFAULT_API_BASE_URL,
});
