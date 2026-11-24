import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TributarioService } from './tributario.service';

@Controller('tributario')
export class TributarioController {
  constructor(private readonly tributarioService: TributarioService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('liquidar')
  calcularDeuda(@Body() datos: { costoBase: number; mesesRetraso: number }) {
    return this.tributarioService.calcularLiquidacion(datos.costoBase, datos.mesesRetraso);
  }
}
