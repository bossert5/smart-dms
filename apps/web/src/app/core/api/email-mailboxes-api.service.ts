import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CreateEmailMailboxRequest,
  EmailConnectionTestResponse,
  EmailMailboxConnectionRequest,
  EmailMailboxDto,
  EmailMessagesResponse,
  EmailRemoteFolderDto,
  EmailSyncResponse,
  UpdateEmailMailboxRequest,
} from '@smart-dms/shared-dto';
import type { Observable } from 'rxjs';
import { ApiUrlService } from './api-url.service';
import { toHttpParams } from './http-params';

export interface EmailMessagesQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly mailboxId?: string;
  readonly folderPath?: string;
}

@Injectable({ providedIn: 'root' })
export class EmailMailboxesApiService {
  private readonly http = inject(HttpClient);
  private readonly urls = inject(ApiUrlService);

  mailboxes(): Observable<EmailMailboxDto[]> {
    return this.http.get<EmailMailboxDto[]>(this.urls.endpoint('/email-mailboxes'));
  }

  create(input: CreateEmailMailboxRequest): Observable<EmailMailboxDto> {
    return this.http.post<EmailMailboxDto>(this.urls.endpoint('/email-mailboxes'), input);
  }

  update(id: string, input: UpdateEmailMailboxRequest): Observable<EmailMailboxDto> {
    return this.http.patch<EmailMailboxDto>(this.urls.endpoint(`/email-mailboxes/${id}`), input);
  }

  delete(id: string): Observable<{ success: true }> {
    return this.http.delete<{ success: true }>(this.urls.endpoint(`/email-mailboxes/${id}`));
  }

  test(id: string): Observable<EmailConnectionTestResponse> {
    return this.http.post<EmailConnectionTestResponse>(
      this.urls.endpoint(`/email-mailboxes/${id}/test`),
      {},
    );
  }

  testConnectionInput(
    input: EmailMailboxConnectionRequest,
  ): Observable<EmailConnectionTestResponse> {
    return this.http.post<EmailConnectionTestResponse>(
      this.urls.endpoint('/email-mailboxes/test'),
      input,
    );
  }

  sync(id: string): Observable<EmailSyncResponse> {
    return this.http.post<EmailSyncResponse>(this.urls.endpoint(`/email-mailboxes/${id}/sync`), {});
  }

  folders(id: string): Observable<EmailRemoteFolderDto[]> {
    return this.http.get<EmailRemoteFolderDto[]>(
      this.urls.endpoint(`/email-mailboxes/${id}/folders`),
    );
  }

  foldersFromConnectionInput(
    input: EmailMailboxConnectionRequest,
  ): Observable<EmailRemoteFolderDto[]> {
    return this.http.post<EmailRemoteFolderDto[]>(
      this.urls.endpoint('/email-mailboxes/folders'),
      input,
    );
  }

  messages(id: string, query: EmailMessagesQuery): Observable<EmailMessagesResponse> {
    return this.http.get<EmailMessagesResponse>(
      this.urls.endpoint(`/email-mailboxes/${id}/messages`),
      {
        params: toHttpParams({
          page: query.page,
          pageSize: query.pageSize,
          folderPath: query.folderPath,
        }),
      },
    );
  }

  allMessages(query: EmailMessagesQuery): Observable<EmailMessagesResponse> {
    return this.http.get<EmailMessagesResponse>(this.urls.endpoint('/email-messages'), {
      params: toHttpParams({
        page: query.page,
        pageSize: query.pageSize,
        mailboxId: query.mailboxId,
        folderPath: query.folderPath,
      }),
    });
  }

  pdfUrl(path: string | null): string | null {
    return this.urls.assetUrl(path);
  }
}
