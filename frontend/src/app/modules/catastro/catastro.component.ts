import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Observable,
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  merge,
  of,
  switchMap,
  takeUntil,
} from 'rxjs';
import * as L from 'leaflet';

const API_URL = 'http://localhost:3000';

/** Perímetro general del cementerio extraído de Datos/cementerio_vinto.geojson. */
const PERIMETRO_URL = 'assets/cementerio_perimetro.geojson';

/** Paleta de la máscara exterior: oscurece todo lo que queda fuera del cementerio. */
const MASCARA_COLOR = '#0f172a';

/** Suma años a una fecha ISO conservando el mismo día y mes. */
function sumarAniosFecha(fecha: string, anios: number): string | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec((fecha ?? '').trim());
  const plazo = Math.trunc(Number(anios));

  if (!partes || !Number.isFinite(plazo) || plazo < 1) {
    return null;
  }

  const anio = Number(partes[1]) + plazo;
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const ultimoDia = new Date(anio, mes, 0).getDate();
  const diaDestino = Math.min(dia, ultimoDia);

  return `${anio}-${String(mes).padStart(2, '0')}-${String(
    diaDestino,
  ).padStart(2, '0')}`;
}

/** DD/MM/YYYY para mostrar en pantalla. */
function formatearFechaCorta(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

type EstadoNicho = 'Libre' | 'Ocupado' | 'Mora';

interface Nicho {
  id: string;
  predio_id: string;
  fila: number;
  columna: number;
  nombre_difunto: string | null;
  apellido_difunto: string | null;
  solicitante: string | null;
  resolucion: string | null;
  estado: EstadoNicho;
  tipo_espacio: 'Nicho' | 'Mausoleo' | 'Camposanto' | null;
  plazo_anios: number | null;
  es_perpetuo: boolean;
  anio_vencimiento: number | null;
  fecha_defuncion?: string | null;
  fecha_vencimiento?: string | null;
  monto_contrato_bs: number | null;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  nombres?: string | null;
  anio_defuncion?: number | null;
  telefono_solicitante?: string | null;
  sector_camposanto?: string | null;
  observaciones?: string | null;
}

/** Datos editables de una celda desde el geovisor. */
interface FormularioNicho {
  apellido_paterno: string;
  apellido_materno: string;
  nombres: string;
  fecha_defuncion: string;
  solicitante: string;
  telefono_solicitante: string;
  resolucion: string;
  tipo_espacio: 'Nicho' | 'Mausoleo' | 'Camposanto';
  estado: EstadoNicho;
  es_perpetuo: boolean;
  plazo_anios: number | null;
  monto_contrato_bs: number | null;
  sector_camposanto: string;
  observaciones: string;
}

/** Datos del bloque/mausoleo dibujado sobre el mapa. */
interface FormularioBloque {
  codigo_lote: string;
  filas: number;
  columnas: number;
  tipo_espacio_default: 'Nicho' | 'Mausoleo';
}

interface PanelBloque {
  bloque: { id: string; codigo_lote: string };
  filas: number[];
  columnas: number[];
  nichos: Nicho[];
}

interface ResultadoBusqueda extends Nicho {
  codigo_lote: string;
  centro: { lat: number; lng: number };
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number };
}

interface FilaMatriz {
  fila: number;
  celdas: Array<Nicho | null>;
}

@Component({
  selector: 'app-catastro',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './catastro.component.html',
  styleUrl: './catastro.component.css',
})
export class CatastroComponent implements AfterViewInit, OnDestroy {
  private map!: L.Map;
  private capaBloques?: L.GeoJSON;

  // Estilos cartográficos de los bloques
  private readonly ESTILO_BLOQUE: L.PathOptions = {
    color: '#38bdf8',
    weight: 2,
    fillColor: '#0284c7',
    fillOpacity: 0.28,
  };

  private readonly ESTILO_BLOQUE_RESALTADO: L.PathOptions = {
    color: '#facc15',
    weight: 3,
    fillColor: '#0284c7',
    fillOpacity: 0.45,
  };

  private predioSeleccionado = '';

  // Buscador reactivo: lo que se escribe y lo que dispara el botón "Buscar"
  private readonly termino$ = new Subject<string>();
  private readonly busquedaManual$ = new Subject<string>();
  private readonly destruir$ = new Subject<void>();

  // Panel tipo Excel
  panelAbierto = false;
  panel: PanelBloque | null = null;
  matriz: FilaMatriz[] = [];
  cargandoPanel = false;
  errorPanel = '';
  celdaSeleccionada: Nicho | null = null;
  nichoResaltado: { fila: number; columna: number } | null = null;

  // Modal de edición de cualquier registro (nichos, mausoleos, camposantos)
  modalEdicionAbierto = false;
  formularioNicho: FormularioNicho = this.formularioNichoVacio();
  guardandoEdicion = false;
  errorEdicion = '';

  // Dibujo de un nuevo bloque/mausoleo sobre el mapa
  modoDibujo = false;
  puntosDibujo: L.LatLng[] = [];
  modalBloqueAbierto = false;
  formularioBloque: FormularioBloque = this.formularioBloqueVacio();
  guardandoBloque = false;
  errorBloque = '';
  private capaDibujo?: L.LayerGroup;

  // Arrastre de la ventana flotante dentro del contenedor del mapa
  arrastrando = false;
  panelPosicion: { left: number; top: number } | null = null;
  private arrastreOffset = { x: 0, y: 0 };
  private contenedorArrastre: HTMLElement | null = null;
  private panelArrastre: HTMLElement | null = null;

  // Buscador
  terminoBusqueda = '';
  resultados: ResultadoBusqueda[] = [];
  buscando = false;
  errorBusqueda = '';
  busquedaRealizada = false;

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {
    // Búsqueda instantánea: 250 ms después de la última tecla y solo si el
    // término cambió. switchMap descarta respuestas obsoletas de consultas
    // anteriores. El botón "Buscar" consulta de inmediato (sin espera).
    merge(
      this.termino$.pipe(debounceTime(250), distinctUntilChanged()),
      this.busquedaManual$,
    )
      .pipe(
        switchMap((termino) => this.consultarDifuntos(termino)),
        takeUntil(this.destruir$),
      )
      .subscribe((data) => {
        if (!data) {
          return;
        }
        this.resultados = data;
        this.buscando = false;
        this.busquedaRealizada = true;
      });
  }

  ngAfterViewInit(): void {
    this.iniciarMapa();
    this.cargarCementerio();
    this.abrirDesdeQueryParams();
  }

  ngOnDestroy(): void {
    this.destruir$.next();
    this.destruir$.complete();
  }

  private iniciarMapa(): void {
    // Inicializamos el mapa centrado en el cementerio con restricciones de zoom
    this.map = L.map('mapa-catastro', {
      minZoom: 17, // Mantiene el cementerio siempre a la vista
      maxZoom: 20, // Permite acercarse lo suficiente como para leer los bloques
    }).setView([-17.408, -66.3055], 19);

    // Paneles: la máscara va sobre el satélite y bajo los bloques; el borde
    // del perímetro va por encima de los bloques para que siempre se lea.
    this.map.createPane('mascara-exterior');
    this.map.getPane('mascara-exterior')!.style.zIndex = '350';
    this.map.createPane('perimetro-borde');
    this.map.getPane('perimetro-borde')!.style.zIndex = '420';

    // Capa Satelital de Alta Resolución (ESRI). En Vinto solo existen baldosas
    // reales hasta el zoom 18, así que maxNativeZoom las escala hasta el 21
    // en lugar de mostrar cuadros grises al acercarse.
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxNativeZoom: 18,
        maxZoom: 21,
        attribution:
          'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      },
    ).addTo(this.map);

    // Un clic en el mapa agrega un vértice en modo dibujo; si no, oculta el panel
    this.map.on('click', (evento: L.LeafletMouseEvent) => {
      if (this.modoDibujo) {
        this.agregarVertice(evento.latlng);
        return;
      }
      this.cerrarPanel();
    });
  }

  /**
   * Dibuja el perímetro del cementerio, la máscara exterior y los bloques.
   * Después encuadra el mapa con un fitBounds estricto sobre los bloques y
   * limita la navegación al entorno del cementerio (maxBounds).
   */
  private cargarCementerio(): void {
    forkJoin({
      perimetro: this.http.get<any>(PERIMETRO_URL),
      mapa: this.http.get<any>(`${API_URL}/catastro/mapa`),
    }).subscribe({
      next: ({ perimetro, mapa }) => {
        const anilloPerimetro = this.dibujarPerimetroYMascara(perimetro);
        this.dibujarBloques(mapa);

        // Encuadre estricto sobre los bloques del cementerio
        const bounds = this.capaBloques?.getBounds();
        if (bounds?.isValid()) {
          this.map.fitBounds(bounds, { padding: [15, 15], maxZoom: 20 });

          // Evita que el usuario se aleje navegando por el resto de la ciudad
          this.map.setMaxBounds(bounds.pad(0.75));
        } else if (anilloPerimetro?.isValid()) {
          this.map.fitBounds(anilloPerimetro, { padding: [15, 15], maxZoom: 20 });
          this.map.setMaxBounds(anilloPerimetro.pad(0.75));
        }

        // Si se llegó desde el registro, deja el bloque registrado a la vista
        if (this.predioSeleccionado) {
          this.enfocarBloque(this.predioSeleccionado);
        }
      },
      error: (err) =>
        console.error('Error al cargar el cementerio:', err),
    });
  }

  /**
   * Borde amarillo/blanco del perímetro general y polígono mundial con hueco
   * en dicho perímetro para oscurecer todo lo que queda fuera del cementerio.
   * Devuelve los límites del perímetro para usarlos como encuadre de respaldo.
   */
  private dibujarPerimetroYMascara(geojson: any): L.LatLngBounds {
    const feature = geojson?.features?.[0];
    const anillo: number[][] = feature?.geometry?.coordinates?.[0] ?? [];
    const hueco = anillo.map(([lng, lat]) => L.latLng(lat, lng));
    const limites = L.latLngBounds(hueco);

    if (hueco.length < 3) {
      return limites;
    }

    // Máscara mundial con hueco: solo el cementerio queda iluminado
    const mundo = [
      L.latLng(85, -180),
      L.latLng(85, 180),
      L.latLng(-85, 180),
      L.latLng(-85, -180),
    ];

    L.polygon([mundo, hueco], {
      pane: 'mascara-exterior',
      color: MASCARA_COLOR,
      weight: 0,
      fillColor: MASCARA_COLOR,
      fillOpacity: 0.35,
      interactive: false,
    }).addTo(this.map);

    // Contorno técnico: halo oscuro + línea blanca discontinua, sin relleno
    L.polygon(hueco, {
      pane: 'perimetro-borde',
      color: MASCARA_COLOR,
      weight: 5,
      opacity: 0.5,
      fill: false,
      interactive: false,
    }).addTo(this.map);

    L.polygon(hueco, {
      pane: 'perimetro-borde',
      color: '#ffffff',
      weight: 2.5,
      opacity: 1,
      dashArray: '8, 6',
      fill: false,
      interactive: false,
    }).addTo(this.map);

    return limites;
  }

  /**
   * Abre el bloque y resalta el nicho indicado por queryParams, para que al
   * volver del registro de difuntos se vea el nicho recién pintado.
   */
  private abrirDesdeQueryParams(): void {
    this.route.queryParamMap
      .pipe(takeUntil(this.destruir$))
      .subscribe((params) => {
        const predioId = params.get('predioId');
        if (!predioId) {
          return;
        }

        const fila = Number(params.get('fila'));
        const columna = Number(params.get('columna'));
        const resaltado =
          fila > 0 && columna > 0 ? { fila, columna } : undefined;

        this.abrirBloque(predioId, resaltado);
        this.enfocarBloque(predioId);
      });
  }

  /** Centra el mapa en el bloque indicado si ya está dibujado. */
  private enfocarBloque(predioId: string): void {
    const capas = this.capaBloques?.getLayers() ?? [];
    const capa = capas.find(
      (layer) => (layer as any)?.feature?.properties?.id === predioId,
    ) as L.Polygon | undefined;
    const bounds = capa?.getBounds();

    if (bounds?.isValid()) {
      this.map.flyToBounds(bounds, {
        padding: [40, 40],
        maxZoom: 20,
        duration: 0.8,
      });
    }
  }

  /**
   * Pinta los bloques con el azul institucional, que contrasta con la
   * vegetación del satélite, y los resalta en amarillo al pasar el mouse
   * o cuando su panel está abierto.
   */
  private dibujarBloques(geojsonData: any): void {
    this.capaBloques?.remove();

    this.capaBloques = L.geoJSON(geojsonData, {
      style: () => ({ ...this.ESTILO_BLOQUE }),
      onEachFeature: (feature, layer) => {
        const properties = feature.properties ?? {};
        const capa = layer as L.Path;

        layer.bindTooltip(
          `<b>${properties.codigo_lote ?? 'Bloque'}</b><br><small>Haz clic para ver los nichos</small>`,
          { sticky: true },
        );

        layer.on('mouseover', () => {
          capa.setStyle(this.ESTILO_BLOQUE_RESALTADO);
        });

        layer.on('mouseout', () => {
          capa.setStyle(
            this.predioSeleccionado === properties.id
              ? this.ESTILO_BLOQUE_RESALTADO
              : this.ESTILO_BLOQUE,
          );
        });

        layer.on('click', (evento: L.LeafletMouseEvent) => {
          // Evita que el clic llegue al mapa y cierre el panel recién abierto
          L.DomEvent.stopPropagation(evento);
          this.abrirBloque(properties.id);
        });
      },
    }).addTo(this.map);
  }

  /** Reaplica el resaltado amarillo solo al bloque actualmente seleccionado. */
  private actualizarResaltadoBloques(): void {
    this.capaBloques?.eachLayer((layer) => {
      const id = (layer as any)?.feature?.properties?.id;
      (layer as L.Path).setStyle(
        id && id === this.predioSeleccionado
          ? this.ESTILO_BLOQUE_RESALTADO
          : this.ESTILO_BLOQUE,
      );
    });
  }

  /** Consulta los nichos de un bloque y abre la cuadrícula tipo Excel. */
  abrirBloque(
    predioId: string,
    resaltado?: { fila: number; columna: number },
  ): void {
    this.predioSeleccionado = predioId;
    this.actualizarResaltadoBloques();
    this.panelAbierto = true;
    this.cargandoPanel = true;
    this.errorPanel = '';
    this.celdaSeleccionada = null;
    this.nichoResaltado = resaltado ?? null;

    this.http
      .get<PanelBloque>(`${API_URL}/catastro/bloque/${predioId}/nichos`)
      .subscribe({
        next: (data) => {
          this.panel = data;
          this.matriz = data.filas.map((fila) => ({
            fila,
            celdas: data.columnas.map(
              (columna) =>
                data.nichos.find(
                  (nicho) =>
                    nicho.fila === fila && nicho.columna === columna,
                ) ?? null,
            ),
          }));

          if (resaltado) {
            this.celdaSeleccionada =
              data.nichos.find(
                (nicho) =>
                  nicho.fila === resaltado.fila &&
                  nicho.columna === resaltado.columna,
              ) ?? null;
          }

          this.cargandoPanel = false;
        },
        error: (err) => {
          console.error('Error al obtener los nichos del bloque:', err);
          this.errorPanel =
            'No se pudieron cargar los nichos de este bloque. Verifique la conexión con el servidor.';
          this.cargandoPanel = false;
        },
      });
  }

  /** Oculta limpiamente la ventana flotante y sus resaltados. */
  cerrarPanel(): void {
    this.predioSeleccionado = '';
    this.actualizarResaltadoBloques();
    this.panelAbierto = false;
    this.panel = null;
    this.matriz = [];
    this.celdaSeleccionada = null;
    this.nichoResaltado = null;
    this.errorPanel = '';
    this.cargandoPanel = false;
  }

  /** Inicia el arrastre de la ventana flotante desde su barra de título. */
  iniciarArrastre(evento: PointerEvent): void {
    if (evento.button !== 0) {
      return;
    }

    const cabecera = evento.currentTarget as HTMLElement;
    if ((evento.target as HTMLElement)?.closest('button')) {
      return;
    }

    const panel = cabecera.closest('.panel-nichos') as HTMLElement | null;
    const contenedor = cabecera.closest('.map-container') as HTMLElement | null;
    if (!panel || !contenedor) {
      return;
    }

    // El arrastre no debe llegar al mapa de Leaflet
    evento.preventDefault();
    evento.stopPropagation();

    const panelRect = panel.getBoundingClientRect();
    const contenedorRect = contenedor.getBoundingClientRect();

    this.panelPosicion = {
      left: panelRect.left - contenedorRect.left,
      top: panelRect.top - contenedorRect.top,
    };
    this.arrastreOffset = {
      x: evento.clientX - panelRect.left,
      y: evento.clientY - panelRect.top,
    };
    this.contenedorArrastre = contenedor;
    this.panelArrastre = panel;
    this.arrastrando = true;
    cabecera.setPointerCapture?.(evento.pointerId);
  }

  /** Mueve la ventana flotante, manteniéndola dentro del contenedor. */
  moverArrastre(evento: PointerEvent): void {
    if (
      !this.arrastrando ||
      !this.panelPosicion ||
      !this.contenedorArrastre ||
      !this.panelArrastre
    ) {
      return;
    }

    evento.preventDefault();
    evento.stopPropagation();

    const contenedorRect = this.contenedorArrastre.getBoundingClientRect();
    const panelRect = this.panelArrastre.getBoundingClientRect();
    const maxLeft = Math.max(0, contenedorRect.width - panelRect.width);
    const maxTop = Math.max(0, contenedorRect.height - panelRect.height);

    const left = Math.min(
      Math.max(
        0,
        evento.clientX - contenedorRect.left - this.arrastreOffset.x,
      ),
      maxLeft,
    );
    const top = Math.min(
      Math.max(
        0,
        evento.clientY - contenedorRect.top - this.arrastreOffset.y,
      ),
      maxTop,
    );

    this.panelPosicion = { left, top };
  }

  /** Suelta el puntero y deja la ventana en su nueva posición. */
  terminarArrastre(evento: PointerEvent): void {
    if (!this.arrastrando) {
      return;
    }

    evento.stopPropagation();
    (evento.currentTarget as HTMLElement).releasePointerCapture?.(
      evento.pointerId,
    );

    this.arrastrando = false;
    this.contenedorArrastre = null;
    this.panelArrastre = null;
  }

  seleccionarCelda(nicho: Nicho | null): void {
    this.celdaSeleccionada = nicho;
  }

  /** Lleva al formulario de registro con el bloque y la celda elegidos. */
  irARegistro(nicho: Nicho): void {
    const bloque = this.panel?.bloque;
    if (!bloque) {
      return;
    }

    this.router.navigate(['/dashboard/registro'], {
      queryParams: {
        predioId: bloque.id,
        bloque: bloque.codigo_lote,
        fila: nicho.fila,
        columna: nicho.columna,
      },
    });
  }

  /** Navega al Módulo Tributario con los datos de la celda ocupada o en mora. */
  pagarMantenimiento(nicho: Nicho): void {
    const bloque = this.panel?.bloque;
    const codigo = bloque?.codigo_lote ?? 'Bloque';

    this.router.navigate(['/dashboard/recaudacion'], {
      queryParams: {
        modo: 'mantenimiento',
        difunto: this.nombreDifunto(nicho),
        solicitante: nicho.solicitante ?? '',
        ubicacion: `Bloque ${codigo} - Fila ${nicho.fila}, Columna ${nicho.columna}`,
        tipoEspacio: nicho.tipo_espacio ?? 'Nicho',
        esPerpetuo: nicho.es_perpetuo ? 'true' : 'false',
        estado: nicho.estado,
      },
    });
  }

  /**
   * Nombre completo del difunto para ticket, PDF y queryParams. Evita repetir
   * los apellidos cuando `nombres` ya los incluye ("FERMINA VELIZ MAMANI").
   */
  nombreDifunto(nicho: Nicho | null): string {
    if (!nicho) {
      return '';
    }

    const limpiar = (valor?: string | null) =>
      (valor ?? '').replace(/\s+/g, ' ').trim();
    const sinTildes = (valor: string) =>
      valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    const nombres = limpiar(nicho.nombre_difunto) || limpiar(nicho.nombres);
    const apellidos =
      [limpiar(nicho.apellido_paterno), limpiar(nicho.apellido_materno)]
        .filter(Boolean)
        .join(' ') || limpiar(nicho.apellido_difunto);

    if (!nombres) {
      return apellidos || 'Sin registro';
    }
    if (!apellidos) {
      return nombres;
    }

    const nombresPlano = sinTildes(nombres);
    const faltantes = apellidos
      .split(' ')
      .filter((apellido) => !nombresPlano.includes(sinTildes(apellido)));

    return [nombres, ...faltantes].join(' ').replace(/\s+/g, ' ').trim();
  }

  /** Régimen del espacio: perpetuo, plazo en años y fecha de vencimiento. */
  regimenNicho(nicho: Nicho | null): string {
    if (!nicho) {
      return 'Sin registro';
    }

    if (nicho.es_perpetuo) {
      return 'Perpetuo — sin vencimiento';
    }

    const plazo = Number(nicho.plazo_anios);
    const vencimiento = Number(nicho.anio_vencimiento);
    const partes: string[] = [];

    if (Number.isFinite(plazo) && plazo > 0) {
      partes.push(`${Math.trunc(plazo)} años`);
    }
    if (nicho.fecha_vencimiento) {
      partes.push(`vence el ${formatearFechaCorta(nicho.fecha_vencimiento)}`);
    } else if (Number.isFinite(vencimiento) && vencimiento > 0) {
      partes.push(`vence el año ${Math.trunc(vencimiento)}`);
    }

    return partes.length > 0 ? partes.join(' — ') : 'Sin plazo definido';
  }

  /** Fecha de entierro para mostrar: DD/MM/YYYY o el año histórico. */
  fechaNicho(nicho: Nicho | null): string {
    if (!nicho) {
      return '';
    }
    if (nicho.fecha_defuncion) {
      return formatearFechaCorta(nicho.fecha_defuncion);
    }
    return nicho.anio_defuncion ? String(nicho.anio_defuncion) : '';
  }

  /** El mantenimiento anual solo corresponde a mausoleos y perpetuos. */
  esMausoleoOPerpetuo(nicho: Nicho | null): boolean {
    return (
      !!nicho && (nicho.tipo_espacio === 'Mausoleo' || nicho.es_perpetuo === true)
    );
  }

  /** Subtítulo aclaratorio del tipo de espacio en el modal de edición. */
  descripcionTipoEspacio(tipo: string | null): string {
    if (tipo === 'Mausoleo') {
      return 'Mausoleo Familiar: terreno adquirido con construcción privada (sujeto a mantenimiento anual).';
    }
    if (tipo === 'Camposanto') {
      return 'Camposanto: sepultura individual en suelo natural.';
    }
    return 'Nicho en Bloque Municipal: compartimento en pabellón municipal.';
  }

  /** Vencimiento ISO calculado en la edición (mismo día y mes + plazo). */
  get fechaVencimientoEdicion(): string | null {
    if (this.formularioNicho.es_perpetuo) {
      return null;
    }

    return sumarAniosFecha(
      this.formularioNicho.fecha_defuncion,
      Number(this.formularioNicho.plazo_anios),
    );
  }

  /** Texto de pantalla del vencimiento en la edición. */
  get fechaVencimientoEdicionTexto(): string {
    if (this.formularioNicho.es_perpetuo) {
      return 'Sin vencimiento (Perpetuo)';
    }

    const fecha = this.fechaVencimientoEdicion;
    return fecha
      ? formatearFechaCorta(fecha)
      : 'Indique la fecha de defunción y el plazo';
  }

  esResaltado(nicho: Nicho | null): boolean {
    return (
      !!nicho &&
      !!this.nichoResaltado &&
      nicho.fila === this.nichoResaltado.fila &&
      nicho.columna === this.nichoResaltado.columna
    );
  }

  claseEstado(nicho: Nicho | null): string {
    if (!nicho) {
      return 'celda-vacia';
    }
    return `celda-${nicho.estado.toLowerCase()}`;
  }

  letraEstado(nicho: Nicho | null): string {
    if (!nicho) {
      return '';
    }
    return nicho.estado.charAt(0).toUpperCase();
  }

  /** Texto del tooltip nativo al pasar el mouse sobre una celda. */
  descripcionNicho(nicho: Nicho | null): string {
    if (!nicho) {
      return 'Sin nicho registrado en esta posición';
    }

    const difunto =
      [nicho.nombre_difunto, nicho.apellido_difunto]
        .filter(Boolean)
        .join(' ')
        .trim() || 'Sin difunto registrado';

    const partes = [
      `Fila ${nicho.fila}, Columna ${nicho.columna} - ${nicho.estado}`,
      `Difunto: ${difunto}`,
    ];

    if (nicho.solicitante) {
      partes.push(`Solicitante: ${nicho.solicitante}`);
    }
    if (nicho.resolucion) {
      partes.push(`Resolución: ${nicho.resolucion}`);
    }

    return partes.join('\n');
  }

  /** Se dispara con cada tecla: alimenta el buscador reactivo. */
  onTerminoChange(termino: string): void {
    this.terminoBusqueda = termino ?? '';

    // Con menos de 2 letras la lista se limpia al instante, sin esperar.
    if (this.terminoBusqueda.trim().length < 2) {
      this.resultados = [];
      this.errorBusqueda = '';
      this.busquedaRealizada = false;
      this.buscando = false;
    }

    this.termino$.next(this.terminoBusqueda);
  }

  /** Botón "Buscar": consulta de inmediato, sin esperar el debounce. */
  buscar(): void {
    const termino = this.terminoBusqueda.trim();
    this.errorBusqueda = '';
    this.busquedaRealizada = false;

    if (termino.length < 2) {
      this.resultados = [];
      this.errorBusqueda = 'Ingrese al menos 2 letras del apellido o nombre.';
      return;
    }

    this.busquedaManual$.next(termino);
  }

  /** Consulta /catastro/buscar y normaliza el estado de carga y de error. */
  private consultarDifuntos(
    terminoCrudo: string,
  ): Observable<ResultadoBusqueda[] | null> {
    const termino = (terminoCrudo ?? '').trim();
    this.errorBusqueda = '';

    if (termino.length < 2) {
      this.resultados = [];
      this.buscando = false;
      this.busquedaRealizada = false;
      return of(null);
    }

    this.buscando = true;

    return this.http
      .get<ResultadoBusqueda[]>(`${API_URL}/catastro/buscar`, {
        params: { apellido: termino },
      })
      .pipe(
        catchError((err) => {
          console.error('Error en la búsqueda de difuntos:', err);
          this.resultados = [];
          this.buscando = false;
          this.errorBusqueda =
            'No se pudo realizar la búsqueda. Verifique la conexión con el servidor.';
          return of(null);
        }),
      );
  }

  /** Zoom al bloque del resultado, abre su cuadrícula y resalta el nicho. */
  seleccionarResultado(resultado: ResultadoBusqueda): void {
    this.resultados = [];
    this.busquedaRealizada = false;
    this.terminoBusqueda =
      resultado.apellido_difunto ?? resultado.nombre_difunto ?? '';

    const bounds = L.latLngBounds(
      [resultado.bounds.minLat, resultado.bounds.minLng],
      [resultado.bounds.maxLat, resultado.bounds.maxLng],
    );

    this.map.flyToBounds(bounds, {
      padding: [40, 40],
      maxZoom: 20,
      duration: 0.8,
    });

    this.abrirBloque(resultado.predio_id, {
      fila: resultado.fila,
      columna: resultado.columna,
    });
  }

  limpiarBusqueda(): void {
    this.terminoBusqueda = '';
    this.resultados = [];
    this.errorBusqueda = '';
    this.busquedaRealizada = false;
    this.buscando = false;
    this.termino$.next('');
  }

  etiquetaResultado(resultado: ResultadoBusqueda): string {
    return `${resultado.codigo_lote} - Fila ${resultado.fila}, Columna ${resultado.columna}`;
  }

  /** Formulario vacío para el modal de edición. */
  private formularioNichoVacio(): FormularioNicho {
    return {
      apellido_paterno: '',
      apellido_materno: '',
      nombres: '',
      fecha_defuncion: '',
      solicitante: '',
      telefono_solicitante: '',
      resolucion: '',
      tipo_espacio: 'Nicho',
      estado: 'Ocupado',
      es_perpetuo: false,
      plazo_anios: null,
      monto_contrato_bs: null,
      sector_camposanto: '',
      observaciones: '',
    };
  }

  private formularioBloqueVacio(): FormularioBloque {
    return {
      codigo_lote: '',
      filas: 1,
      columnas: 1,
      tipo_espacio_default: 'Nicho',
    };
  }

  private aNumero(valor: unknown): number | null {
    if (valor === null || valor === undefined || valor === ('' as unknown)) {
      return null;
    }
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : null;
  }

  // ---------- Edición de un registro desde el geovisor ----------

  abrirEdicion(nicho: Nicho): void {
    this.formularioNicho = {
      apellido_paterno: nicho.apellido_paterno ?? '',
      apellido_materno: nicho.apellido_materno ?? '',
      nombres: nicho.nombres ?? nicho.nombre_difunto ?? '',
      fecha_defuncion: nicho.fecha_defuncion ?? '',
      solicitante: nicho.solicitante ?? '',
      telefono_solicitante: nicho.telefono_solicitante ?? '',
      resolucion: nicho.resolucion ?? '',
      tipo_espacio: nicho.tipo_espacio ?? 'Nicho',
      estado: nicho.estado,
      es_perpetuo: nicho.es_perpetuo === true,
      plazo_anios: nicho.plazo_anios ?? null,
      monto_contrato_bs: nicho.monto_contrato_bs ?? null,
      sector_camposanto: nicho.sector_camposanto ?? '',
      observaciones: nicho.observaciones ?? '',
    };
    this.errorEdicion = '';
    this.guardandoEdicion = false;
    this.modalEdicionAbierto = true;
  }

  cerrarEdicion(): void {
    this.modalEdicionAbierto = false;
    this.guardandoEdicion = false;
    this.errorEdicion = '';
  }

  /** Guarda los cambios con PATCH /catastro/nichos/:id y refresca la grilla. */
  guardarEdicion(): void {
    const celda = this.celdaSeleccionada;
    if (!celda) {
      return;
    }

    const formulario = this.formularioNicho;

    if (!formulario.apellido_paterno.trim() && !formulario.nombres.trim()) {
      this.errorEdicion =
        'Ingrese al menos el apellido o los nombres del difunto.';
      return;
    }

    if (formulario.es_perpetuo && !formulario.resolucion.trim()) {
      this.errorEdicion =
        'La N° de Resolución Administrativa (RA.) es obligatoria para concesiones perpetuas.';
      return;
    }

    this.guardandoEdicion = true;
    this.errorEdicion = '';

    this.http
      .patch(`${API_URL}/catastro/nichos/${celda.id}`, {
        apellido_paterno: formulario.apellido_paterno.trim(),
        apellido_materno: formulario.apellido_materno.trim(),
        nombres: formulario.nombres.trim(),
        fecha_defuncion: formulario.fecha_defuncion || null,
        solicitante: formulario.solicitante.trim(),
        telefono_solicitante: formulario.telefono_solicitante.trim(),
        resolucion: formulario.es_perpetuo
          ? formulario.resolucion.trim()
          : null,
        tipo_espacio: formulario.tipo_espacio,
        estado: formulario.estado,
        es_perpetuo: formulario.es_perpetuo,
        plazo_anios: formulario.es_perpetuo
          ? null
          : this.aNumero(formulario.plazo_anios),
        monto_contrato_bs: this.aNumero(formulario.monto_contrato_bs),
        sector_camposanto: formulario.sector_camposanto.trim(),
        observaciones: formulario.observaciones.trim(),
      })
      .subscribe({
        next: () => {
          this.guardandoEdicion = false;
          this.modalEdicionAbierto = false;
          this.abrirBloque(celda.predio_id, {
            fila: celda.fila,
            columna: celda.columna,
          });
        },
        error: (err) => {
          console.error('Error al actualizar el registro:', err);
          this.guardandoEdicion = false;
          this.errorEdicion =
            err?.error?.message ??
            'No se pudo guardar el registro. Verifique los datos ingresados.';
        },
      });
  }

  // ---------- Dibujo de un nuevo bloque / mausoleo ----------

  /** Activa el modo de dibujo por clics sobre el mapa satelital. */
  activarDibujo(): void {
    this.modalEdicionAbierto = false;
    this.cerrarPanel();

    this.modoDibujo = true;
    this.puntosDibujo = [];
    this.errorBloque = '';

    this.capaDibujo?.remove();
    this.capaDibujo = L.layerGroup().addTo(this.map);

    this.map.doubleClickZoom.disable();
    this.map.getContainer().style.cursor = 'crosshair';
  }

  private agregarVertice(latlng: L.LatLng): void {
    this.puntosDibujo.push(latlng);
    this.dibujarPreliminar();
  }

  /** Marcadores temporales, línea y polígono preliminar del dibujo. */
  private dibujarPreliminar(): void {
    if (!this.capaDibujo) {
      return;
    }

    this.capaDibujo.clearLayers();

    this.puntosDibujo.forEach((punto, indice) => {
      L.circleMarker(punto, {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: '#f97316',
        fillOpacity: 1,
      })
        .bindTooltip(`Vértice ${indice + 1}`, { direction: 'top' })
        .addTo(this.capaDibujo!);
    });

    if (this.puntosDibujo.length >= 2) {
      L.polyline(this.puntosDibujo, {
        color: '#f97316',
        weight: 3,
        dashArray: '6, 4',
      }).addTo(this.capaDibujo);
    }

    if (this.puntosDibujo.length >= 3) {
      L.polygon(this.puntosDibujo, {
        color: '#f97316',
        weight: 2,
        fillColor: '#fb923c',
        fillOpacity: 0.25,
      }).addTo(this.capaDibujo);
    }
  }

  finalizarPoligono(): void {
    if (this.puntosDibujo.length < 3) {
      this.errorBloque = 'Marque al menos 3 vértices sobre el mapa.';
      return;
    }

    this.formularioBloque = this.formularioBloqueVacio();
    this.errorBloque = '';
    this.modalBloqueAbierto = true;
  }

  cancelarDibujo(): void {
    this.modoDibujo = false;
    this.puntosDibujo = [];
    this.modalBloqueAbierto = false;
    this.guardandoBloque = false;
    this.errorBloque = '';
    this.capaDibujo?.clearLayers();
    this.capaDibujo?.remove();
    this.capaDibujo = undefined;

    if (this.map) {
      this.map.doubleClickZoom.enable();
      this.map.getContainer().style.cursor = '';
    }
  }

  /** Crea el bloque en el backend y recarga las capas GeoJSON del mapa. */
  guardarBloque(): void {
    const formulario = this.formularioBloque;
    const codigo = formulario.codigo_lote.trim();

    if (!codigo) {
      this.errorBloque = 'Ingrese el nombre o código del mausoleo/bloque.';
      return;
    }

    const filas = Math.trunc(Number(formulario.filas));
    const columnas = Math.trunc(Number(formulario.columnas));

    if (!Number.isFinite(filas) || filas < 1 || !Number.isFinite(columnas) || columnas < 1) {
      this.errorBloque = 'Indique al menos 1 fila y 1 columna.';
      return;
    }

    this.guardandoBloque = true;
    this.errorBloque = '';

    this.http
      .post<{ bloque?: { id: string } }>(`${API_URL}/catastro/bloques`, {
        codigo_lote: codigo,
        filas,
        columnas,
        tipo_espacio_default: formulario.tipo_espacio_default,
        estado: 'Libre',
        coordenadas: this.puntosDibujo.map((punto) => [punto.lng, punto.lat]),
      })
      .subscribe({
        next: (respuesta) => {
          const predioId = respuesta?.bloque?.id;
          this.guardandoBloque = false;
          this.cancelarDibujo();
          this.recargarCapas(() => {
            if (!predioId) {
              return;
            }
            this.enfocarBloque(predioId);
            this.abrirBloque(predioId);
          });
        },
        error: (err) => {
          console.error('Error al crear el bloque:', err);
          this.guardandoBloque = false;
          this.errorBloque =
            err?.error?.message ??
            'No se pudo crear el bloque. Verifique el código y el polígono dibujado.';
        },
      });
  }

  /** Vuelve a pedir el GeoJSON de bloques y lo redibuja en el mapa. */
  private recargarCapas(alTerminar?: () => void): void {
    this.http.get<any>(`${API_URL}/catastro/mapa`).subscribe({
      next: (mapa) => {
        this.dibujarBloques(mapa);
        alTerminar?.();
      },
      error: (err) => {
        console.error('Error al recargar los bloques del mapa:', err);
      },
    });
  }
}
