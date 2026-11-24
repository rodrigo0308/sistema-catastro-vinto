import { Component, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import * as L from 'leaflet';

const API_URL = 'http://localhost:3000';

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
export class CatastroComponent implements AfterViewInit {
  private map!: L.Map;
  private capaBloques?: L.GeoJSON;

  // Panel tipo Excel
  panelAbierto = false;
  panel: PanelBloque | null = null;
  matriz: FilaMatriz[] = [];
  cargandoPanel = false;
  errorPanel = '';
  celdaSeleccionada: Nicho | null = null;
  nichoResaltado: { fila: number; columna: number } | null = null;

  // Buscador
  terminoBusqueda = '';
  resultados: ResultadoBusqueda[] = [];
  buscando = false;
  errorBusqueda = '';
  busquedaRealizada = false;

  constructor(private readonly http: HttpClient) {}

  ngAfterViewInit(): void {
    this.iniciarMapa();
    this.cargarPrediosEspaciales();
  }

  private iniciarMapa(): void {
    // Inicializamos el mapa centrado en Vinto con restricciones de zoom
    this.map = L.map('mapa-catastro', {
      minZoom: 14,
      maxZoom: 18, // Evita que el usuario haga un zoom excesivo que rompa el mapa
    }).setView([-17.398, -66.315], 16);

    // Capa Satelital de Alta Resolución (ESRI)
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution:
          'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      },
    ).addTo(this.map);

    // Un clic en el mapa (fuera de un bloque) oculta el panel
    this.map.on('click', () => this.cerrarPanel());
  }

  private cargarPrediosEspaciales(): void {
    this.http.get<any>(`${API_URL}/catastro/mapa`).subscribe({
      next: (geojsonData) => {
        this.capaBloques = L.geoJSON(geojsonData, {
          style: (feature) => {
            const estado = feature?.properties?.estado;
            let colorHex = '#2ecc71'; // Verde (Libre)
            if (estado === 'Ocupado') colorHex = '#e74c3c'; // Rojo
            if (estado === 'Mora') colorHex = '#f39c12'; // Naranja

            return { color: colorHex, weight: 3, fillOpacity: 0.45 };
          },
          onEachFeature: (feature, layer) => {
            const properties = feature.properties ?? {};

            layer.bindTooltip(
              `<b>${properties.codigo_lote ?? 'Bloque'}</b><br><small>Haz clic para ver los nichos</small>`,
              { sticky: true },
            );

            layer.on('click', (evento: L.LeafletMouseEvent) => {
              // Evita que el clic llegue al mapa y cierre el panel recién abierto
              L.DomEvent.stopPropagation(evento);
              this.abrirBloque(properties.id);
            });
          },
        }).addTo(this.map);
      },
      error: (err) =>
        console.error('Error al conectar con PostGIS:', err),
    });
  }

  /** Consulta los nichos de un bloque y abre la cuadrícula tipo Excel. */
  abrirBloque(
    predioId: string,
    resaltado?: { fila: number; columna: number },
  ): void {
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
    this.panelAbierto = false;
    this.panel = null;
    this.matriz = [];
    this.celdaSeleccionada = null;
    this.nichoResaltado = null;
    this.errorPanel = '';
    this.cargandoPanel = false;
  }

  seleccionarCelda(nicho: Nicho | null): void {
    this.celdaSeleccionada = nicho;
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

  buscar(): void {
    const termino = this.terminoBusqueda.trim();
    this.errorBusqueda = '';
    this.busquedaRealizada = false;

    if (termino.length < 2) {
      this.resultados = [];
      this.errorBusqueda = 'Ingrese al menos 2 letras del apellido o nombre.';
      return;
    }

    this.buscando = true;

    this.http
      .get<ResultadoBusqueda[]>(`${API_URL}/catastro/buscar`, {
        params: { apellido: termino },
      })
      .subscribe({
        next: (data) => {
          this.resultados = data;
          this.buscando = false;
          this.busquedaRealizada = true;
        },
        error: (err) => {
          console.error('Error en la búsqueda de difuntos:', err);
          this.resultados = [];
          this.buscando = false;
          this.errorBusqueda =
            'No se pudo realizar la búsqueda. Verifique la conexión con el servidor.';
        },
      });
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
      maxZoom: 18,
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
  }

  etiquetaResultado(resultado: ResultadoBusqueda): string {
    return `${resultado.codigo_lote} - Fila ${resultado.fila}, Columna ${resultado.columna}`;
  }
}
