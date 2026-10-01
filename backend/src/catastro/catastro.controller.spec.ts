import { Test, TestingModule } from '@nestjs/testing';
import { CatastroController } from './catastro.controller';

describe('CatastroController', () => {
  let controller: CatastroController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatastroController],
    }).compile();

    controller = module.get<CatastroController>(CatastroController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
