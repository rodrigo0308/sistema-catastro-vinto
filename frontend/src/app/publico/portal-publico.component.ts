import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import * as L from 'leaflet';

const API_URL = 'http://localhost:3000';

/** Caracteres sin ambigüedad visual (sin O/0, I/1) para el captcha ligero. */
const CARACTERES_CAPTCHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type CriterioBusqueda = 'difunto' | 'lote';

interface CentroideGeoJson {
  type: string;
  coordinates: [number, number];
}

/** Datos públicos devueltos por GET /publico/consultar. */
interface ResultadoPublico {
  difunto: string;
  tipo_espacio: string;
  bloque_sector: string;
  fila: number;
  columna: number;
  regimen: string;
  estado_ciudadano: string | null;
  titular_referencia: string | null;
  centroide: CentroideGeoJson | null;
}

interface RespuestaConsulta {
  consulta: string;
  total: number;
  resultados: ResultadoPublico[];
}

/**
 * Portal Web Abierto de Consultas Ciudadanas (estilo RUAT).
 * Es la pantalla inicial de la aplicación y no requiere autenticación:
 * permite verificar la ubicación y el estado de un espacio del cementerio.
 */
@Component({
  selector: 'app-portal-publico',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './portal-publico.component.html',
  styleUrl: './portal-publico.component.css',
})
export class PortalPublicoComponent implements AfterViewInit, OnDestroy {
  @ViewChild('captchaCanvas')
  private captchaCanvas?: ElementRef<HTMLCanvasElement>;

  criterio: CriterioBusqueda = 'difunto';
  termino = '';

  // Captcha ligero generado en el navegador antes de cada consulta.
  codigoCaptcha = '';
  captchaIngresado = '';

  error = '';
  buscando = false;
  busquedaRealizada = false;
  consultaAplicada = '';
  resultados: ResultadoPublico[] = [];

  // Mini-mapa de solo lectura con la ubicación del bloque consultado.
  modalMapaAbierto = false;
  resultadoMapa: ResultadoPublico | null = null;
  private mapa?: L.Map;

  constructor(private readonly http: HttpClient) {
    this.generarCaptcha();
  }

  ngAfterViewInit(): void {
    this.dibujarCaptcha();
  }

  ngOnDestroy(): void {
    this.destruirMapa();
  }

  /** Nuevo código alfanumérico de 5 caracteres dibujado en el canvas. */
  generarCaptcha(): void {
    let codigo = '';

    for (let i = 0; i < 5; i++) {
      codigo += CARACTERES_CAPTCHA.charAt(
        Math.floor(Math.random() * CARACTERES_CAPTCHA.length),
      );
    }

    this.codigoCaptcha = codigo;
    this.captchaIngresado = '';
    this.dibujarCaptcha();
  }

  /**
   * Captcha gráfico tipo RUAT/SEGIP: fondo con gradiente y ruido, líneas
   * diagonales y cada carácter rotado con la paleta institucional.
   */
  private dibujarCaptcha(): void {
    const canvas = this.captchaCanvas?.nativeElement;
    const ctx = canvas?.getContext('2d');

    if (!canvas || !ctx) {
      return;
    }

    const ancho = canvas.width;
    const alto = canvas.height;
    const aleatorio = (min: number, max: number) =>
      min + Math.random() * (max - min);

    // Fondo claro con gradiente suave.
    const gradiente = ctx.createLinearGradient(0, 0, ancho, alto);
    gradiente.addColorStop(0, '#fbfcfe');
    gradiente.addColorStop(0.55, '#eef3f8');
    gradiente.addColorStop(1, '#e2eaf2');
    ctx.fillStyle = gradiente;
    ctx.fillRect(0, 0, ancho, alto);

    // Cuadrícula sutil y puntos de ruido visual.
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.12)';
    ctx.lineWidth = 1;
    for (let x = 12; x < ancho; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, alto);
      ctx.stroke();
    }
    for (let y = 10; y < alto; y += 13) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(ancho, y);
      ctx.stroke();
    }
    for (let i = 0; i < 180; i++) {
      ctx.fillStyle = `rgba(51, 65, 85, ${aleatorio(0.05, 0.2).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(aleatorio(0, ancho), aleatorio(0, alto), aleatorio(0.5, 1.4), 0, Math.PI * 2);
      ctx.fill();
    }

    // Líneas curvas semitransparentes que cruzan el código.
    const lineas: Array<{ color: string; offset: number }> = [
      { color: 'rgba(11, 59, 99, 0.28)', offset: -8 },
      { color: 'rgba(15, 122, 77, 0.25)', offset: 4 },
      { color: 'rgba(127, 29, 29, 0.22)', offset: 12 },
    ];
    lineas.forEach((linea) => {
      ctx.strokeStyle = linea.color;
      ctx.lineWidth = aleatorio(1.2, 2.2);
      ctx.beginPath();
      ctx.moveTo(-6, aleatorio(8, alto - 8));
      ctx.bezierCurveTo(
        ancho * 0.3,
        alto / 2 + linea.offset * 2,
        ancho * 0.7,
        alto / 2 - linea.offset * 2,
        ancho + 6,
        aleatorio(8, alto - 8),
      );
      ctx.stroke();
    });

    // Caracteres: bold, rotación leve y paleta institucional oscura.
    const colores = ['#0b3b63', '#14532d', '#7f1d1d', '#334155', '#1e3a5f'];
    const caracteres = [...this.codigoCaptcha];
    const paso = ancho / (caracteres.length + 1);

    caracteres.forEach((caracter, indice) => {
      ctx.save();
      ctx.translate(
        paso * (indice + 1) + aleatorio(-2, 2),
        alto / 2 + aleatorio(-4, 4),
      );
      ctx.rotate((aleatorio(-18, 18) * Math.PI) / 180);
      ctx.font = `bold ${Math.round(aleatorio(26, 31))}px "Segoe UI", Arial, sans-serif`;
      ctx.fillStyle = colores[Math.floor(Math.random() * colores.length)];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(caracter, 0, 0);
      ctx.restore();
    });

    // Marco interior discreto para dar acabado institucional.
    ctx.strokeStyle = 'rgba(11, 59, 99, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, ancho - 2, alto - 2);
  }

  /** Valida captcha y término, y consulta el endpoint público. */
  buscar(): void {
    const termino = this.termino.trim();
    this.error = '';
    this.busquedaRealizada = false;

    if (termino.length < 3) {
      this.resultados = [];
      this.error =
        'Ingrese al menos 3 caracteres del apellido, nombre o código de bloque.';
      return;
    }

    if (
      this.captchaIngresado.trim().toUpperCase() !== this.codigoCaptcha
    ) {
      this.generarCaptcha();
      this.error =
        'El código de verificación no coincide. Escriba el nuevo código mostrado.';
      return;
    }

    this.buscando = true;

    this.http
      .get<RespuestaConsulta>(`${API_URL}/publico/consultar`, {
        params: { q: termino },
      })
      .subscribe({
        next: (data) => {
          this.buscando = false;
          this.resultados = data?.resultados ?? [];
          this.consultaAplicada = data?.consulta ?? termino;
          this.busquedaRealizada = true;
          this.generarCaptcha();
        },
        error: (err) => {
          console.error('Error en la consulta ciudadana:', err);
          this.buscando = false;
          this.resultados = [];
          this.error =
            err?.error?.message ??
            'No se pudo completar la consulta. Verifique su conexión e intente nuevamente.';
          this.generarCaptcha();
        },
      });
  }

  /** Limpia la consulta y entrega un código de verificación nuevo. */
  nuevaBusqueda(): void {
    this.termino = '';
    this.resultados = [];
    this.error = '';
    this.busquedaRealizada = false;
    this.consultaAplicada = '';
    this.buscando = false;
    this.generarCaptcha();
  }

  /** Muestra el mini-mapa Leaflet (sin herramientas de edición). */
  verMapa(resultado: ResultadoPublico): void {
    const coordenadas = resultado.centroide?.coordinates;

    if (!Array.isArray(coordenadas) || coordenadas.length < 2) {
      this.error =
        'Este registro no tiene una ubicación geográfica registrada en el mapa.';
      return;
    }

    this.error = '';
    this.resultadoMapa = resultado;
    this.modalMapaAbierto = true;

    // El contenedor del mapa solo existe cuando el modal ya está en el DOM.
    setTimeout(() => this.inicializarMapa(resultado), 0);
  }

  cerrarMapa(): void {
    this.destruirMapa();
    this.modalMapaAbierto = false;
    this.resultadoMapa = null;
  }

  claseEstado(resultado: ResultadoPublico): string {
    return resultado.estado_ciudadano?.startsWith('Con deuda')
      ? 'estado-deuda'
      : 'estado-vigente';
  }

  private inicializarMapa(resultado: ResultadoPublico): void {
    this.destruirMapa();

    const contenedor = document.getElementById('mapa-publico');
    const coordenadas = resultado.centroide?.coordinates;

    if (!contenedor || !coordenadas) {
      return;
    }

    const [lng, lat] = coordenadas;

    this.mapa = L.map(contenedor, {
      center: [lat, lng],
      zoom: 19,
      minZoom: 17,
      maxZoom: 20,
      scrollWheelZoom: false,
    });

    // Capa satelital de referencia: solo lectura, sin dibujo ni edición.
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxNativeZoom: 18,
        maxZoom: 20,
        attribution: 'Tiles &copy; Esri',
      },
    ).addTo(this.mapa);

    L.circleMarker([lat, lng], {
      radius: 11,
      color: '#ffffff',
      weight: 3,
      fillColor: '#f59e0b',
      fillOpacity: 0.95,
    })
      .addTo(this.mapa)
      .bindTooltip(
        `${resultado.bloque_sector} — Fila ${resultado.fila}, Columna ${resultado.columna}`,
        { permanent: true, direction: 'top', offset: [0, -10] },
      )
      .openTooltip();

    // El modal se dimensiona al abrirse; recalcula el tamaño del mapa.
    setTimeout(() => this.mapa?.invalidateSize(), 50);
  }

  private destruirMapa(): void {
    if (this.mapa) {
      this.mapa.remove();
      this.mapa = undefined;
    }
  }
}
