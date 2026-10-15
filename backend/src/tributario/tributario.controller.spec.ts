import { Test, TestingModule } from '@nestjs/testing';
import { TributarioController } from './tributario.controller';

describe('TributarioController', () => {
  let controller: TributarioController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TributarioController],
    }).compile();

    controller = module.get<TributarioController>(TributarioController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
