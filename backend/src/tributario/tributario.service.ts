import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParametroTributario } from './entities/parametro_tributario.entity';

@Injectable()
export class TributarioService {
    constructor(
    @InjectRepository(ParametroTributario)
    private parametroRepo: Repository<ParametroTributario>,
    ) {}

  // Busca los parámetros actuales o crea unos por defecto si la tabla está vacía
    private async obtenerParametrosActuales(): Promise<ParametroTributario> {
    // Agregamos 'where: {}' para cumplir con la regla estricta de TypeORM
    let parametro = await this.parametroRepo.findOne({ 
        where: {}, 
        order: { fecha_actualizacion: 'DESC' } 
    });
    
    if (!parametro) {
        parametro = this.parametroRepo.create(); 
        await this.parametroRepo.save(parametro);
    }
    return parametro;
    }

  // Motor de cálculo de deuda
    async calcularLiquidacion(costoBaseNicho: number, mesesRetraso: number) {
    const parametros = await this.obtenerParametrosActuales();
    
    let multa = 0;
    let interes = 0;

    if (mesesRetraso > 0) {
        multa = Number(parametros.multa_base_mora);
      interes = (costoBaseNicho * (Number(parametros.interes_mensual_porcentaje) / 100)) * mesesRetraso;
    }

    const totalDeudaBs = costoBaseNicho + multa + interes;
    const totalDeudaUfv = totalDeudaBs / Number(parametros.valor_ufv);

    return {
        detalle: 'Liquidación de deuda tributaria estandarizada',
        costo_base_bs: costoBaseNicho,
        meses_retraso: mesesRetraso,
        multa_bs: multa,
        interes_bs: interes,
        total_pagar_bs: totalDeudaBs,
        total_pagar_ufv: Number(totalDeudaUfv.toFixed(2)),
        parametros_aplicados: {
        ufv: parametros.valor_ufv,
        gestion: parametros.gestion_actual
        }
    };
    }
}