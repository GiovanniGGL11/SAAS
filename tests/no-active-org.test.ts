import { afterEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  auth: authMock,
  clerkClient: vi.fn(),
}));

describe('resolveCurrentCompanySession — no active org / not authenticated', () => {
  afterEach(() => {
    authMock.mockReset();
  });

  it('throws UnauthenticatedError when there is no signed-in user', async () => {
    authMock.mockResolvedValue({ userId: null, orgId: null });

    const { resolveCurrentCompanySession, UnauthenticatedError } =
      await import('@/server/auth/require-current-company');

    await expect(resolveCurrentCompanySession()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('throws NoActiveOrganizationError when signed in but no organization is active', async () => {
    authMock.mockResolvedValue({ userId: 'user_123', orgId: null });

    const { resolveCurrentCompanySession, NoActiveOrganizationError } =
      await import('@/server/auth/require-current-company');

    await expect(resolveCurrentCompanySession()).rejects.toBeInstanceOf(NoActiveOrganizationError);
  });
});
