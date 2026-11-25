import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PredioNicho } from './Entities/predio_nicho.entity';
import { Nicho } from './Entities/nicho.entity';
import { RegistrarDifuntoDto } from './dto/registrar-difunto.dto';

@Injectable()
export class CatastroService {
  constructor(
    @InjectRepository(PredioNicho)
    private readonly predioRepository: Repository<PredioNicho>,
    @InjectRepository(Nicho)
    private readonly nichoRepository: Repository<Nicho>,
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
        'ST_AsGeoJSON(predio.poligono)::json AS geometria',
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

  /**
   * Devuelve todos los nichos de un bloque junto con las filas y columnas
   * existentes, para que el frontend dibuje la cuadrícula tipo Excel.
   */
  async obtenerNichosDeBloque(predioId: string) {
    const bloque = await this.predioRepository.findOne({
      where: { id: predioId },
    });

    if (!bloque) {
      throw new NotFoundException(`No existe un bloque con el id ${predioId}`);
    }

    const nichos = await this.nichoRepository.find({
      where: { predio_id: predioId },
      order: { fila: 'ASC', columna: 'ASC' },
    });

    return {
      bloque: {
        id: bloque.id,
        codigo_lote: bloque.codigo_lote,
      },
      filas: [...new Set(nichos.map((nicho) => nicho.fila))].sort(
        (a, b) => a - b,
      ),
      columnas: [...new Set(nichos.map((nicho) => nicho.columna))].sort(
        (a, b) => a - b,
      ),
      nichos,
    };
  }

  /** Lista los bloques/mausoleos ordenados alfabéticamente por código. */
  async obtenerBloques() {
    return this.predioRepository
      .createQueryBuilder('predio')
      .select(['predio.id', 'predio.codigo_lote'])
      .where('predio.poligono IS NOT NULL')
      .orderBy('predio.codigo_lote', 'ASC')
      .getMany();
  }

  /**
   * Registra formalmente a un difunto en la posición (predio, fila, columna).
   * Si la celda existe y está Libre se actualiza; si no existe se inserta.
   * `apellido_difunto` y `nombre_difunto` se construyen automáticamente para
   * que el buscador y el geovisor sigan funcionando igual.
   */
  async registrarDifunto(datos: RegistrarDifuntoDto): Promise<Nicho> {
    const bloque = await this.predioRepository.findOne({
      where: { id: datos.predio_id },
    });

    if (!bloque) {
      throw new NotFoundException(
        `No existe un bloque con el id ${datos.predio_id}`,
      );
    }

    const apellidoPaterno = datos.apellido_paterno.trim();
    const apellidoMaterno = (datos.apellido_materno ?? '').trim();
    const nombres = datos.nombres.trim();
    const apellidoCompleto = `${apellidoPaterno} ${apellidoMaterno}`.trim();

    let nicho = await this.nichoRepository.findOne({
      where: {
        predio_id: datos.predio_id,
        fila: datos.fila,
        columna: datos.columna,
      },
    });

    if (nicho && nicho.estado !== 'Libre') {
      throw new ConflictException(
        `La posición fila ${datos.fila}, columna ${datos.columna} ya está ocupada en el bloque ${bloque.codigo_lote}.`,
      );
    }

    if (!nicho) {
      nicho = this.nichoRepository.create({
        predio_id: datos.predio_id,
        fila: datos.fila,
        columna: datos.columna,
      });
    }

    nicho.apellido_paterno = apellidoPaterno;
    nicho.apellido_materno = apellidoMaterno || null;
    nicho.nombres = nombres;
    nicho.apellido_difunto = apellidoCompleto;
    nicho.nombre_difunto = nombres;
    nicho.anio_defuncion = datos.anio_defuncion ?? null;
    nicho.solicitante = datos.solicitante?.trim() || null;
    nicho.telefono_solicitante = datos.telefono_solicitante?.trim() || null;
    nicho.resolucion = datos.resolucion?.trim() || null;
    nicho.estado = datos.estado ?? 'Ocupado';

    return this.nichoRepository.save(nicho);
  }

  /**
   * Busca nichos por apellido o nombre del difunto (ILIKE, sin distinguir
   * mayúsculas) y devuelve además el centroide y los bounds del bloque para
   * que el geovisor pueda hacer zoom y abrir la cuadrícula.
   */
  async buscarPorApellido(texto: string) {
    const termino = (texto ?? '').trim();

    if (termino.length < 2) {
      return [];
    }

    const resultados: Array<{
      id: string;
      predio_id: string;
      codigo_lote: string;
      fila: number;
      columna: number;
      estado: string;
      nombre_difunto: string | null;
      apellido_difunto: string | null;
      solicitante: string | null;
      resolucion: string | null;
      centro_lat: number;
      centro_lng: number;
      min_lat: number;
      min_lng: number;
      max_lat: number;
      max_lng: number;
    }> = await this.nichoRepository.query(
      `SELECT
         n.id,
         n.predio_id,
         p.codigo_lote,
         n.fila,
         n.columna,
         n.estado,
         n.nombre_difunto,
         n.apellido_difunto,
         n.solicitante,
         n.resolucion,
         ST_Y(ST_Centroid(p.poligono)) AS centro_lat,
         ST_X(ST_Centroid(p.poligono)) AS centro_lng,
         ST_YMin(ST_Envelope(p.poligono)) AS min_lat,
         ST_XMin(ST_Envelope(p.poligono)) AS min_lng,
         ST_YMax(ST_Envelope(p.poligono)) AS max_lat,
         ST_XMax(ST_Envelope(p.poligono)) AS max_lng
       FROM nichos n
       INNER JOIN predio_nicho p ON p.id = n.predio_id
       WHERE n.apellido_difunto ILIKE $1
          OR n.nombre_difunto ILIKE $1
       ORDER BY n.apellido_difunto NULLS LAST, n.fila, n.columna
       LIMIT 50`,
      [`%${termino}%`],
    );

    return resultados.map((r) => ({
      id: r.id,
      predio_id: r.predio_id,
      codigo_lote: r.codigo_lote,
      fila: Number(r.fila),
      columna: Number(r.columna),
      estado: r.estado,
      nombre_difunto: r.nombre_difunto,
      apellido_difunto: r.apellido_difunto,
      solicitante: r.solicitante,
      resolucion: r.resolucion,
      centro: { lat: Number(r.centro_lat), lng: Number(r.centro_lng) },
      bounds: {
        minLat: Number(r.min_lat),
        minLng: Number(r.min_lng),
        maxLat: Number(r.max_lat),
        maxLng: Number(r.max_lng),
      },
    }));
  }
}
