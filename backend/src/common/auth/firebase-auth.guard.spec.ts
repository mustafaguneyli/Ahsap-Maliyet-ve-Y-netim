import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { IS_PUBLIC_KEY } from './public.decorator';

function contextOf(opts: {
  public?: boolean;
  method?: string;
  authorization?: string;
}) {
  const handler = () => undefined;
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => ({
        method: opts.method ?? 'GET',
        headers: opts.authorization
          ? { authorization: opts.authorization }
          : {},
      }),
    }),
  } as never;
}

describe('FirebaseAuthGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const firebase = {
    isEnabled: true,
    verifyIdToken: jest.fn(),
  };

  beforeEach(() => {
    reflector.getAllAndOverride.mockReset();
    firebase.verifyIdToken.mockReset();
    firebase.isEnabled = true;
  });

  it('@Public uçları token olmadan geçer', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === IS_PUBLIC_KEY ? true : undefined,
    );
    const guard = new FirebaseAuthGuard(
      reflector as unknown as Reflector,
      firebase as never,
    );

    await expect(guard.canActivate(contextOf({}))).resolves.toBe(true);
    expect(firebase.verifyIdToken).not.toHaveBeenCalled();
  });

  it('Bearer yoksa 401 döner', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const guard = new FirebaseAuthGuard(
      reflector as unknown as Reflector,
      firebase as never,
    );

    await expect(guard.canActivate(contextOf({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('geçersiz token 401 döner', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    firebase.verifyIdToken.mockRejectedValue(new Error('bad token'));
    const guard = new FirebaseAuthGuard(
      reflector as unknown as Reflector,
      firebase as never,
    );

    await expect(
      guard.canActivate(contextOf({ authorization: 'Bearer not-a-token' })),
    ).rejects.toMatchObject({ message: 'Oturum geçersiz veya süresi doldu.' });
  });

  it('geçerli token isteği açar', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    firebase.verifyIdToken.mockResolvedValue({ uid: 'u1', email: 'a@b.c' });
    const guard = new FirebaseAuthGuard(
      reflector as unknown as Reflector,
      firebase as never,
    );

    await expect(
      guard.canActivate(contextOf({ authorization: 'Bearer good-token' })),
    ).resolves.toBe(true);
    expect(firebase.verifyIdToken).toHaveBeenCalledWith('good-token');
  });
});
