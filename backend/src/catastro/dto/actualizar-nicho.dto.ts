import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Edición administrativa de un nicho, mausoleo, perpetuo o camposanto.
 * Todos los campos son opcionales: solo se actualiza lo que se envía.
 * `apellido_difunto`, `nombre_difunto` y `anio_vencimiento` los recalcula
 * el servicio a partir de estos datos.
 */
export class ActualizarNichoDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  apellido_paterno?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  apellido_materno?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nombres?: string;

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
  @IsIn(['Nicho', 'Mausoleo', 'Camposanto'])
  tipo_espacio?: 'Nicho' | 'Mausoleo' | 'Camposanto';

  @IsOptional()
  @IsInt()
  @Min(1)
  plazo_anios?: number;

  @IsOptional()
  @IsBoolean()
  es_perpetuo?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monto_contrato_bs?: number;

  @IsOptional()
  @IsIn(['Libre', 'Ocupado', 'Mora'])
  estado?: 'Libre' | 'Ocupado' | 'Mora';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sector_camposanto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones?: string;
}
