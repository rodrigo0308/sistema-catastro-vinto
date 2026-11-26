import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PredioNicho } from './Entities/predio_nicho.entity';
import { Nicho } from './Entities/nicho.entity';
import { RegistrarDifuntoDto } from './dto/registrar-difunto.dto';
import { ActualizarNichoDto } from './dto/actualizar-nicho.dto';
import { CrearCamposantoDto } from './dto/crear-camposanto.dto';
import { CrearBloqueDto } from './dto/crear-bloque.dto';

/** Predio base que agrupa los sitios en tierra cuando no se indica otro. */
const PREDIO_CAMPOSANTOS = 'CAMPOSANTOS';

/** Ubicación de respaldo del predio base de camposantos (interior del cementerio). */
const POLIGONO_CAMPOSANTOS = {
  type: 'Polygon',
  coordinates: [
    [
      [-66.3061, -17.4084],
      [-66.3054, -17.4084],
      [-66.3054, -17.4079],
      [-66.3061, -17.4079],
      [-66.3061, -17.4084],
    ],
  ],
};

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

    // Condiciones del contrato: el plazo es libre y el monto lo fija el
    // encargado. Si es perpetuo no hay plazo ni año de vencimiento.
    const esPerpetuo = datos.es_perpetuo === true;
    const plazoAnios = esPerpetuo ? null : (datos.plazo_anios ?? null);
    const anioDefuncion = datos.anio_defuncion ?? null;

    nicho.tipo_espacio = datos.tipo_espacio ?? 'Nicho';
    nicho.es_perpetuo = esPerpetuo;
    nicho.plazo_anios = plazoAnios;
    nicho.anio_vencimiento =
      !esPerpetuo && plazoAnios !== null && anioDefuncion !== null
        ? anioDefuncion + plazoAnios
        : null;
    nicho.monto_contrato_bs = datos.monto_contrato_bs ?? null;

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
      tipo_espacio: string | null;
      plazo_anios: number | string | null;
      es_perpetuo: boolean | null;
      anio_vencimiento: number | string | null;
      monto_contrato_bs: number | string | null;
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
         n.tipo_espacio,
         n.plazo_anios,
         n.es_perpetuo,
         n.anio_vencimiento,
         n.monto_contrato_bs,
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
      tipo_espacio: r.tipo_espacio ?? 'Nicho',
      plazo_anios: r.plazo_anios === null ? null : Number(r.plazo_anios),
      es_perpetuo: r.es_perpetuo === true,
      anio_vencimiento:
        r.anio_vencimiento === null ? null : Number(r.anio_vencimiento),
      monto_contrato_bs:
        r.monto_contrato_bs === null ? null : Number(r.monto_contrato_bs),
      centro: { lat: Number(r.centro_lat), lng: Number(r.centro_lng) },
      bounds: {
        minLat: Number(r.min_lat),
        minLng: Number(r.min_lng),
        maxLat: Number(r.max_lat),
        maxLng: Number(r.max_lng),
      },
    }));
  }

  /**
   * Edición administrativa de cualquier celda existente (nicho, mausoleo,
   * perpetuo o camposanto). Recalcula el nombre del difunto y el año de
   * vencimiento a partir de los datos del régimen recibidos.
   */
  async actualizarNicho(
    id: string,
    datos: ActualizarNichoDto,
  ): Promise<Nicho> {
    const nicho = await this.nichoRepository.findOne({ where: { id } });

    if (!nicho) {
      throw new NotFoundException(`No existe un nicho con el id ${id}`);
    }

    if (datos.apellido_paterno !== undefined) {
      nicho.apellido_paterno = this.limpiarTexto(datos.apellido_paterno);
    }
    if (datos.apellido_materno !== undefined) {
      nicho.apellido_materno = this.limpiarTexto(datos.apellido_materno);
    }
    if (datos.nombres !== undefined) {
      nicho.nombres = this.limpiarTexto(datos.nombres);
    }
    if (datos.anio_defuncion !== undefined) {
      nicho.anio_defuncion = datos.anio_defuncion ?? null;
    }
    if (datos.solicitante !== undefined) {
      nicho.solicitante = this.limpiarTexto(datos.solicitante);
    }
    if (datos.telefono_solicitante !== undefined) {
      nicho.telefono_solicitante = this.limpiarTexto(datos.telefono_solicitante);
    }
    if (datos.resolucion !== undefined) {
      nicho.resolucion = this.limpiarTexto(datos.resolucion);
    }
    if (datos.tipo_espacio !== undefined) {
      nicho.tipo_espacio = datos.tipo_espacio;
    }
    if (datos.estado !== undefined) {
      nicho.estado = datos.estado;
    }
    if (datos.monto_contrato_bs !== undefined) {
      nicho.monto_contrato_bs = datos.monto_contrato_bs ?? null;
    }
    if (datos.sector_camposanto !== undefined) {
      nicho.sector_camposanto = this.limpiarTexto(datos.sector_camposanto);
    }
    if (datos.observaciones !== undefined) {
      nicho.observaciones = this.limpiarTexto(datos.observaciones);
    }

    if (datos.es_perpetuo !== undefined) {
      nicho.es_perpetuo = datos.es_perpetuo;
    }
    if (datos.plazo_anios !== undefined) {
      nicho.plazo_anios = datos.plazo_anios ?? null;
    }
    // Un contrato perpetuo no conserva plazo ni año de vencimiento.
    if (nicho.es_perpetuo) {
      nicho.plazo_anios = null;
    }

    const apellidoPaterno = (nicho.apellido_paterno ?? '').trim();
    const apellidoMaterno = (nicho.apellido_materno ?? '').trim();
    nicho.apellido_difunto = `${apellidoPaterno} ${apellidoMaterno}`.trim() || null;
    nicho.nombre_difunto = (nicho.nombres ?? '').trim() || null;
    nicho.anio_vencimiento = this.calcularAnioVencimiento(nicho);

    return this.nichoRepository.save(nicho);
  }

  /** Lista todos los sitios en tierra (camposantos) ordenados por apellido. */
  async obtenerCamposantos() {
    const nichos = await this.nichoRepository.find({
      where: { tipo_espacio: 'Camposanto' },
      relations: { predio: true },
      order: { apellido_difunto: 'ASC', fila: 'ASC', columna: 'ASC' },
    });

    return nichos.map((nicho) => this.serializarNicho(nicho));
  }

  /**
   * Registra un sitio en tierra individual. Si no se indica un predio base se
   * usa (o crea) el predio "CAMPOSANTOS" y se asigna la siguiente posición.
   */
  async crearCamposanto(datos: CrearCamposantoDto) {
    const predio = await this.obtenerPredioCamposantos(datos.predio_id);
    const { fila, columna } = await this.resolverPosicionCamposanto(
      predio.id,
      datos.fila,
      datos.columna,
    );

    let nicho = await this.nichoRepository.findOne({
      where: { predio_id: predio.id, fila, columna },
    });

    if (nicho && nicho.estado !== 'Libre') {
      throw new ConflictException(
        `La posición fila ${fila}, sitio ${columna} ya está ocupada en el camposanto.`,
      );
    }

    if (!nicho) {
      nicho = this.nichoRepository.create({
        predio_id: predio.id,
        fila,
        columna,
      });
    }

    const apellidoPaterno = this.limpiarTexto(datos.apellido_paterno);
    const apellidoMaterno = this.limpiarTexto(datos.apellido_materno);

    nicho.apellido_paterno = apellidoPaterno;
    nicho.apellido_materno = apellidoMaterno;
    nicho.nombres = this.limpiarTexto(datos.nombres);
    nicho.apellido_difunto =
      `${apellidoPaterno ?? ''} ${apellidoMaterno ?? ''}`.trim() || null;
    nicho.nombre_difunto = nicho.nombres;
    nicho.anio_defuncion = datos.anio_defuncion ?? null;
    nicho.solicitante = this.limpiarTexto(datos.solicitante);
    nicho.telefono_solicitante = this.limpiarTexto(datos.telefono_solicitante);
    nicho.resolucion = this.limpiarTexto(datos.resolucion);
    nicho.sector_camposanto = this.limpiarTexto(datos.sector_camposanto);
    nicho.observaciones = this.limpiarTexto(datos.observaciones);
    nicho.tipo_espacio = 'Camposanto';
    nicho.estado = datos.estado ?? 'Ocupado';
    nicho.es_perpetuo = datos.es_perpetuo === true;
    nicho.plazo_anios = nicho.es_perpetuo ? null : (datos.plazo_anios ?? null);
    nicho.monto_contrato_bs = datos.monto_contrato_bs ?? null;
    nicho.anio_vencimiento = this.calcularAnioVencimiento(nicho);

    const guardado = await this.nichoRepository.save(nicho);
    return this.serializarNicho({ ...guardado, predio } as Nicho);
  }

  /**
   * Crea un bloque/mausoleo a partir del polígono dibujado en el geovisor y
   * genera su matriz inicial de nichos en estado Libre (filas x columnas).
   */
  async crearBloque(datos: CrearBloqueDto) {
    const codigo = datos.codigo_lote.trim();
    const existente = await this.predioRepository.findOne({
      where: { codigo_lote: codigo },
    });

    if (existente) {
      throw new ConflictException(
        `Ya existe un bloque con el código ${codigo}.`,
      );
    }

    const anillo = this.normalizarAnillo(datos.coordenadas);

    const [predio] = await this.predioRepository.query(
      `INSERT INTO predio_nicho (codigo_lote, estado, poligono)
       VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326))
       RETURNING id, codigo_lote, estado`,
      [
        codigo,
        datos.estado ?? 'Libre',
        JSON.stringify({ type: 'Polygon', coordinates: [anillo] }),
      ],
    );

    const filas = Math.max(1, Math.trunc(Number(datos.filas)));
    const columnas = Math.max(1, Math.trunc(Number(datos.columnas)));
    const tipo = datos.tipo_espacio_default ?? 'Nicho';
    const nichos: Nicho[] = [];

    for (let fila = 1; fila <= filas; fila++) {
      for (let columna = 1; columna <= columnas; columna++) {
        nichos.push(
          this.nichoRepository.create({
            predio_id: predio.id,
            fila,
            columna,
            estado: 'Libre',
            tipo_espacio: tipo,
            es_perpetuo: false,
          }),
        );
      }
    }

    await this.nichoRepository.save(nichos);

    return {
      bloque: {
        id: predio.id,
        codigo_lote: predio.codigo_lote,
        estado: predio.estado ?? datos.estado ?? 'Libre',
      },
      filas,
      columnas,
      tipo_espacio_default: tipo,
      nichos_creados: nichos.length,
    };
  }

  /** Texto recortado; los campos vacíos se guardan como null. */
  private limpiarTexto(valor?: string | null): string | null {
    const texto = (valor ?? '').trim();
    return texto.length > 0 ? texto : null;
  }

  /**
   * Año de vencimiento del contrato: null si es perpetuo o si falta el plazo
   * o el año de defunción; en otro caso anio_defuncion + plazo_anios.
   */
  private calcularAnioVencimiento(nicho: {
    es_perpetuo?: boolean | null;
    plazo_anios?: number | null;
    anio_defuncion?: number | null;
  }): number | null {
    if (nicho.es_perpetuo) {
      return null;
    }

    const plazo = Number(nicho.plazo_anios);
    const anio = Number(nicho.anio_defuncion);

    if (!Number.isFinite(plazo) || !Number.isFinite(anio) || plazo < 1) {
      return null;
    }

    return anio + plazo;
  }

  /** Forma plana del nicho con su bloque, usada por la gestión de camposantos. */
  private serializarNicho(nicho: Nicho) {
    const bloque = (nicho as Nicho & { predio?: PredioNicho | null }).predio;

    return {
      id: nicho.id,
      predio_id: nicho.predio_id,
      codigo_lote: bloque?.codigo_lote ?? null,
      sector_camposanto: nicho.sector_camposanto ?? null,
      fila: nicho.fila,
      columna: nicho.columna,
      apellido_paterno: nicho.apellido_paterno ?? null,
      apellido_materno: nicho.apellido_materno ?? null,
      nombres: nicho.nombres ?? null,
      nombre_difunto: nicho.nombre_difunto ?? null,
      apellido_difunto: nicho.apellido_difunto ?? null,
      anio_defuncion: nicho.anio_defuncion ?? null,
      solicitante: nicho.solicitante ?? null,
      telefono_solicitante: nicho.telefono_solicitante ?? null,
      resolucion: nicho.resolucion ?? null,
      estado: nicho.estado,
      tipo_espacio: nicho.tipo_espacio ?? 'Camposanto',
      plazo_anios: nicho.plazo_anios ?? null,
      es_perpetuo: nicho.es_perpetuo === true,
      anio_vencimiento: nicho.anio_vencimiento ?? null,
      monto_contrato_bs: nicho.monto_contrato_bs ?? null,
      observaciones: nicho.observaciones ?? null,
    };
  }

  /** Predio indicado, o el predio base de camposantos creado si no existe. */
  private async obtenerPredioCamposantos(
    predioId?: string,
  ): Promise<PredioNicho> {
    if (predioId) {
      const predio = await this.predioRepository.findOne({
        where: { id: predioId },
      });

      if (!predio) {
        throw new NotFoundException(
          `No existe un bloque con el id ${predioId}`,
        );
      }

      return predio;
    }

    const existente = await this.predioRepository.findOne({
      where: { codigo_lote: PREDIO_CAMPOSANTOS },
    });

    if (existente) {
      return existente;
    }

    const [creado] = await this.predioRepository.query(
      `INSERT INTO predio_nicho (codigo_lote, estado, poligono)
       VALUES ($1, 'Libre', ST_SetSRID(ST_GeomFromGeoJSON($2), 4326))
       RETURNING id, codigo_lote, estado`,
      [PREDIO_CAMPOSANTOS, JSON.stringify(POLIGONO_CAMPOSANTOS)],
    );

    return creado as PredioNicho;
  }

  /** Siguiente sitio libre dentro de la fila indicada del camposanto. */
  private async resolverPosicionCamposanto(
    predioId: string,
    fila?: number,
    columna?: number,
  ): Promise<{ fila: number; columna: number }> {
    const filaFinal = fila ?? 1;

    if (columna) {
      return { fila: filaFinal, columna };
    }

    const [filaMax] = await this.nichoRepository.query(
      `SELECT COALESCE(MAX(columna), 0) AS maxima
         FROM nichos
        WHERE predio_id = $1 AND fila = $2`,
      [predioId, filaFinal],
    );

    return {
      fila: filaFinal,
      columna: Number(filaMax?.maxima ?? 0) + 1,
    };
  }

  /**
   * Valida el anillo [lng, lat] del polígono dibujado y lo cierra si el
   * último vértice no coincide con el primero.
   */
  private normalizarAnillo(coordenadas: number[][]): number[][] {
    if (!Array.isArray(coordenadas) || coordenadas.length < 3) {
      throw new BadRequestException(
        'El polígono debe tener al menos 3 vértices en formato [lng, lat].',
      );
    }

    const anillo = coordenadas.map((par) => {
      if (
        !Array.isArray(par) ||
        par.length < 2 ||
        !Number.isFinite(Number(par[0])) ||
        !Number.isFinite(Number(par[1]))
      ) {
        throw new BadRequestException(
          'Cada vértice debe ser un par numérico [lng, lat].',
        );
      }

      const lng = Number(par[0]);
      const lat = Number(par[1]);

      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        throw new BadRequestException(
          'Las coordenadas deben estar en grados decimales (lng, lat).',
        );
      }

      return [lng, lat];
    });

    const primero = anillo[0];
    const ultimo = anillo[anillo.length - 1];

    if (primero[0] !== ultimo[0] || primero[1] !== ultimo[1]) {
      anillo.push([...primero]);
    }

    return anillo;
  }
}
