import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Confirmación de pago en caja de un contrato recién emitido.
 * El comprobante es opcional y, si se envía, se anexa a las observaciones.
 */
export class ConfirmarPagoDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  comprobante_caja?: string;
}
