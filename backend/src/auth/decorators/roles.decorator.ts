import { SetMetadata } from '@nestjs/common';
import { Rol } from '../../common/roles';

export const ROLES_KEY = 'roles';

/**
 * Declara qué roles pueden acceder a un controlador o a un endpoint.
 * Uso: @Roles('ADMIN')
 */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);
