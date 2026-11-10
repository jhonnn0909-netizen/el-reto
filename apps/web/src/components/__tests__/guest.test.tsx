// Flujo de nombre de invitado (CONTRACTS.md §9.2): solo el nombre,
// validación 3–30 caracteres y llamada a POST /auth/guest.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GuestNameForm, { validateGuestName } from '../GuestNameForm';

const guestUser = {
  id: 'g1',
  username: 'invitado-abc',
  displayName: 'Carlos',
  role: 'GUEST',
  status: 'ACTIVE',
  createdAt: new Date().toISOString(),
};

function mockFetchGuest() {
  return vi.fn().mockImplementation((url: string) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: async () =>
        String(url).includes('/auth/guest')
          ? { accessToken: 'a', refreshToken: 'r', user: guestUser }
          : {},
    }),
  );
}

describe('validateGuestName', () => {
  it('rechaza nombres de menos de 3 caracteres', () => {
    expect(validateGuestName('ab')).toMatch(/3 a 30 caracteres/);
  });
  it('acepta nombres válidos', () => {
    expect(validateGuestName('Carlos')).toBeNull();
  });
});

describe('GuestNameForm', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('muestra el error sin borrar lo escrito cuando el nombre es corto', async () => {
    render(<GuestNameForm onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: /Entrar a jugar/ }));
    expect(await screen.findByText(/3 a 30 caracteres/)).toBeInTheDocument();
    expect(screen.getByLabelText('Tu nombre')).toHaveValue('ab');
  });

  it('llama a POST /auth/guest y entrega el usuario invitado', async () => {
    const fetchMock = mockFetchGuest();
    global.fetch = fetchMock as unknown as typeof fetch;
    const onDone = vi.fn();
    render(<GuestNameForm onDone={onDone} />);
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Carlos' } });
    fireEvent.click(screen.getByRole('button', { name: /Entrar a jugar/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(guestUser));
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('/auth/guest');
  });
});
