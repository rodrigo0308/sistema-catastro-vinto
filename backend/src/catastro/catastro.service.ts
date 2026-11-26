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
      // El nombre completo se entrega ya formateado (sin apellidos repetidos).
      nichos: nichos.map((nicho) => ({
        ...nicho,
        nombre_difunto: this.formatearNombreDifunto(nicho),
        apellido_difunto: null,
      })),
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

    // Condiciones del contrato: el plazo es libre y el monto lo fija el
    // encargado. Si es perpetuo no hay plazo ni vencimiento.
    const esPerpetuo = datos.es_perpetuo === true;
    const plazoAnios = esPerpetuo ? null : (datos.plazo_anios ?? null);
    const fechaDefuncion = this.normalizarFecha(datos.fecha_defuncion);
    const anioDefuncion =
      this.anioDeFecha(fechaDefuncion) ?? (datos.anio_defuncion ?? null);
    const fechaVencimiento = esPerpetuo
      ? null
      : (this.normalizarFecha(datos.fecha_vencimiento) ??
        (fechaDefuncion && plazoAnios !== null
          ? this.sumarAnios(fechaDefuncion, plazoAnios)
          : null));

    nicho.fecha_defuncion = fechaDefuncion;
    nicho.anio_defuncion = anioDefuncion;
    nicho.solicitante = datos.solicitante?.trim() || null;
    nicho.telefono_solicitante = datos.telefono_solicitante?.trim() || null;
    // La Resolución Administrativa (RA.) solo corresponde a perpetuos.
    nicho.resolucion = esPerpetuo ? datos.resolucion?.trim() || null : null;
    nicho.estado = datos.estado ?? 'Ocupado';

    nicho.tipo_espacio = datos.tipo_espacio ?? 'Nicho';
    nicho.es_perpetuo = esPerpetuo;
    nicho.plazo_anios = plazoAnios;
    nicho.fecha_vencimiento = fechaVencimiento;
    nicho.anio_vencimiento =
      this.anioDeFecha(fechaVencimiento) ??
      (!esPerpetuo && plazoAnios !== null && anioDefuncion !== null
        ? anioDefuncion + plazoAnios
        : null);
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
    const tokens = this.extraerTokens(termino);

    if (tokens.length === 0) {
      return [];
    }

    // Cada palabra debe aparecer (AND) en los nombres, apellidos o ubicación,
    // sin importar el orden en que se escriban.
    const busqueda = this.filtrarPorTokens(
      tokens,
      `CONCAT_WS(' ', COALESCE(n.nombres, ''), COALESCE(n.apellido_paterno, ''), COALESCE(n.apellido_materno, ''), COALESCE(n.apellido_difunto, ''), COALESCE(n.nombre_difunto, ''), COALESCE(p.codigo_lote, ''), COALESCE(n.sector_camposanto, ''))`,
    );

    const resultados: Array<{
      id: string;
      predio_id: string;
      codigo_lote: string;
      fila: number;
      columna: number;
      estado: string;
      nombres: string | null;
      apellido_paterno: string | null;
      apellido_materno: string | null;
      nombre_difunto: string | null;
      apellido_difunto: string | null;
      solicitante: string | null;
      resolucion: string | null;
      tipo_espacio: string | null;
      plazo_anios: number | string | null;
      es_perpetuo: boolean | null;
      fecha_defuncion: string | null;
      fecha_vencimiento: string | null;
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
         n.nombres,
         n.apellido_paterno,
         n.apellido_materno,
         n.nombre_difunto,
         n.apellido_difunto,
         n.solicitante,
         n.resolucion,
         n.tipo_espacio,
         n.plazo_anios,
         n.es_perpetuo,
         n.fecha_defuncion,
         n.fecha_vencimiento,
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
       WHERE ${busqueda.sql}
       ORDER BY n.apellido_difunto NULLS LAST, n.fila, n.columna
       LIMIT 50`,
      busqueda.params,
    );

    return resultados.map((r) => ({
      id: r.id,
      predio_id: r.predio_id,
      codigo_lote: r.codigo_lote,
      fila: Number(r.fila),
      columna: Number(r.columna),
      estado: r.estado,
      nombre_difunto: this.formatearNombreDifunto(r),
      apellido_difunto: null,
      solicitante: r.solicitante,
      resolucion: r.resolucion,
      tipo_espacio: r.tipo_espacio ?? 'Nicho',
      plazo_anios: r.plazo_anios === null ? null : Number(r.plazo_anios),
      es_perpetuo: r.es_perpetuo === true,
      fecha_defuncion: this.normalizarFecha(r.fecha_defuncion),
      fecha_vencimiento: this.normalizarFecha(r.fecha_vencimiento),
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
    if (datos.fecha_defuncion !== undefined) {
      nicho.fecha_defuncion = this.normalizarFecha(datos.fecha_defuncion);
    }
    if (nicho.fecha_defuncion) {
      // El año siempre se extrae de la fecha completa cuando existe.
      nicho.anio_defuncion =
        this.anioDeFecha(nicho.fecha_defuncion) ?? nicho.anio_defuncion;
    } else if (datos.anio_defuncion !== undefined) {
      nicho.anio_defuncion = datos.anio_defuncion ?? null;
    }
    if (datos.fecha_vencimiento !== undefined) {
      nicho.fecha_vencimiento = this.normalizarFecha(datos.fecha_vencimiento);
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

    if (nicho.es_perpetuo) {
      // Un contrato perpetuo no conserva plazo ni vencimiento.
      nicho.plazo_anios = null;
      nicho.fecha_vencimiento = null;
    } else {
      // La Resolución Administrativa (RA.) es exclusiva de perpetuos.
      nicho.resolucion = null;
      // Vencimiento completo con el mismo día y mes del entierro.
      if (
        datos.fecha_vencimiento === undefined &&
        nicho.fecha_defuncion &&
        nicho.plazo_anios !== null
      ) {
        nicho.fecha_vencimiento = this.sumarAnios(
          nicho.fecha_defuncion,
          nicho.plazo_anios,
        );
      }
    }

    const apellidoPaterno = (nicho.apellido_paterno ?? '').trim();
    const apellidoMaterno = (nicho.apellido_materno ?? '').trim();
    nicho.apellido_difunto = `${apellidoPaterno} ${apellidoMaterno}`.trim() || null;
    nicho.nombre_difunto = (nicho.nombres ?? '').trim() || null;
    nicho.anio_vencimiento = nicho.es_perpetuo
      ? null
      : (this.anioDeFecha(nicho.fecha_vencimiento) ??
        this.calcularAnioVencimiento(nicho));

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
    nicho.fecha_defuncion = this.normalizarFecha(datos.fecha_defuncion);
    nicho.anio_defuncion =
      this.anioDeFecha(nicho.fecha_defuncion) ?? (datos.anio_defuncion ?? null);
    nicho.solicitante = this.limpiarTexto(datos.solicitante);
    nicho.telefono_solicitante = this.limpiarTexto(datos.telefono_solicitante);
    nicho.sector_camposanto = this.limpiarTexto(datos.sector_camposanto);
    nicho.observaciones = this.limpiarTexto(datos.observaciones);
    nicho.tipo_espacio = 'Camposanto';
    nicho.estado = datos.estado ?? 'Ocupado';
    nicho.es_perpetuo = datos.es_perpetuo === true;
    nicho.plazo_anios = nicho.es_perpetuo ? null : (datos.plazo_anios ?? null);
    nicho.monto_contrato_bs = datos.monto_contrato_bs ?? null;
    // La RA. solo corresponde a perpetuos; el vencimiento se calcula a partir
    // de la fecha de entierro conservando el día y el mes.
    nicho.resolucion = nicho.es_perpetuo
      ? this.limpiarTexto(datos.resolucion)
      : null;
    nicho.fecha_vencimiento = nicho.es_perpetuo
      ? null
      : (this.normalizarFecha(datos.fecha_vencimiento) ??
        (nicho.fecha_defuncion && nicho.plazo_anios !== null
          ? this.sumarAnios(nicho.fecha_defuncion, nicho.plazo_anios)
          : null));
    nicho.anio_vencimiento =
      this.anioDeFecha(nicho.fecha_vencimiento) ??
      this.calcularAnioVencimiento(nicho);

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

  /**
   * Alertas de vencimiento, mora y control de contratos.
   * Clasifica los registros activos (Ocupado / Mora) según la gestión actual:
   * - critico: estado Mora, o contrato temporal ya vencido.
   * - advertencia: contrato temporal que vence este año o el próximo.
   * - info: contrato perpetuo (control de mantenimiento anual).
   */
  async obtenerAlertas() {
    const anioActual = new Date().getFullYear();

    const registros: Array<{
      id: string;
      estado: string;
      es_perpetuo: boolean | null;
      anio_defuncion: number | string | null;
      fecha_defuncion: string | null;
      fecha_vencimiento: string | null;
      anio_vencimiento: number | string | null;
      tipo_espacio: string | null;
      nombres: string | null;
      apellido_paterno: string | null;
      apellido_materno: string | null;
      nombre_difunto: string | null;
      apellido_difunto: string | null;
      solicitante: string | null;
      telefono_solicitante: string | null;
      sector_camposanto: string | null;
      fila: number | string;
      columna: number | string;
      codigo_lote: string | null;
    }> = await this.nichoRepository.query(
      `SELECT n.id,
              n.estado,
              n.es_perpetuo,
              n.anio_defuncion,
              n.fecha_defuncion,
              n.fecha_vencimiento,
              n.anio_vencimiento,
              n.tipo_espacio,
              n.nombres,
              n.apellido_paterno,
              n.apellido_materno,
              n.nombre_difunto,
              n.apellido_difunto,
              n.solicitante,
              n.telefono_solicitante,
              n.sector_camposanto,
              n.fila,
              n.columna,
              p.codigo_lote
         FROM nichos n
         INNER JOIN predio_nicho p ON p.id = n.predio_id
        WHERE n.estado IN ('Ocupado', 'Mora')
        ORDER BY n.apellido_difunto NULLS LAST, n.fila, n.columna`,
    );

    const prioridad: Record<string, number> = {
      critico: 0,
      advertencia: 1,
      info: 2,
    };

    const alertas = registros.flatMap((registro) => {
      const anioVencimiento =
        registro.anio_vencimiento === null ||
        registro.anio_vencimiento === undefined
          ? null
          : Number(registro.anio_vencimiento);
      const esPerpetuo = registro.es_perpetuo === true;
      const esTemporal = !esPerpetuo;
      const enMora = registro.estado === 'Mora';
      const vencido =
        esTemporal &&
        anioVencimiento !== null &&
        anioVencimiento < anioActual;
      const porVencer =
        esTemporal &&
        anioVencimiento !== null &&
        (anioVencimiento === anioActual ||
          anioVencimiento === anioActual + 1);

      let nivel: 'critico' | 'advertencia' | 'info' | null = null;
      let motivo = '';

      if (enMora || vencido) {
        nivel = 'critico';
        if (enMora && vencido) {
          motivo = `Cuenta en mora y contrato vencido en ${anioVencimiento}`;
        } else if (enMora) {
          motivo = 'Estado Mora — mantenimiento pendiente de pago';
        } else {
          motivo = `Contrato vencido desde el año ${anioVencimiento}`;
        }
      } else if (porVencer) {
        nivel = 'advertencia';
        motivo =
          anioVencimiento === anioActual
            ? `Vence este año (${anioVencimiento})`
            : `Vence el próximo año (${anioVencimiento})`;
      } else if (esPerpetuo) {
        nivel = 'info';
        motivo = 'Mantenimiento anual de contrato perpetuo';
      }

      if (!nivel) {
        return [];
      }

      const sector =
        registro.sector_camposanto || registro.codigo_lote || 'S/N';
      const etiqueta =
        registro.tipo_espacio === 'Camposanto' ? 'Camposanto' : 'Bloque';
      const difunto =
        this.formatearNombreDifunto(registro) || 'Sin difunto registrado';

      return [
        {
          id: registro.id,
          nivel,
          motivo,
          difunto,
          solicitante: registro.solicitante ?? null,
          telefono_solicitante: registro.telefono_solicitante ?? null,
          tipo_espacio: registro.tipo_espacio ?? 'Nicho',
          ubicacion: `${etiqueta} ${sector} - Fila ${Number(
            registro.fila,
          )}, Columna ${Number(registro.columna)}`,
          codigo_lote: registro.codigo_lote ?? null,
          sector_camposanto: registro.sector_camposanto ?? null,
          fila: Number(registro.fila),
          columna: Number(registro.columna),
          fecha_defuncion: this.formatearFecha(
            registro.fecha_defuncion,
            registro.anio_defuncion,
          ),
          fecha_vencimiento: this.formatearFecha(
            registro.fecha_vencimiento,
            anioVencimiento,
          ),
          anio_vencimiento: anioVencimiento,
          es_perpetuo: esPerpetuo,
          estado: registro.estado,
        },
      ];
    });

    alertas.sort((a, b) => prioridad[a.nivel] - prioridad[b.nivel]);

    return {
      anio_actual: anioActual,
      totalCriticos: alertas.filter((alerta) => alerta.nivel === 'critico')
        .length,
      totalAdvertencias: alertas.filter(
        (alerta) => alerta.nivel === 'advertencia',
      ).length,
      totalPerpetuos: alertas.filter((alerta) => alerta.nivel === 'info')
        .length,
      totalAlertas: alertas.length,
      alertas,
    };
  }

  /**
   * Consulta ciudadana pública (estilo RUAT). Busca por apellidos, nombres o
   * código de bloque/lote y devuelve únicamente datos de consulta: difunto,
   * tipo de espacio, ubicación, régimen, estado y centroide del predio.
   * Nunca expone teléfono, resolución, montos ni el nombre del titular.
   */
  async consultarPublico(texto: string) {
    const termino = (texto ?? '').trim();

    if (termino.length < 3) {
      throw new BadRequestException(
        'Debe indicar al menos 3 caracteres para la consulta.',
      );
    }

    const tokens = this.extraerTokens(termino);
    const busqueda = this.filtrarPorTokens(
      tokens,
      `CONCAT_WS(' ', COALESCE(n.nombres, ''), COALESCE(n.apellido_paterno, ''), COALESCE(n.apellido_materno, ''), COALESCE(n.apellido_difunto, ''), COALESCE(n.nombre_difunto, ''), COALESCE(p.codigo_lote, ''), COALESCE(n.sector_camposanto, ''))`,
    );

    const registros: Array<{
      nombres: string | null;
      apellido_paterno: string | null;
      apellido_materno: string | null;
      nombre_difunto: string | null;
      apellido_difunto: string | null;
      solicitante: string | null;
      tipo_espacio: string | null;
      estado: string;
      es_perpetuo: boolean | null;
      anio_defuncion: number | string | null;
      fecha_defuncion: string | null;
      fecha_vencimiento: string | null;
      anio_vencimiento: number | string | null;
      sector_camposanto: string | null;
      fila: number | string;
      columna: number | string;
      codigo_lote: string | null;
      centroide: unknown;
    }> = await this.nichoRepository.query(
      `SELECT n.nombres,
              n.apellido_paterno,
              n.apellido_materno,
              n.nombre_difunto,
              n.apellido_difunto,
              n.solicitante,
              n.tipo_espacio,
              n.estado,
              n.es_perpetuo,
              n.anio_defuncion,
              n.fecha_defuncion,
              n.fecha_vencimiento,
              n.anio_vencimiento,
              n.sector_camposanto,
              n.fila,
              n.columna,
              p.codigo_lote,
              ST_AsGeoJSON(ST_Centroid(p.poligono))::json AS centroide
         FROM nichos n
         INNER JOIN predio_nicho p ON p.id = n.predio_id
        WHERE n.estado <> 'Libre'
          AND ${busqueda.sql}
        ORDER BY n.apellido_difunto NULLS LAST, p.codigo_lote, n.fila, n.columna
        LIMIT 25`,
      busqueda.params,
    );

    const resultados = registros.map((registro) => {
      const anioVencimiento =
        registro.anio_vencimiento === null ||
        registro.anio_vencimiento === undefined
          ? null
          : Number(registro.anio_vencimiento);
      const esPerpetuo = registro.es_perpetuo === true;
      const vencimientoTexto = this.formatearFecha(
        registro.fecha_vencimiento,
        anioVencimiento,
      );

      const regimen = esPerpetuo
        ? 'Perpetuo'
        : vencimientoTexto
          ? `Temporal hasta ${vencimientoTexto}`
          : 'Temporal';

      // El estado interno "Libre" no se publica; solo se informa deuda o
      // vigencia de los espacios ocupados.
      const estadoCiudadano =
        registro.estado === 'Mora'
          ? 'Con deuda pendiente - Apersonarse a Recaudaciones'
          : registro.estado === 'Libre'
            ? null
            : 'Vigente / Al día';

      return {
        difunto:
          this.formatearNombreDifunto(registro) || 'Sin difunto registrado',
        tipo_espacio: registro.tipo_espacio ?? 'Nicho',
        bloque_sector:
          registro.sector_camposanto || registro.codigo_lote || 'S/N',
        fila: Number(registro.fila),
        columna: Number(registro.columna),
        fecha_defuncion: this.formatearFecha(
          registro.fecha_defuncion,
          registro.anio_defuncion,
        ),
        fecha_vencimiento: esPerpetuo ? null : vencimientoTexto,
        regimen,
        estado_ciudadano: estadoCiudadano,
        // Solo iniciales del titular como referencia, nunca su nombre completo.
        titular_referencia: this.referenciaTitular(registro.solicitante),
        centroide: this.parsearCentroide(registro.centroide),
      };
    });

    return {
      consulta: termino,
      total: resultados.length,
      resultados,
    };
  }

  /** Texto recortado; los campos vacíos se guardan como null. */
  private limpiarTexto(valor?: string | null): string | null {
    const texto = (valor ?? '').trim();
    return texto.length > 0 ? texto : null;
  }

  /** Fecha ISO válida (YYYY-MM-DD) o null; descarta valores incompletos. */
  private normalizarFecha(valor?: string | null): string | null {
    const texto = (valor ?? '').trim();
    const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);

    if (!partes) {
      return null;
    }

    const [, anio, mes, dia] = partes;
    const fecha = new Date(
      Date.UTC(Number(anio), Number(mes) - 1, Number(dia)),
    );

    if (
      fecha.getUTCFullYear() !== Number(anio) ||
      fecha.getUTCMonth() !== Number(mes) - 1 ||
      fecha.getUTCDate() !== Number(dia)
    ) {
      return null;
    }

    return `${anio}-${mes}-${dia}`;
  }

  /** Año (YYYY) extraído de una fecha ISO o null. */
  private anioDeFecha(fecha?: string | null): number | null {
    const normalizada = this.normalizarFecha(fecha);

    if (!normalizada) {
      return null;
    }

    const anio = Number(normalizada.slice(0, 4));
    return Number.isFinite(anio) ? anio : null;
  }

  /**
   * Suma años a una fecha ISO conservando el mismo día y mes (ajusta el 29 de
   * febrero a fin de mes cuando el año destino no es bisiesto).
   */
  private sumarAnios(fecha: string, anios: number): string | null {
    const normalizada = this.normalizarFecha(fecha);
    const plazo = Math.trunc(Number(anios));

    if (!normalizada || !Number.isFinite(plazo) || plazo < 1) {
      return null;
    }

    const [anio, mes, dia] = normalizada.split('-').map(Number);
    const anioDestino = anio + plazo;
    const ultimoDia = new Date(Date.UTC(anioDestino, mes, 0)).getUTCDate();
    const diaDestino = Math.min(dia, ultimoDia);

    return `${anioDestino}-${String(mes).padStart(2, '0')}-${String(
      diaDestino,
    ).padStart(2, '0')}`;
  }

  /**
   * Fecha para mostrar: DD/MM/YYYY si hay fecha completa o el año YYYY de los
   * registros históricos que solo guardaron el año.
   */
  private formatearFecha(
    fecha?: string | null,
    anio?: number | string | null,
  ): string | null {
    const normalizada = this.normalizarFecha(fecha);

    if (normalizada) {
      const [anioFecha, mes, dia] = normalizada.split('-');
      return `${dia}/${mes}/${anioFecha}`;
    }

    if (anio === null || anio === undefined || anio === '') {
      return null;
    }

    const numero = Number(anio);
    return Number.isFinite(numero) ? String(Math.trunc(numero)) : null;
  }

  /** Unifica espacios repetidos y recorta los extremos. */
  private normalizarEspacios(valor?: string | null): string {
    return (valor ?? '').replace(/\s+/g, ' ').trim();
  }

  /** Texto sin tildes ni diacríticos para comparar nombres. */
  private sinTildes(texto: string): string {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /** Palabras válidas de la búsqueda (mínimo 2 caracteres cada una). */
  private extraerTokens(texto: string): string[] {
    return this.normalizarEspacios(texto)
      .split(' ')
      .filter((token) => token.length >= 2);
  }

  /**
   * Condición SQL que exige que todas las palabras aparezcan (AND) en la
   * concatenación indicada, con parámetros numerados desde $1.
   */
  private filtrarPorTokens(
    tokens: string[],
    columnas: string,
  ): { sql: string; params: string[] } {
    const condiciones = tokens.map(
      (_, indice) => `${columnas} ILIKE $${indice + 1}`,
    );

    return {
      sql: `(${condiciones.join(' AND ')})`,
      params: tokens.map((token) => `%${token}%`),
    };
  }

  /**
   * Nombre completo del difunto sin apellidos repetidos. Si `nombres` ya
   * incluye el apellido paterno o materno (por ejemplo "FERMINA VELIZ MAMANI")
   * no se vuelven a concatenar. Devuelve '' si no hay datos.
   */
  private formatearNombreDifunto(registro: {
    nombres?: string | null;
    apellido_paterno?: string | null;
    apellido_materno?: string | null;
    nombre_difunto?: string | null;
    apellido_difunto?: string | null;
  }): string {
    const nombres =
      this.normalizarEspacios(registro.nombres) ||
      this.normalizarEspacios(registro.nombre_difunto);
    const paterno = this.normalizarEspacios(registro.apellido_paterno);
    const materno = this.normalizarEspacios(registro.apellido_materno);
    const apellidos =
      this.normalizarEspacios(`${paterno} ${materno}`) ||
      this.normalizarEspacios(registro.apellido_difunto);

    if (!nombres) {
      return apellidos;
    }
    if (!apellidos) {
      return nombres;
    }

    const nombresPlano = this.sinTildes(nombres).toLowerCase();
    const faltantes = apellidos
      .split(' ')
      .filter(
        (apellido) =>
          !nombresPlano.includes(this.sinTildes(apellido).toLowerCase()),
      );

    return this.normalizarEspacios([nombres, ...faltantes].join(' '));
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

  /** Iniciales del titular: referencia útil sin exponer su nombre completo. */
  private referenciaTitular(solicitante?: string | null): string | null {
    const partes = (solicitante ?? '').trim().split(/\s+/).filter(Boolean);

    if (partes.length === 0) {
      return null;
    }

    return partes
      .map((parte) => `${parte.charAt(0).toUpperCase()}.`)
      .join(' ');
  }

  /** Normaliza el centroide devuelto por PostGIS (objeto o cadena JSON). */
  private parsearCentroide(
    valor: unknown,
  ): { type: string; coordinates: number[] } | null {
    if (valor === null || valor === undefined) {
      return null;
    }

    if (typeof valor === 'string') {
      try {
        return JSON.parse(valor) as { type: string; coordinates: number[] };
      } catch {
        return null;
      }
    }

    return valor as { type: string; coordinates: number[] };
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
      nombre_difunto: this.formatearNombreDifunto(nicho) || null,
      apellido_difunto: null,
      anio_defuncion: nicho.anio_defuncion ?? null,
      fecha_defuncion: nicho.fecha_defuncion ?? null,
      fecha_vencimiento: nicho.fecha_vencimiento ?? null,
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
