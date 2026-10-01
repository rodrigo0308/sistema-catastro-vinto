import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PredioNicho } from './Entities/predio_nicho.entity';

@Injectable()
export class CatastroService {
    constructor(
    @InjectRepository(PredioNicho)
    private predioRepository: Repository<PredioNicho>,
    ) {}

  // Esta función cumple la Historia de Usuario #2 retornando un GeoJSON
    async obtenerMapaGeoJson() {
    // Usamos QueryBuilder para invocar la función espacial ST_AsGeoJSON de PostGIS
    const predios = await this.predioRepository
        .createQueryBuilder('predio')
        .select([
        'predio.id',
        'predio.codigo_lote',
        'predio.estado',
        'ST_AsGeoJSON(predio.poligono)::json AS geometria'
        ])
      // Filtramos solo los que realmente tengan un polígono dibujado
        .where('predio.poligono IS NOT NULL') 
        .getRawMany();

    // Construimos la estructura estándar "FeatureCollection" que piden los mapas (Leaflet)
    const features = predios.map((p) => ({
        type: 'Feature',
        properties: {
        id: p.predio_id,
        codigo_lote: p.predio_codigo_lote,
        estado: p.predio_estado, // El semáforo de estados (Libre, Ocupado, Mora)
        },
        geometry: p.geometria,
    }));

    return {
        type: 'FeatureCollection',
        features: features,
    };
    }
}