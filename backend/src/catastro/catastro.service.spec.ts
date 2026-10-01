import { Test, TestingModule } from '@nestjs/testing';
import { CatastroService } from './catastro.service';

describe('CatastroService', () => {
  let service: CatastroService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CatastroService],
    }).compile();

    service = module.get<CatastroService>(CatastroService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
