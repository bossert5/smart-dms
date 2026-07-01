import { expect, test, type Page } from '@playwright/test';

const tenant = {
  id: '00000000-0000-4000-8000-000000000010',
  key: 'default',
  name: 'Default',
  scannerImportPath: null,
  isActive: true,
  createdAt: '2026-05-07T00:00:00.000Z',
  updatedAt: '2026-05-07T00:00:00.000Z',
};

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'admin',
  displayName: 'Admin',
  role: 'Admin',
  isActive: true,
  passwordChangeRequired: false,
  tenants: [tenant],
  defaultTenantId: tenant.id,
  createdAt: '2026-05-07T00:00:00.000Z',
  updatedAt: '2026-05-07T00:00:00.000Z',
};

const documentType = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd992',
  key: 'invoice',
  name: 'Invoice',
  active: true,
  isSystem: true,
  displayOrder: 10,
  createdAt: '2026-05-07T18:00:00.000Z',
  updatedAt: '2026-05-07T18:00:00.000Z',
};

const documentSummary = {
  id: '018f1a44-9093-7f55-a515-278f4d9bd99f',
  title: 'Invoice May',
  tenant,
  documentType,
  originalFileName: 'invoice.pdf',
  source: 'UPLOAD',
  mimeType: 'application/pdf',
  status: 'READY',
  createdAt: '2026-05-07T18:00:00.000Z',
  updatedAt: '2026-05-07T18:00:00.000Z',
  acceptedAt: '2026-05-07T18:00:00.000Z',
  acceptedById: null,
  aiProcessedAt: null,
  documentDate: '2026-05-07',
  summary: null,
  sender: 'Sender GmbH',
  recipient: null,
  note: null,
  fileSize: 1234,
  pageCount: 1,
  tags: [],
  thumbnailUrl: null,
  calendarEventKinds: [],
};

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('logs in and shows the document list', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Password').fill('admin');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/documents$/);
  await expect(page.getByText('Invoice May')).toBeVisible();
});

test('opens upload page and submits a document', async ({ page }) => {
  await login(page);
  await page.goto('/upload');

  await expect(page.getByRole('heading', { name: 'Upload' })).toBeVisible();
  await page.setInputFiles('input[type="file"]', {
    name: 'invoice.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n'),
  });
  await page.getByRole('button', { name: 'Upload' }).click();

  await expect(page).toHaveURL(/\/documents\/018f1a44-9093-7f55-a515-278f4d9bd99f$/);
});

test('allows admin navigation to users and settings', async ({ page }) => {
  await login(page);

  await page.goto('/users');
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await expect(page.getByText('admin')).toBeVisible();

  await page.goto('/settings/general');
  await expect(page.getByRole('heading', { name: 'General' })).toBeVisible();
});

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Password').fill('admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/documents$/);
}

async function mockApi(page: Page): Promise<void> {
  await page.route('http://localhost:3010/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api(?=\/|$)/, '');

    if (path === '/auth/login' || path === '/auth/refresh') {
      await route.fulfill({ json: { accessToken: 'access-token', user } });
      return;
    }
    if (path === '/auth/me') {
      await route.fulfill({ json: { user } });
      return;
    }
    if (path === '/auth/logout') {
      await route.fulfill({ json: { success: true } });
      return;
    }
    if (path === '/uploads/config') {
      await route.fulfill({
        json: {
          maxUploadSizeBytes: 10 * 1024 * 1024,
          allowedMimeTypes: ['application/pdf', 'image/png'],
        },
      });
      return;
    }
    if (path === '/uploads/documents') {
      await route.fulfill({
        json: {
          document: documentSummary,
          jobId: 'job-id',
        },
      });
      return;
    }
    if (path === '/documents/search-facets') {
      await route.fulfill({
        json: { tags: [], senders: ['Sender GmbH'], documentTypes: [documentType] },
      });
      return;
    }
    if (path === '/documents') {
      await route.fulfill({
        json: {
          items: [documentSummary],
          meta: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
        },
      });
      return;
    }
    if (path === `/documents/${documentSummary.id}`) {
      await route.fulfill({
        json: {
          ...documentSummary,
          ocrText: null,
          pdfUrl: null,
          originalUrl: null,
          payments: [],
          calendarEvents: [],
          history: [],
          fields: [],
        },
      });
      return;
    }
    if (path === '/ai/availability') {
      await route.fulfill({ json: { available: false, providers: [] } });
      return;
    }
    if (path === '/users') {
      await route.fulfill({
        json: {
          items: [user],
          meta: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
        },
      });
      return;
    }
    if (path === '/tenants') {
      await route.fulfill({
        json: {
          items: [tenant],
          meta: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
        },
      });
      return;
    }
    if (path === '/settings') {
      await route.fulfill({
        json: {
          ocrReprocessExistingTextLayer: false,
          pdfRemoveBlankPages: false,
          documentsRequireAiMetadataBeforeAcceptance: false,
          extractionMode: 'fast',
          aiMetadataLanguage: 'DOCUMENT_LANGUAGE',
        },
      });
      return;
    }

    await route.fulfill({ json: {} });
  });
}
