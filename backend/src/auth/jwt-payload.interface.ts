import { Rol } from '../common/roles';

/** Contenido que viaja firmado dentro del token JWT. */
export interface JwtPayload {
  sub: string; // id (UUID) del usuario
  nombreUsuario: string;
  rol: Rol;
}
