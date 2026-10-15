import { Test, TestingModule } from '@nestjs/testing';
import { TributarioService } from './tributario.service';

describe('TributarioService', () => {
  let service: TributarioService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TributarioService],
    }).compile();

    service = module.get<TributarioService>(TributarioService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
