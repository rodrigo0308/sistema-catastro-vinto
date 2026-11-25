import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { CatastroService } from './catastro.service';
import { PredioNicho } from './Entities/predio_nicho.entity';
import { Nicho } from './Entities/nicho.entity';
import { RegistrarDifuntoDto } from './dto/registrar-difunto.dto';

describe('CatastroService', () => {
  let service: CatastroService;
  let predioRepo: { findOne: jest.Mock; createQueryBuilder: jest.Mock };
  let nichoRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    query: jest.Mock;
  };

  const bloque = { id: 'predio-1', codigo_lote: '5-B' };

  const dtoBase: RegistrarDifuntoDto = {
    predio_id: bloque.id,
    fila: 1,
    columna: 3,
    apellido_paterno: 'Mamani',
    apellido_materno: 'Choque',
    nombres: 'Juan',
    anio_defuncion: 2020,
    solicitante: 'Rosa Mamani',
    estado: 'Ocupado',
    tipo_espacio: 'Nicho',
    plazo_anios: 5,
    es_perpetuo: false,
    monto_contrato_bs: 320,
  } as RegistrarDifuntoDto;

  beforeEach(async () => {
    predioRepo = {
      findOne: jest.fn().mockResolvedValue(bloque),
      createQueryBuilder: jest.fn(),
    };
    nichoRepo = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((datos) => ({ ...datos })),
      save: jest.fn((nicho) => Promise.resolve(nicho)),
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatastroService,
        { provide: getRepositoryToken(PredioNicho), useValue: predioRepo },
        { provide: getRepositoryToken(Nicho), useValue: nichoRepo },
      ],
    }).compile();

    service = module.get<CatastroService>(CatastroService);
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('registrarDifunto', () => {
    it('registra en celda Libre un contrato temporal y calcula el vencimiento', async () => {
      const resultado = await service.registrarDifunto(dtoBase);

      expect(nichoRepo.findOne).toHaveBeenCalledWith({
        where: { predio_id: bloque.id, fila: 1, columna: 3 },
      });
      expect(nichoRepo.save).toHaveBeenCalled();

      // 2020 (defunción) + 5 años de plazo = 2025
      expect(resultado.anio_vencimiento).toBe(2025);
      expect(resultado.plazo_anios).toBe(5);
      expect(resultado.es_perpetuo).toBe(false);
      expect(resultado.tipo_espacio).toBe('Nicho');
      expect(resultado.monto_contrato_bs).toBe(320);
      expect(resultado.estado).toBe('Ocupado');
      expect(resultado.apellido_difunto).toBe('Mamani Choque');
      expect(resultado.nombre_difunto).toBe('Juan');
    });

    it('registra un contrato perpetuo sin plazo ni año de vencimiento', async () => {
      const resultado = await service.registrarDifunto({
        ...dtoBase,
        es_perpetuo: true,
        plazo_anios: 30,
      });

      expect(resultado.es_perpetuo).toBe(true);
      expect(resultado.plazo_anios).toBeNull();
      expect(resultado.anio_vencimiento).toBeNull();
    });

    it('actualiza un nicho existente que está en estado Libre', async () => {
      nichoRepo.findOne.mockResolvedValue({
        id: 'nicho-1',
        estado: 'Libre',
        fila: 1,
        columna: 3,
      });

      const resultado = await service.registrarDifunto(dtoBase);

      expect(nichoRepo.create).not.toHaveBeenCalled();
      expect(resultado.id).toBe('nicho-1');
      expect(resultado.anio_vencimiento).toBe(2025);
    });

    it('lanza ConflictException (409) si la celda ya está Ocupada', async () => {
      nichoRepo.findOne.mockResolvedValue({
        id: 'nicho-1',
        estado: 'Ocupado',
        fila: 1,
        columna: 3,
      });

      await expect(service.registrarDifunto(dtoBase)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.registrarDifunto(dtoBase)).rejects.toMatchObject({
        status: 409,
      });
      expect(nichoRepo.save).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el bloque no existe', async () => {
      predioRepo.findOne.mockResolvedValue(null);

      await expect(service.registrarDifunto(dtoBase)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('buscarPorApellido', () => {
    it('devuelve una lista vacía con menos de 2 caracteres', async () => {
      await expect(service.buscarPorApellido('a')).resolves.toEqual([]);
      expect(nichoRepo.query).not.toHaveBeenCalled();
    });

    it('normaliza los tipos de las columnas del contrato', async () => {
      nichoRepo.query.mockResolvedValue([
        {
          id: 'nicho-1',
          predio_id: bloque.id,
          codigo_lote: '5-B',
          fila: '1',
          columna: '3',
          estado: 'Mora',
          nombre_difunto: 'Juan',
          apellido_difunto: 'Mamani Choque',
          solicitante: 'Rosa Mamani',
          resolucion: null,
          tipo_espacio: null,
          plazo_anios: '5',
          es_perpetuo: true,
          anio_vencimiento: '2025',
          monto_contrato_bs: '320.00',
          centro_lat: '-17.4',
          centro_lng: '-66.3',
          min_lat: '-17.41',
          min_lng: '-66.31',
          max_lat: '-17.39',
          max_lng: '-66.29',
        },
      ]);

      const [resultado] = await service.buscarPorApellido('Mamani');

      expect(resultado.tipo_espacio).toBe('Nicho');
      expect(resultado.plazo_anios).toBe(5);
      expect(resultado.es_perpetuo).toBe(true);
      expect(resultado.anio_vencimiento).toBe(2025);
      expect(resultado.monto_contrato_bs).toBe(320);
      expect(resultado.centro).toEqual({ lat: -17.4, lng: -66.3 });
    });
  });
});
