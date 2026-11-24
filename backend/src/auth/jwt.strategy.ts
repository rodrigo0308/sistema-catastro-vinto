import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JWT_SECRET } from './jwt.constants';
import { JwtPayload } from './jwt-payload.interface';
import { UsuariosService } from '../usuarios/usuarios.service';

/**
 * Estrategia "jwt" de Passport.
 * Lee el header Authorization: Bearer <token>, valida la firma y la expiración,
 * y verifica que el usuario siga existiendo y esté activo en la base de datos.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usuariosService: UsuariosService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload) {
    const usuario = await this.usuariosService.buscarEntidadPorId(payload.sub);

    if (!usuario || !usuario.estaActivo) {
      throw new UnauthorizedException('Sesión no válida o usuario inactivo');
    }

    // Este objeto queda disponible como request.user en los controladores.
    return {
      id: usuario.id,
      nombreUsuario: usuario.nombreUsuario,
      rol: usuario.rol,
    };
  }
}
