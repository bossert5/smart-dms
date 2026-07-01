import { expectObjectContaining } from './testing/expect-matchers';
import { AuthController } from './auth/auth.controller';
import { CalendarController } from './calendar/calendar.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { EditLocksController } from './edit-locks/edit-locks.controller';
import { HealthController } from './health/health.controller';
import { TenantsController } from './tenants/tenants.controller';
import { UploadsController } from './uploads/uploads.controller';
import { UsersController } from './users/users.controller';
import { AiController } from './ai/ai.controller';

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

describe('thin controllers', () => {
  it('sets and clears refresh cookies through the auth controller', async () => {
    const expires = new Date('2026-05-08T00:00:00.000Z');
    const authService = {
      login: jest.fn().mockResolvedValue({
        refreshToken: 'refresh-token',
        refreshTokenExpiresAt: expires,
        response: { accessToken: 'access-token', user },
      }),
      refresh: jest.fn().mockResolvedValue({
        refreshToken: 'new-refresh-token',
        refreshTokenExpiresAt: expires,
        response: { accessToken: 'new-access-token', user },
      }),
      logout: jest.fn().mockResolvedValue(undefined),
      currentUser: jest.fn().mockReturnValue({ user }),
      changePassword: jest.fn().mockResolvedValue({
        refreshToken: 'changed-refresh-token',
        refreshTokenExpiresAt: expires,
        response: { accessToken: 'changed-access-token', user },
      }),
    };
    const response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };
    const request = {
      get: jest.fn().mockReturnValue('test-agent'),
      ip: '127.0.0.1',
      cookies: { refreshToken: 'refresh-token' },
    };
    const controller = new AuthController(authService as never);

    await expect(
      controller.login(
        { username: 'admin', password: 'admin' },
        request as never,
        response as never,
      ),
    ).resolves.toEqual({ accessToken: 'access-token', user });
    await expect(
      controller.refresh(request as never, response as never),
    ).resolves.toEqual({ accessToken: 'new-access-token', user });
    await expect(
      controller.changePassword(
        user,
        { currentPassword: 'old-password', newPassword: 'new-password' },
        request as never,
        response as never,
      ),
    ).resolves.toEqual({ accessToken: 'changed-access-token', user });
    await expect(
      controller.logout(request as never, response as never),
    ).resolves.toEqual({ success: true });

    expect(authService.login).toHaveBeenCalledWith(
      { username: 'admin', password: 'admin' },
      { userAgent: 'test-agent', ipAddress: '127.0.0.1' },
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token',
      expectObjectContaining({ httpOnly: true, path: '/api/auth', expires }),
    );
    expect(authService.refresh).toHaveBeenCalledWith('refresh-token', {
      userAgent: 'test-agent',
      ipAddress: '127.0.0.1',
    });
    expect(authService.logout).toHaveBeenCalledWith('refresh-token');
    expect(response.clearCookie).toHaveBeenCalledWith(
      'refreshToken',
      expectObjectContaining({ httpOnly: true, path: '/api/auth' }),
    );
    expect(controller.me(user)).toEqual({ user });
  });

  it('normalizes calendar query parameters and tenant scope', async () => {
    const calendarService = { listEvents: jest.fn() };
    const tenantScope = {
      resolveFromHeader: jest.fn().mockReturnValue({ tenantIds: [tenantId] }),
    };
    const controller = new CalendarController(
      calendarService as never,
      tenantScope as never,
    );

    await controller.events(
      {
        from: '2026-05-01',
        to: '2026-05-31',
        kind: 'DUE_DATE,DEADLINE',
        includeArchived: 'true',
      },
      user,
      { headers: { 'x-tenant-scope': tenantId } } as never,
    );

    expect(tenantScope.resolveFromHeader).toHaveBeenCalledWith(user, tenantId);
    expect(calendarService.listEvents).toHaveBeenCalledWith(
      {
        from: '2026-05-01',
        to: '2026-05-31',
        kinds: ['DUE_DATE', 'DEADLINE'],
        includeArchived: true,
      },
      [tenantId],
    );
  });

  it('passes dashboard scope and admin flags to the service', async () => {
    const dashboardService = { summary: jest.fn().mockResolvedValue({}) };
    const tenantScope = {
      resolveFromHeader: jest.fn().mockReturnValue({
        tenantIds: [tenantId],
        isAll: true,
      }),
    };
    const controller = new DashboardController(
      dashboardService as never,
      tenantScope as never,
    );

    await controller.summary(user, { headers: {} } as never);

    expect(dashboardService.summary).toHaveBeenCalledWith([tenantId], {
      includeAdminData: true,
      includeTenantBreakdown: true,
    });
  });

  it('delegates edit lock operations with the current user', async () => {
    const editLocks = {
      acquire: jest.fn().mockResolvedValue({ lock: { id: 'lock-id' } }),
      heartbeat: jest.fn().mockResolvedValue({ lock: { id: 'lock-id' } }),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new EditLocksController(editLocks as never);
    const body = {
      scope: 'DOCUMENT' as const,
      resourceId: '018f1a44-9093-7f55-a515-278f4d9bd99f',
      clientId: 'client-id',
      socketId: 'socket-id',
    };

    await controller.acquire(body, user);
    await controller.heartbeat('lock-id', user);
    await controller.release('lock-id', user);

    expect(editLocks.acquire).toHaveBeenCalledWith(body, user);
    expect(editLocks.heartbeat).toHaveBeenCalledWith('lock-id', user);
    expect(editLocks.release).toHaveBeenCalledWith('lock-id', user);
  });

  it('delegates health, AI, tenant, upload, and user controller calls', async () => {
    const healthService = {
      check: jest.fn().mockResolvedValue({ status: 'ok' }),
    };
    await expect(
      new HealthController(healthService as never).check(),
    ).resolves.toEqual({
      status: 'ok',
    });

    const aiService = {
      availability: jest.fn().mockReturnValue({ available: true }),
    };
    expect(new AiController(aiService as never).availability()).toEqual({
      available: true,
    });

    const tenants = {
      list: jest.fn(),
      listActive: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const tenantsController = new TenantsController(tenants as never);
    await tenantsController.list({ page: 1, pageSize: 10 });
    await tenantsController.listActive();
    await tenantsController.create({
      key: 'default',
      name: 'Default',
      isActive: true,
    });
    await tenantsController.update(tenantId, { name: 'Updated' });
    await expect(
      tenantsController.delete(tenantId, {
        confirmationName: 'Default',
        documentAction: 'DELETE',
        userAction: 'REMOVE_ASSIGNMENTS',
      }),
    ).resolves.toEqual({ success: true });
    expect(tenants.list).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
    expect(tenants.listActive).toHaveBeenCalled();
    expect(tenants.create).toHaveBeenCalledWith({
      key: 'default',
      name: 'Default',
      isActive: true,
    });
    expect(tenants.update).toHaveBeenCalledWith(tenantId, { name: 'Updated' });
    expect(tenants.delete).toHaveBeenCalledWith(tenantId, {
      confirmationName: 'Default',
      documentAction: 'DELETE',
      userAction: 'REMOVE_ASSIGNMENTS',
    });

    const uploads = {
      configResponse: jest.fn().mockReturnValue({ allowedMimeTypes: [] }),
      acceptDocumentUpload: jest.fn(),
    };
    const uploadsController = new UploadsController(uploads as never);
    const file = { originalname: 'invoice.pdf' } as Express.Multer.File;
    expect(uploadsController.config()).toEqual({ allowedMimeTypes: [] });
    await uploadsController.uploadDocument(tenantId, file, user);
    expect(uploads.acceptDocumentUpload).toHaveBeenCalledWith(
      file,
      user,
      tenantId,
    );

    const users = {
      list: jest.fn(),
      listAssignees: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateTenants: jest.fn(),
      bulkUpdate: jest.fn(),
    };
    const usersController = new UsersController(users as never);
    await usersController.assignees(user, {
      headers: { 'x-tenant-scope': tenantId },
    } as never);
    await usersController.list({ page: 2, pageSize: 20 });
    await usersController.create({
      username: 'new-user',
      displayName: 'New User',
      role: 'User',
      password: 'secret',
      tenantIds: [tenantId],
      defaultTenantId: tenantId,
    });
    await usersController.update(user.id, { displayName: 'Updated' });
    await usersController.updateTenants(user.id, {
      tenantIds: [tenantId],
      defaultTenantId: tenantId,
    });
    await usersController.bulkUpdate({
      updates: [{ id: user.id, changes: { displayName: 'Updated' } }],
    });

    expect(users.listAssignees).toHaveBeenCalledWith([tenantId]);
    expect(users.list).toHaveBeenCalledWith({ page: 2, pageSize: 20 });
    expect(users.update).toHaveBeenCalledWith(user.id, {
      displayName: 'Updated',
    });
    expect(users.updateTenants).toHaveBeenCalledWith(user.id, {
      tenantIds: [tenantId],
      defaultTenantId: tenantId,
    });
    expect(users.bulkUpdate).toHaveBeenCalledWith({
      updates: [{ id: user.id, changes: { displayName: 'Updated' } }],
    });
  });
});
