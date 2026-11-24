import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { ROLES, ROLES_LISTA } from '../../common/roles';
import type { Rol } from '../../common/roles';

export class CreateUsuarioDto {
  @IsString({ message: 'El nombre de usuario debe ser texto' })
  @MinLength(3, { message: 'El nombre de usuario debe tener al menos 3 caracteres' })
  nombreUsuario!: string;

  @IsString({ message: 'La contraseña debe ser texto' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  contrasena!: string;

  @IsIn(ROLES_LISTA, {
    message: `El rol debe ser uno de: ${ROLES.join(', ')}`,
  })
  rol!: Rol;

  @IsOptional()
  @IsBoolean({ message: 'estaActivo debe ser verdadero o falso' })
  estaActivo?: boolean;
}
