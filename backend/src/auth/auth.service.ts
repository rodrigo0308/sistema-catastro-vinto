import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsuariosService } from '../usuarios/usuarios.service';
import { Rol } from '../common/roles';
import { JwtPayload } from './jwt-payload.interface';

/**
 * Credenciales del ADMIN que se crea automáticamente la primera vez
 * que el sistema arranca con la tabla "usuarios" vacía.
 */
export const ADMIN_POR_DEFECTO = {
  nombreUsuario: 'admin',
  contrasena: 'admin123',
  rol: 'ADMIN' as Rol,
};

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly usuariosService: UsuariosService,
  ) {}

  /**
   * Siembra inicial: si no existe ningún usuario, crea el admin por defecto.
   * Esto permite entrar al sistema por primera vez sin scripts manuales.
   */
  async onModuleInit(): Promise<void> {
    try {
      const totalUsuarios = await this.usuariosService.contarUsuarios();
      if (totalUsuarios > 0) {
        return;
      }

      await this.usuariosService.crearEntidad(ADMIN_POR_DEFECTO);
      this.logger.log(
        `Usuario ADMIN por defecto creado -> usuario: ${ADMIN_POR_DEFECTO.nombreUsuario} / contraseña: ${ADMIN_POR_DEFECTO.contrasena}`,
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo verificar o crear el usuario ADMIN por defecto: ${(error as Error).message}`,
      );
    }
  }

  async login(nombreUsuario: string, contrasena: string) {
    const usuario = await this.usuariosService.buscarPorNombreUsuario(
      (nombreUsuario ?? '').trim(),
    );

    // Mismo mensaje para usuario inexistente y contraseña incorrecta:
    // así no se filtra qué datos existen.
    if (!usuario) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    if (!usuario.estaActivo) {
      throw new UnauthorizedException('El usuario se encuentra inactivo');
    }

    const contrasenaValida = await bcrypt.compare(contrasena ?? '', usuario.contrasena);
    if (!contrasenaValida) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const payload: JwtPayload = {
      sub: usuario.id,
      nombreUsuario: usuario.nombreUsuario,
      rol: usuario.rol as Rol,
    };

    return {
      access_token: await this.jwtService.signAsync(payload),
      usuario: {
        id: usuario.id,
        nombreUsuario: usuario.nombreUsuario,
        rol: usuario.rol,
      },
    };
  }
}
