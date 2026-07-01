import { computed, inject, Injectable, signal } from '@angular/core';
import type {
  ChangePasswordRequest,
  LoginRequest,
  UserDto,
  UserRole,
} from '@smart-dms/shared-dto';
import {
  catchError,
  finalize,
  map,
  Observable,
  of,
  shareReplay,
  tap,
} from 'rxjs';
import { AuthApiService } from '../api/auth-api.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(AuthApiService);
  private refreshRequest$: Observable<boolean> | null = null;

  readonly accessToken = signal<string | null>(null);
  readonly user = signal<UserDto | null>(null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly passwordChangeRequired = computed(
    () => this.user()?.passwordChangeRequired ?? false,
  );
  readonly isAdmin = computed(
    () => !this.passwordChangeRequired() && this.user()?.role === 'Admin',
  );
  readonly canEditDocuments = computed(() => {
    if (this.passwordChangeRequired()) {
      return false;
    }

    const role = this.user()?.role;
    return role === 'Admin' || role === 'User';
  });

  login(input: LoginRequest): Observable<void> {
    return this.api.login(input).pipe(
      tap((response) => this.applySession(response.accessToken, response.user)),
      map(() => undefined),
    );
  }

  refresh(): Observable<boolean> {
    this.refreshRequest$ ??= this.api.refresh().pipe(
      tap((response) => this.applySession(response.accessToken, response.user)),
      map(() => true),
      catchError(() => {
        this.clearSession();
        return of(false);
      }),
      finalize(() => {
        this.refreshRequest$ = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.refreshRequest$;
  }

  logout(): Observable<void> {
    return this.api.logout().pipe(
      tap(() => this.clearSession()),
      map(() => undefined),
      catchError(() => {
        this.clearSession();
        return of(undefined);
      }),
    );
  }

  changePassword(input: ChangePasswordRequest): Observable<void> {
    return this.api.changePassword(input).pipe(
      tap((response) => this.applySession(response.accessToken, response.user)),
      map(() => undefined),
    );
  }

  hasRole(roles: UserRole[]): boolean {
    if (this.passwordChangeRequired()) {
      return false;
    }

    const role = this.user()?.role;
    return Boolean(role && roles.includes(role));
  }

  private applySession(accessToken: string, user: UserDto): void {
    this.accessToken.set(accessToken);
    this.user.set(user);
  }

  private clearSession(): void {
    this.accessToken.set(null);
    this.user.set(null);
  }
}
