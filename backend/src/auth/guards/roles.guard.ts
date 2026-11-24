import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Rol } from '../../common/roles';

interface UsuarioAutenticado {
  id: string;
  nombreUsuario: string;
  rol: string;
}

/**
 * Guard de roles. Debe usarse SIEMPRE después de AuthGuard('jwt'),
 * porque necesita que la estrategia ya haya colocado el usuario en request.user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesRequeridos = this.reflector.getAllAndOverride<Rol[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Si el endpoint no declara @Roles, no se restringe por rol.
    if (!rolesRequeridos || rolesRequeridos.length === 0) {
      return true;
    }

    const peticion = context.switchToHttp().getRequest<{ user?: UsuarioAutenticado }>();
    const usuario = peticion.user;

    if (!usuario) {
      throw new ForbiddenException('No se pudo identificar al usuario autenticado');
    }

    if (!rolesRequeridos.includes(usuario.rol as Rol)) {
      throw new ForbiddenException(
        `Acceso denegado. Se requiere uno de los roles: ${rolesRequeridos.join(', ')}`,
      );
    }

    return true;
  }
}
