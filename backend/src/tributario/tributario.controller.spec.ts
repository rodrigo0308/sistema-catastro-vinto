import { Test, TestingModule } from '@nestjs/testing';
import { TributarioController } from './tributario.controller';
import { TributarioService } from './tributario.service';

describe('TributarioController', () => {
  let controller: TributarioController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TributarioController],
      providers: [
        {
          provide: TributarioService,
          useValue: { calcularLiquidacion: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<TributarioController>(TributarioController);
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });
});
