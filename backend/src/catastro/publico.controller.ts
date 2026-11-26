import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { CatastroService } from './catastro.service';

/**
 * Portal de consulta ciudadana. Es el único controlador de catastro sin JWT:
 * el ciudadano puede verificar la ubicación y el estado de un espacio sin
 * iniciar sesión. El servicio devuelve solo datos públicos (sin teléfonos,
 * resoluciones ni montos de contrato).
 */
@Controller('publico')
export class PublicoController {
  constructor(private readonly catastroService: CatastroService) {}

  @Get('consultar')
  consultar(@Query('q') q?: string) {
    const termino = (q ?? '').trim();

    if (termino.length < 3) {
      throw new BadRequestException(
        'Debe indicar al menos 3 caracteres en el parámetro "q".',
      );
    }

    return this.catastroService.consultarPublico(termino);
  }
}
