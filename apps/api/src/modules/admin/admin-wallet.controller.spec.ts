import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { AdminWalletController } from './admin-wallet.controller';
import { WalletService } from '../wallet/wallet.service';

describe('AdminWalletController (solo billetera)', () => {
  const admin = { id: 'admin-1', role: 'ADMIN' as const } as unknown as AuthenticatedUser;
  let controller: AdminWalletController;
  let service: jest.Mocked<WalletService>;

  beforeEach(async () => {
    const serviceMock = {
      listTransactionsAdmin: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 1 }),
      reconcile: jest.fn().mockResolvedValue({
        ok: true,
        accountsChecked: 5,
        discrepancies: [],
        unbalancedTransactions: [],
        circulation: { usersTotal: 0, systemTotal: 0, ok: true },
        demo: true,
      }),
      createPromoCode: jest.fn().mockResolvedValue({ code: 'PROMO10', credits: 100, demo: true }),
      reverseTransaction: jest.fn().mockResolvedValue({ type: 'REVERSAL', demo: true }),
    };
    const guardStub = {
      canActivate: (ctx: any) => {
        ctx.switchToHttp().getRequest().user = admin;
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [AdminWalletController],
      providers: [{ provide: WalletService, useValue: serviceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(guardStub)
      .overrideGuard(RolesGuard)
      .useValue(guardStub)
      .compile();
    controller = module.get(AdminWalletController);
    service = module.get(WalletService);
  });

  it('GET /admin/transactions delega al servicio (solo lectura)', async () => {
    await controller.listTransactions(admin, { page: 1, limit: 20 });
    expect(service.listTransactionsAdmin).toHaveBeenCalledWith('admin-1', { page: 1, limit: 20 });
  });

  it('GET /admin/wallet/reconcile devuelve el informe', async () => {
    const result = await controller.reconcile();
    expect(service.reconcile).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('POST /admin/promo-codes delega la creación', async () => {
    const dto: any = { code: 'PROMO10', credits: 100, maxUses: 5 };
    await controller.createPromoCode(admin, dto);
    expect(service.createPromoCode).toHaveBeenCalledWith('admin-1', dto);
  });

  it('POST /admin/transactions/:id/reverse delega el reverso compensatorio', async () => {
    await controller.reverseTransaction(admin, 'tx-9', { reason: 'Error operativo' } as any);
    expect(service.reverseTransaction).toHaveBeenCalledWith('admin-1', 'tx-9', 'Error operativo', undefined);
  });
});
