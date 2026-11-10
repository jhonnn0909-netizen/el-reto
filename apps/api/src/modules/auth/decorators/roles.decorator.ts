import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../auth.types';

export const ROLES_KEY = 'elRetoRoles';

/** Roles permitidos en el endpoint. Verificación en servidor (doc 05 §13.1). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
