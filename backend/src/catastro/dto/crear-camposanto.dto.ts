import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Registro de un sitio en tierra individual (camposanto).
 * Si no se indica `predio_id`, el servicio usa (o crea) el predio base
 * "CAMPOSANTOS" y calcula la siguiente posición libre.
 */
export class CrearCamposantoDto {
  @IsOptional()
  @IsUUID()
  predio_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sector_camposanto?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  fila?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  columna?: number;

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
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de defunción debe tener formato YYYY-MM-DD.',
  })
  fecha_defuncion?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de vencimiento debe tener formato YYYY-MM-DD.',
  })
  fecha_vencimiento?: string;

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
  @IsIn(['Libre', 'Ocupado', 'Mora'])
  estado?: 'Libre' | 'Ocupado' | 'Mora';

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
  @IsString()
  @MaxLength(2000)
  observaciones?: string;
}
