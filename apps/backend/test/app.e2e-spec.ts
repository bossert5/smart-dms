import { expectAny } from '../src/testing/expect-matchers';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import { AppModule } from './../src/app.module';
import { API_GLOBAL_PREFIX } from './../src/common/api-prefix';
import { PrismaService } from './../src/prisma/prisma.service';

const e2eTenantId = '018f1a44-9093-7f55-a515-278f4d9bd9e0';
const e2eUserId = '018f1a44-9093-7f55-a515-278f4d9bd9e1';
const e2eUsername = 'e2e-admin';
const e2ePassword = 'E2eAdmin1!';

const describeIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

interface HealthResponseBody {
  status: string;
}

interface LoginResponseBody {
  accessToken: string;
}

interface CurrentUserResponseBody {
  user: {
    username: string;
  };
}

interface UploadConfigResponseBody {
  allowedMimeTypes: string[];
}

interface DocumentListResponseBody {
  items: unknown[];
}

function normalizeSetCookieHeader(
  header: string | string[] | undefined,
): string[] {
  if (Array.isArray(header)) {
    return header;
  }

  return header ? [header] : [];
}

describeIfDatabase('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix(API_GLOBAL_PREFIX);
    await app.init();
    await seedE2eUser(app.get(PrismaService));
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect(({ body }: { body: HealthResponseBody }) => {
        expect(body.status).toBe('ok');
      });
  });

  it('rejects protected routes without an access token', () => {
    return request(app.getHttpServer()).get('/api/documents').expect(401);
  });

  it('logs in, refreshes, reads current user, and loads authenticated smokes', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: e2eUsername, password: e2ePassword })
      .expect(201);
    const loginBody = login.body as LoginResponseBody;
    const accessToken = loginBody.accessToken;
    const cookies = normalizeSetCookieHeader(login.headers['set-cookie']);
    const refreshCookie = cookies.find((cookie) =>
      cookie.startsWith('refreshToken='),
    );

    expect(accessToken).toEqual(expectAny(String));
    expect(refreshCookie).toEqual(expectAny(String));
    if (!refreshCookie) {
      throw new Error('Login response did not set refreshToken cookie');
    }

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie.split(';', 1)[0])
      .expect(201)
      .expect(({ body }: { body: LoginResponseBody }) => {
        expect(body.accessToken).toEqual(expectAny(String));
      });

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }: { body: CurrentUserResponseBody }) => {
        expect(body.user.username).toBe(e2eUsername);
      });

    await request(app.getHttpServer())
      .get('/api/uploads/config')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }: { body: UploadConfigResponseBody }) => {
        expect(body.allowedMimeTypes).toContain('application/pdf');
      });

    await request(app.getHttpServer())
      .get('/api/documents')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }: { body: DocumentListResponseBody }) => {
        expect(Array.isArray(body.items)).toBe(true);
      });
  });

  afterEach(async () => {
    await app?.close();
  });
});

async function seedE2eUser(prisma: PrismaService): Promise<void> {
  await prisma.tenant.upsert({
    where: { id: e2eTenantId },
    update: { isActive: true },
    create: {
      id: e2eTenantId,
      key: 'e2e',
      name: 'E2E',
      isActive: true,
    },
  });
  await prisma.user.upsert({
    where: { id: e2eUserId },
    update: {
      username: e2eUsername,
      displayName: 'E2E Admin',
      passwordHash: await argon2.hash(e2ePassword),
      role: 'Admin',
      isActive: true,
      passwordChangeRequired: false,
    },
    create: {
      id: e2eUserId,
      username: e2eUsername,
      displayName: 'E2E Admin',
      passwordHash: await argon2.hash(e2ePassword),
      role: 'Admin',
      isActive: true,
      passwordChangeRequired: false,
    },
  });
  await prisma.userTenantMembership.upsert({
    where: {
      userId_tenantId: {
        userId: e2eUserId,
        tenantId: e2eTenantId,
      },
    },
    update: { isDefault: true },
    create: {
      userId: e2eUserId,
      tenantId: e2eTenantId,
      isDefault: true,
    },
  });
}
