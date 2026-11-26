import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Creación dinámica de un bloque/mausoleo dibujado sobre el mapa satelital.
 * `coordenadas` es un anillo de pares [lng, lat] en SRID 4326; el servicio
 * lo cierra automáticamente si el último vértice no coincide con el primero.
 */
export class CrearBloqueDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  codigo_lote!: string;

  @IsOptional()
  @IsIn(['Libre', 'Ocupado', 'Mora'])
  estado?: 'Libre' | 'Ocupado' | 'Mora';

  @IsInt()
  @Min(1)
  filas!: number;

  @IsInt()
  @Min(1)
  columnas!: number;

  @IsOptional()
  @IsIn(['Nicho', 'Mausoleo'])
  tipo_espacio_default?: 'Nicho' | 'Mausoleo';

  @IsArray()
  @ArrayMinSize(3)
  coordenadas!: number[][];
}
