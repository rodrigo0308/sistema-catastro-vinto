import { Controller, Get, UseGuards } from '@nestjs/common';
import { CatastroService } from './catastro.service';
import { AuthGuard } from '@nestjs/passport'; // Herramienta de protección JWT

@Controller('catastro')
export class CatastroController {
    constructor(private readonly catastroService: CatastroService) {}

  // Criterios de Aceptación 1 y 2: Endpoint protegido que retorna el GeoJSON
    @UseGuards(AuthGuard('jwt'))
    @Get('mapa')
    obtenerMapa() {
    return this.catastroService.obtenerMapaGeoJson();
    }
}