import { validate } from 'class-validator';
import { Test } from '@nestjs/testing';
import { AuthenticatedUser } from '../auth/auth.types';
import { DepositDto, RedeemPromoDto } from './dto/wallet.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

describe('WalletController', () => {
  const user = { id: 'user-1', role: 'USER' as const } as unknown as AuthenticatedUser;
  const walletResponse = {
    available: 1500,
    reserved: 0,
    total: 1500,
    currency: 'CREDITO',
    demo: true,
  };
  const txResponse = {
    id: 'tx-1',
    idempotencyKey: 'dep-1',
    type: 'DEPOSIT',
    status: 'COMPLETED',
    userId: 'user-1',
    amount: 500,
    currency: 'CREDITO',
    demo: true,
    entries: [],
  };

  let controller: WalletController;
  let service: jest.Mocked<WalletService>;

  beforeEach(async () => {
    const serviceMock = {
      getWallet: jest.fn().mockResolvedValue(walletResponse),
      getBalance: jest.fn().mockResolvedValue(walletResponse),
      listMovements: jest.fn().mockResolvedValue({ data: [], page: 1, limit: 20, total: 0, totalPages: 1 }),
      deposit: jest.fn().mockResolvedValue(txResponse),
      withdraw: jest.fn().mockResolvedValue(txResponse),
      redeemPromo: jest.fn().mockResolvedValue(txResponse),
    };
    // Guardia stub: inyecta un usuario USER autenticado.
    const guardStub = {
      canActivate: (ctx: any) => {
        ctx.switchToHttp().getRequest().user = user;
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [{ provide: WalletService, useValue: serviceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(guardStub)
      .compile();
    controller = module.get(WalletController);
    service = module.get(WalletService);
  });

  it('GET /wallet delega al servicio con el id del usuario', async () => {
    const result = await controller.getWallet(user);
    expect(service.getWallet).toHaveBeenCalledWith('user-1');
    expect(result.demo).toBe(true);
    expect(result.currency).toBe('CREDITO');
  });

  it('POST /wallet/deposit delega importe y clave de idempotencia', async () => {
    const dto = Object.assign(new DepositDto(), { amount: 500, idempotencyKey: 'dep-1' });
    const result = await controller.deposit(user, dto);
    expect(service.deposit).toHaveBeenCalledWith('user-1', 500, 'dep-1');
    expect(result.demo).toBe(true);
  });

  it('POST /wallet/promo delega el código normalizado por el DTO', async () => {
    const dto = Object.assign(new RedeemPromoDto(), { code: 'bienvenida' });
    await controller.redeemPromo(user, dto);
    expect(service.redeemPromo).toHaveBeenCalledWith('user-1', 'bienvenida');
  });

  it('DTO de depósito rechaza importe 0 o negativo', async () => {
    const dto = Object.assign(new DepositDto(), { amount: 0, idempotencyKey: 'dep-x-123' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('DTO de depósito rechaza clave de idempotencia corta', async () => {
    const dto = Object.assign(new DepositDto(), { amount: 100, idempotencyKey: 'corta' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
