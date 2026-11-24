import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CatastroService } from './catastro.service';
import { PredioNicho } from './Entities/predio_nicho.entity';
import { Nicho } from './Entities/nicho.entity';

describe('CatastroService', () => {
  let service: CatastroService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatastroService,
        {
          provide: getRepositoryToken(PredioNicho),
          useValue: { findOne: jest.fn(), createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(Nicho),
          useValue: { find: jest.fn(), query: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<CatastroService>(CatastroService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
