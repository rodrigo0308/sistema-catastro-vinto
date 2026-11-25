import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Datos del registro formal boliviano de un difunto en un nicho.
 * `apellido_difunto` y `nombre_difunto` no se reciben: el servicio los
 * construye a partir de estos campos.
 */
export class RegistrarDifuntoDto {
  @IsUUID()
  predio_id!: string;

  @IsInt()
  @Min(1)
  fila!: number;

  @IsInt()
  @Min(1)
  columna!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  apellido_paterno!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  apellido_materno?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nombres!: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  anio_defuncion?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  solicitante?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono_solicitante?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  resolucion?: string;

  @IsOptional()
  @IsIn(['Ocupado', 'Mora'])
  estado?: 'Ocupado' | 'Mora';
}
