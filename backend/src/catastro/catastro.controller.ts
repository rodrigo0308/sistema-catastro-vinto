import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CatastroService } from './catastro.service';
import { RegistrarDifuntoDto } from './dto/registrar-difunto.dto';
import { ActualizarNichoDto } from './dto/actualizar-nicho.dto';
import { CrearCamposantoDto } from './dto/crear-camposanto.dto';
import { CrearBloqueDto } from './dto/crear-bloque.dto';

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

  // Bloques/mausoleos para el selector del registro de difuntos
  @Get('bloques')
  obtenerBloques() {
    return this.catastroService.obtenerBloques();
  }

  // Registro formal de un difunto en una celda libre (o nueva) del bloque
  @Post('nichos/registrar')
  registrarDifunto(@Body() datos: RegistrarDifuntoDto) {
    return this.catastroService.registrarDifunto(datos);
  }

  // Nichos (filas/columnas) de un bloque para la cuadrícula tipo Excel
  @Get('bloque/:id/nichos')
  obtenerNichosDeBloque(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.catastroService.obtenerNichosDeBloque(id);
  }

  // Edición administrativa de nichos, mausoleos, perpetuos y camposantos
  @Patch('nichos/:id')
  actualizarNicho(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() datos: ActualizarNichoDto,
  ) {
    return this.catastroService.actualizarNicho(id, datos);
  }

  // Gestión especializada de sepulturas en tierra
  @Get('camposantos')
  obtenerCamposantos() {
    return this.catastroService.obtenerCamposantos();
  }

  @Post('camposantos')
  crearCamposanto(@Body() datos: CrearCamposantoDto) {
    return this.catastroService.crearCamposanto(datos);
  }

  // Creación dinámica de bloques/mausoleos dibujados sobre el mapa
  @Post('bloques')
  crearBloque(@Body() datos: CrearBloqueDto) {
    return this.catastroService.crearBloque(datos);
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
