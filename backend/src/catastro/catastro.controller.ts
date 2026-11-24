import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CatastroService } from './catastro.service';

/**
 * Geovisor de catastro. Todos los endpoints requieren JWT válido.
 */
@Controller('catastro')
@UseGuards(AuthGuard('jwt'))
export class CatastroController {
  constructor(private readonly catastroService: CatastroService) {}

  // Criterios de Aceptación 1 y 2: Endpoint protegido que retorna el GeoJSON
  @Get('mapa')
  obtenerMapa() {
    return this.catastroService.obtenerMapaGeoJson();
  }

  // Nichos (filas/columnas) de un bloque para la cuadrícula tipo Excel
  @Get('bloque/:id/nichos')
  obtenerNichosDeBloque(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.catastroService.obtenerNichosDeBloque(id);
  }

  // Buscador de difuntos por apellido o nombre
  @Get('buscar')
  buscarPorApellido(@Query('apellido') apellido?: string) {
    if (!apellido || apellido.trim().length < 2) {
      throw new BadRequestException(
        'Debe indicar al menos 2 caracteres en el parámetro "apellido"',
      );
    }

    return this.catastroService.buscarPorApellido(apellido);
  }
}
