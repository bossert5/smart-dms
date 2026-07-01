import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  ChangePasswordRequest,
  CurrentUserResponse,
  LoginRequest,
  LoginResponse,
  LogoutResponse,
} from '@smart-dms/shared-dto';
import type { Observable } from 'rxjs';
import { ApiUrlService } from './api-url.service';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly urls = inject(ApiUrlService);

  login(input: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(this.urls.endpoint('/auth/login'), input);
  }

  refresh(): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(this.urls.endpoint('/auth/refresh'), {});
  }

  logout(): Observable<LogoutResponse> {
    return this.http.post<LogoutResponse>(this.urls.endpoint('/auth/logout'), {});
  }

  changePassword(input: ChangePasswordRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      this.urls.endpoint('/auth/change-password'),
      input,
    );
  }

  me(): Observable<CurrentUserResponse> {
    return this.http.get<CurrentUserResponse>(this.urls.endpoint('/auth/me'));
  }
}
