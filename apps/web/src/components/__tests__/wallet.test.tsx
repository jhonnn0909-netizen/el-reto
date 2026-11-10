// Billetera DEMO: etiqueta DEMO siempre visible, banner permanente y
// saldo cero como invitación (DESIGN.md §8).
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import WalletCard from '../WalletCard';
import { DemoBadge, DemoBanner, DemoNotice } from '../DemoBadge';

describe('WalletCard', () => {
  it('muestra la etiqueta DEMO junto al saldo', () => {
    render(<WalletCard available={1250} />);
    expect(screen.getByText('DEMO')).toBeInTheDocument();
    expect(screen.getByText(/1\.250/)).toBeInTheDocument();
    expect(screen.getByText(/créditos DEMO/)).toBeInTheDocument();
  });

  it('muestra el saldo reservado en retos', () => {
    render(<WalletCard available={500} reserved={200} />);
    expect(screen.getByText(/Reservados en retos/)).toBeInTheDocument();
  });

  it('el saldo cero es una invitación, no un error', () => {
    render(<WalletCard available={0} />);
    expect(screen.getByText(/Tienes 0 créditos DEMO/)).toBeInTheDocument();
    expect(screen.getByText(/Consigue créditos con un depósito demo/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('DemoBanner y DemoNotice', () => {
  it('el banner permanente explica que los créditos no tienen valor real', () => {
    render(<DemoBanner />);
    expect(screen.getByText(/Billetera DEMO/)).toBeInTheDocument();
    expect(screen.getByText(/no tienen valor real/)).toBeInTheDocument();
    expect(screen.getByText(/No se pueden cambiar por dinero/)).toBeInTheDocument();
  });

  it('el aviso de inicio dice que aquí no se juega con dinero real', () => {
    render(<DemoNotice />);
    expect(screen.getByText(/Aquí no se juega con dinero real/)).toBeInTheDocument();
    expect(screen.getByText('DEMO')).toBeInTheDocument();
  });

  it('DemoBadge renderiza la etiqueta DEMO', () => {
    render(<DemoBadge />);
    expect(screen.getByText('DEMO')).toBeInTheDocument();
  });
});
