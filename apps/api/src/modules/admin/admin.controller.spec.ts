import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

describe('AdminController (stats, usuarios, partidas, auditoría)', () => {
  let controller: AdminController;
  let service: jest.Mocked<AdminService>;

  beforeEach(async () => {
    const serviceMock = {
      getStats: jest.fn().mockResolvedValue({ users: 3, matches: 5, challenges: 2, creditsInCirculation: 2600 }),
      listUsers: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
      listMatches: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
      listAudit: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
    };
    const guardStub = { canActivate: () => true };
    const module = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: serviceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(guardStub)
      .overrideGuard(RolesGuard)
      .useValue(guardStub)
      .compile();
    controller = module.get(AdminController);
    service = module.get(AdminService);
  });

  it('GET /admin/stats devuelve los contadores', async () => {
    const stats = await controller.getStats();
    expect(service.getStats).toHaveBeenCalled();
    expect(stats.users).toBe(3);
    expect(stats.creditsInCirculation).toBe(2600);
  });

  it('GET /admin/users delega con paginación', async () => {
    await controller.listUsers({ page: 2, limit: 10 });
    expect(service.listUsers).toHaveBeenCalledWith(2, 10);
  });

  it('GET /admin/matches delega con paginación', async () => {
    await controller.listMatches({ page: 1, limit: 20 });
    expect(service.listMatches).toHaveBeenCalledWith(1, 20);
  });

  it('GET /admin/audit delega con paginación', async () => {
    await controller.listAudit({ page: 1, limit: 20 });
    expect(service.listAudit).toHaveBeenCalledWith(1, 20);
  });
});
