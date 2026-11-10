import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * El controlador es una capa fina: delega en AuthService. Los guards
 * (JWT, roles, throttler) se prueban en sus propios specs y en e2e;
 * aquí se verifica la delegación y la redirección OAuth.
 */
describe('AuthController', () => {
  function createController() {
    const service = {
      register: jest.fn(async () => ({ user: { id: 'u1' }, message: 'ok' })),
      login: jest.fn(async () => ({ accessToken: 'a', refreshToken: 'r', user: { id: 'u1' } })),
      buildGoogleAuthUrl: jest.fn(async () => 'https://accounts.google.com/o/oauth2/v2/auth?x=1'),
      buildFacebookAuthUrl: jest.fn(async () => 'https://www.facebook.com/v18.0/dialog/oauth?x=1'),
      handleGoogleCallback: jest.fn(async () => ({ accessToken: 'a', refreshToken: 'r', user: { id: 'u1' } })),
      handleFacebookCallback: jest.fn(async () => ({ accessToken: 'a', refreshToken: 'r', user: { id: 'u1' } })),
    } as unknown as AuthService;
    return { controller: new AuthController(service), service };
  }

  const req = { headers: {}, socket: {} } as never;

  it('register delega en el servicio', async () => {
    const { controller, service } = createController();
    const result = await controller.register(
      { username: 'jhon', email: 'j@e.com', password: 'Password1', displayName: 'Jhon' },
      req,
    );
    expect((service.register as jest.Mock).mock.calls.length).toBe(1);
    expect(result).toEqual({ user: { id: 'u1' }, message: 'ok' });
  });

  it('GET /auth/google redirige a la URL de autorización de Google', async () => {
    const { controller, service } = createController();
    const redirect = jest.fn();
    const res = { redirect } as never;
    await controller.google(res);
    expect(service.buildGoogleAuthUrl).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1');
  });

  it('GET /auth/facebook redirige a la URL de autorización de Facebook', async () => {
    const { controller, service } = createController();
    const redirect = jest.fn();
    const res = { redirect } as never;
    await controller.facebook(res);
    expect(service.buildFacebookAuthUrl).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith('https://www.facebook.com/v18.0/dialog/oauth?x=1');
  });

  it('GET /auth/google/callback delega el code y el state al servicio', async () => {
    const { controller, service } = createController();
    const result = await controller.googleCallback('code-1', 'state-1', req);
    expect(service.handleGoogleCallback).toHaveBeenCalledWith('code-1', 'state-1', expect.anything());
    expect(result).toEqual({ accessToken: 'a', refreshToken: 'r', user: { id: 'u1' } });
  });

  it('GET /auth/facebook/callback delega el code y el state al servicio', async () => {
    const { controller, service } = createController();
    const result = await controller.facebookCallback('code-2', 'state-2', req);
    expect(service.handleFacebookCallback).toHaveBeenCalledWith('code-2', 'state-2', expect.anything());
    expect(result).toEqual({ accessToken: 'a', refreshToken: 'r', user: { id: 'u1' } });
  });
});
