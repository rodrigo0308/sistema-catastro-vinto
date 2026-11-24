import { Test, TestingModule } from '@nestjs/testing';
import { CatastroController } from './catastro.controller';
import { CatastroService } from './catastro.service';

describe('CatastroController', () => {
  let controller: CatastroController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatastroController],
      providers: [
        {
          provide: CatastroService,
          useValue: { obtenerMapaGeoJson: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<CatastroController>(CatastroController);
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });
});
