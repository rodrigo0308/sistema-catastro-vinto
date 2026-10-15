import { Controller, Post, Body } from '@nestjs/common';
import { TributarioService } from './tributario.service';

@Controller('tributario')
export class TributarioController {
    constructor(private readonly tributarioService: TributarioService) {}

    @Post('liquidar')
    calcularDeuda(@Body() datos: { costoBase: number; mesesRetraso: number }) {
    return this.tributarioService.calcularLiquidacion(datos.costoBase, datos.mesesRetraso);
    }
}