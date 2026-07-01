import { expectObjectContaining } from '../testing/expect-matchers';
import { DocumentsController } from './documents.controller';
import { ROLES_KEY } from '../common/auth.decorators';
import type { DocumentsService } from './documents.service';

const documentTypeId = '018f1a44-9093-7f55-a515-278f4d9bd99f';
const secondDocumentTypeId = '018f1a44-9093-7f55-a515-278f4d9bd990';
const tenantId = '018f1a44-9093-7f55-a515-278f4d9bd900';
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'admin',
  displayName: 'Admin',
  role: 'Admin' as const,
  isActive: true,
  passwordChangeRequired: false,
  createdAt: '2026-05-07T00:00:00.000Z',
  updatedAt: '2026-05-07T00:00:00.000Z',
  tenants: [{ id: tenantId, key: 'default', name: 'Default', isActive: true }],
  defaultTenantId: tenantId,
};
const request = { headers: {} };

function createController(documentsService: Partial<DocumentsService>) {
  const tenantScope = {
    resolveFromHeader: jest.fn().mockReturnValue({
      requestedScope: tenantId,
      tenantIds: [tenantId],
      isAll: false,
    }),
  };
  return {
    controller: new DocumentsController(
      documentsService as DocumentsService,
      tenantScope as never,
    ),
    tenantScope,
  };
}

describe('DocumentsController', () => {
  it('normalizes document search fields and filter query parameters', async () => {
    const search = jest.fn();
    const documentsService = {
      search,
    } as unknown as DocumentsService;
    const { controller } = createController(documentsService);

    await controller.search(
      {
        page: '2',
        pageSize: '25',
        query: 'invoice',
        searchFields: ['title', 'content', 'sender', 'tags'],
        tagNames: 'tax,legal',
        senders: ['Sender GmbH', 'Other AG'],
        documentTypeIds: `${documentTypeId},${secondDocumentTypeId}`,
        visibleDateFrom: '2026-05-01T00:00:00.000Z',
        visibleDateTo: '2026-05-31T23:59:59.999Z',
      },
      user,
      request as never,
    );

    expect(search).toHaveBeenCalledWith(
      {
        page: 2,
        pageSize: 25,
        query: 'invoice',
        searchFields: ['title', 'content', 'sender', 'tags'],
        sortBy: 'relevance',
        sortDirection: 'desc',
        filters: {
          statuses: undefined,
          sources: undefined,
          tags: undefined,
          tagNames: ['tax', 'legal'],
          senders: ['Sender GmbH', 'Other AG'],
          documentTypeIds: [documentTypeId, secondDocumentTypeId],
          includeArchived: undefined,
          createdFrom: undefined,
          createdTo: undefined,
          documentDateFrom: undefined,
          documentDateTo: undefined,
          visibleDateFrom: '2026-05-01T00:00:00.000Z',
          visibleDateTo: '2026-05-31T23:59:59.999Z',
          sender: undefined,
          recipient: undefined,
        },
      },
      [tenantId],
    );
  });

  it('uses the default full-text search fields when no explicit search field is requested', async () => {
    const search = jest.fn();
    const documentsService = {
      search,
    } as unknown as DocumentsService;
    const { controller } = createController(documentsService);

    await controller.search(
      { page: '1', pageSize: '25' },
      user,
      request as never,
    );

    expect(search).toHaveBeenCalledWith(
      expectObjectContaining({
        searchFields: ['title', 'content', 'sender', 'tags'],
      }),
      [tenantId],
    );
  });

  it('passes explicit document table sort fields to search', async () => {
    const search = jest.fn();
    const documentsService = {
      search,
    } as unknown as DocumentsService;
    const { controller } = createController(documentsService);

    await controller.search(
      {
        page: '1',
        pageSize: '25',
        sortBy: 'documentType',
        sortDirection: 'asc',
      },
      user,
      request as never,
    );

    expect(search).toHaveBeenCalledWith(
      expectObjectContaining({
        sortBy: 'documentType',
        sortDirection: 'asc',
      }),
      [tenantId],
    );
  });

  it('passes reprocess actions to the document service', async () => {
    const reprocess = jest.fn();
    const documentsService = {
      reprocess,
    } as unknown as DocumentsService;
    const { controller } = createController(documentsService);

    await controller.reprocess(
      documentTypeId,
      { action: 'ROTATE_180' },
      user,
      request as never,
    );

    expect(reprocess).toHaveBeenCalledWith(documentTypeId, user, [tenantId], {
      action: 'ROTATE_180',
    });
  });

  it('moves a document to inbox through the document service', async () => {
    const moveToInbox = jest.fn();
    const documentsService = {
      moveToInbox,
    } as unknown as DocumentsService;
    const { controller } = createController(documentsService);

    await controller.moveToInbox(documentTypeId, user, request as never);

    expect(moveToInbox).toHaveBeenCalledWith(documentTypeId, user, [tenantId]);
  });

  it('moves an inbox document to another tenant through the document service', async () => {
    const moveToTenant = jest.fn();
    const documentsService = {
      moveToTenant,
    } as unknown as DocumentsService;
    const { controller } = createController(documentsService);
    const body = {
      targetTenantId: '018f1a44-9093-7f55-a515-278f4d9bd901',
    };

    await controller.moveToTenant(documentTypeId, body, user, request as never);

    expect(moveToTenant).toHaveBeenCalledWith(documentTypeId, body, user, [
      tenantId,
    ]);
    const moveToTenantHandler = Object.getOwnPropertyDescriptor(
      DocumentsController.prototype,
      'moveToTenant',
    )?.value as unknown;
    expect(typeof moveToTenantHandler).toBe('function');
    if (typeof moveToTenantHandler !== 'function') {
      throw new Error('DocumentsController.moveToTenant handler not found');
    }
    expect(Reflect.getMetadata(ROLES_KEY, moveToTenantHandler)).toEqual([
      'Admin',
    ]);
  });

  it('deletes a document through the document service', async () => {
    const deleteDocument = jest.fn();
    const documentsService = {
      delete: deleteDocument,
    } as unknown as DocumentsService;
    const { controller } = createController(documentsService);

    await controller.delete(documentTypeId, user, request as never);

    expect(deleteDocument).toHaveBeenCalledWith(documentTypeId, user, [
      tenantId,
    ]);
  });
});
