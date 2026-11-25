import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { TributarioService } from './tributario.service';
import { ParametroTributario } from './entities/parametro_tributario.entity';

describe('TributarioService', () => {
  let service: TributarioService;
  let parametroRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    parametroRepo = {
      findOne: jest.fn().mockResolvedValue({
        valor_ufv: 2.5,
        multa_base_mora: 100,
        interes_mensual_porcentaje: 1.5,
        gestion_actual: 2026,
      }),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TributarioService,
        {
          provide: getRepositoryToken(ParametroTributario),
          useValue: parametroRepo,
        },
      ],
    }).compile();

    service = module.get<TributarioService>(TributarioService);
  });

  it('debería calcular sin mora cuando mesesRetraso = 0', async () => {
    const resultado = await service.calcularLiquidacion(320, 0);

    expect(resultado).toEqual(
      expect.objectContaining({
        costo_base_bs: 320,
        meses_retraso: 0,
        multa_bs: 0,
        interes_bs: 0,
        total_pagar_bs: 320,
        total_pagar_ufv: 128,
      }),
    );
    expect(resultado.parametros_aplicados).toEqual({
      ufv: 2.5,
      gestion: 2026,
    });
  });

  it('debería aplicar multa e interés cuando hay meses de retraso', async () => {
    const resultado = await service.calcularLiquidacion(500, 3);

    // interes = 500 * (1.5 / 100) * 3 = 22.5 ; total = 500 + 100 + 22.5
    expect(resultado).toEqual(
      expect.objectContaining({
        costo_base_bs: 500,
        meses_retraso: 3,
        multa_bs: 100,
        interes_bs: 22.5,
        total_pagar_bs: 622.5,
        total_pagar_ufv: 249,
      }),
    );
  });
});
