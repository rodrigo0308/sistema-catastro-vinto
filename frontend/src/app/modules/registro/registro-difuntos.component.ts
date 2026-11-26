import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';

const API_URL = 'http://localhost:3000';

interface Bloque {
  id: string;
  codigo_lote: string;
}

interface NichoRegistrado {
  id: string;
  predio_id: string;
  fila: number;
  columna: number;
}

type TipoEspacio = 'Nicho' | 'Mausoleo' | 'Camposanto';

interface RegimenContrato {
  etiqueta: string;
  plazo: number | null;
  monto: number | null;
  perpetuo: boolean;
}

/** Fecha ISO (YYYY-MM-DD) de hoy según la hora local del funcionario. */
function fechaHoy(): string {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}

/** Suma años conservando el mismo día y mes (29/02 se ajusta a fin de mes). */
function sumarAnios(fecha: string, anios: number): string | null {
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
function formatearFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

@Component({
  selector: 'app-registro-difuntos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './registro-difuntos.component.html',
  styleUrl: './registro-difuntos.component.css',
})
export class RegistroDifuntosComponent implements OnInit {
  bloques: Bloque[] = [];
  cargandoBloques = false;
  errorBloques = '';

  readonly tiposEspacio: TipoEspacio[] = ['Nicho', 'Mausoleo', 'Camposanto'];

  // Regímenes referenciales del GAM Vinto; el monto siempre es editable.
  readonly regimenes: RegimenContrato[] = [
    {
      etiqueta: 'Temporal — 5 años (Ref. 320 Bs.)',
      plazo: 5,
      monto: 320,
      perpetuo: false,
    },
    {
      etiqueta: 'Temporal — 30 años (Ref. 4.000 Bs.)',
      plazo: 30,
      monto: 4000,
      perpetuo: false,
    },
    {
      etiqueta: 'Temporal — Plazo Personalizado (Años libres)',
      plazo: null,
      monto: null,
      perpetuo: false,
    },
    {
      etiqueta: 'Perpetuo (Mantenimiento anual)',
      plazo: null,
      monto: null,
      perpetuo: true,
    },
  ];

  formulario = {
    predio_id: '',
    fila: 1,
    columna: 1,
    apellido_paterno: '',
    apellido_materno: '',
    nombres: '',
    fecha_defuncion: fechaHoy(),
    solicitante: '',
    telefono_solicitante: '',
    resolucion: '',
    // Desmarcado: el registro se guarda como 'Pendiente de Pago' en caja.
    pago_en_caja: false,
    tipo_espacio: 'Nicho' as TipoEspacio,
    regimen: this.regimenes[0].etiqueta,
    plazo_anios: this.regimenes[0].plazo as number | null,
    es_perpetuo: this.regimenes[0].perpetuo,
    monto_contrato_bs: this.regimenes[0].monto as number | null,
  };

  guardando = false;
  error = '';
  nichoRegistrado: NichoRegistrado | null = null;
  bloqueRegistrado = '';

  constructor(
    private readonly http: HttpClient,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {
    // Preselección cuando se llega desde una celda Libre del geovisor
    const params = this.route.snapshot.queryParamMap;
    const predioId = params.get('predioId');
    if (predioId) {
      this.formulario.predio_id = predioId;
    }

    const fila = Number(params.get('fila'));
    const columna = Number(params.get('columna'));
    if (fila > 0) {
      this.formulario.fila = fila;
    }
    if (columna > 0) {
      this.formulario.columna = columna;
    }
  }

  ngOnInit(): void {
    this.cargarBloques();
  }

  /** Indica si el régimen elegido exige escribir los años a mano. */
  get esPlazoPersonalizado(): boolean {
    return this.formulario.regimen.includes('Personalizado');
  }

  /** Fecha de vencimiento ISO: mismo día y mes, más los años del plazo. */
  get fechaVencimiento(): string | null {
    if (this.formulario.es_perpetuo) {
      return null;
    }

    return sumarAnios(
      this.formulario.fecha_defuncion,
      Number(this.formulario.plazo_anios),
    );
  }

  /** Texto de pantalla del vencimiento: DD/MM/YYYY o perpetuo. */
  get fechaVencimientoTexto(): string {
    if (this.formulario.es_perpetuo) {
      return 'Sin vencimiento (Perpetuo)';
    }

    const fecha = this.fechaVencimiento;
    return fecha
      ? formatearFecha(fecha)
      : 'Indique la fecha de defunción y el plazo';
  }

  /** Año de vencimiento, para el contrato en el módulo tributario. */
  get anioVencimiento(): number | null {
    const fecha = this.fechaVencimiento;
    return fecha ? Number(fecha.slice(0, 4)) : null;
  }

  /** Subtítulo aclaratorio del tipo de espacio elegido. */
  get descripcionTipoEspacio(): string {
    if (this.formulario.tipo_espacio === 'Mausoleo') {
      return 'Mausoleo Familiar: terreno adquirido con construcción privada (sujeto a mantenimiento anual).';
    }
    if (this.formulario.tipo_espacio === 'Camposanto') {
      return 'Camposanto: sepultura individual en suelo natural.';
    }
    return 'Nicho en Bloque Municipal: compartimento en pabellón municipal.';
  }

  /** Subtítulo aclaratorio del régimen y de la Resolución Administrativa. */
  get descripcionRegimen(): string {
    return this.formulario.es_perpetuo
      ? 'Perpetuo: sin vencimiento; exige Resolución Administrativa (RA.) y mantenimiento anual de 25 Bs./año.'
      : 'Temporal: contrato con plazo y fecha de vencimiento; no lleva RA. Al concluir el plazo se renueva el contrato.';
  }

  private cargarBloques(): void {
    this.cargandoBloques = true;
    this.errorBloques = '';

    this.http.get<Bloque[]>(`${API_URL}/catastro/bloques`).subscribe({
      next: (bloques) => {
        this.bloques = bloques ?? [];
        this.cargandoBloques = false;
      },
      error: (err) => {
        console.error('Error al cargar los bloques:', err);
        this.errorBloques =
          'No se pudieron cargar los bloques. Verifique la conexión con el servidor.';
        this.cargandoBloques = false;
      },
    });
  }

  /**
   * Aplica el régimen elegido: fija el plazo y el monto referencial.
   * En "Plazo Personalizado" y "Perpetuo" los años quedan a criterio del
   * funcionario; el monto siempre se puede editar después.
   */
  seleccionarRegimen(etiqueta: string): void {
    this.formulario.regimen = etiqueta;

    const item = this.regimenes.find((r) => r.etiqueta === etiqueta);
    if (!item) {
      return;
    }

    this.formulario.es_perpetuo = item.perpetuo;

    if (item.perpetuo) {
      this.formulario.plazo_anios = null;
      this.formulario.monto_contrato_bs = null;
      return;
    }

    // La RA. es exclusiva de las concesiones perpetuas.
    this.formulario.resolucion = '';

    if (item.plazo !== null) {
      this.formulario.plazo_anios = item.plazo;
      this.formulario.monto_contrato_bs = item.monto;
    } else {
      this.formulario.plazo_anios = null;
    }

    this.error = '';
  }

  guardar(): void {
    this.error = '';

    if (!this.formulario.predio_id) {
      this.error = 'Seleccione el bloque o mausoleo.';
      return;
    }
    if (!this.formulario.fila || this.formulario.fila < 1) {
      this.error = 'Indique una fila válida (mayor a 0).';
      return;
    }
    if (!this.formulario.columna || this.formulario.columna < 1) {
      this.error = 'Indique una columna válida (mayor a 0).';
      return;
    }
    if (!this.formulario.apellido_paterno.trim()) {
      this.error = 'El apellido paterno del difunto es obligatorio.';
      return;
    }
    if (!this.formulario.nombres.trim()) {
      this.error = 'Los nombres del difunto son obligatorios.';
      return;
    }
    if (!this.formulario.fecha_defuncion) {
      this.error = 'Indique la fecha de defunción o entierro.';
      return;
    }
    if (!this.formulario.es_perpetuo) {
      const plazo = Number(this.formulario.plazo_anios);
      if (!Number.isFinite(plazo) || plazo < 1) {
        this.error = 'Indique el plazo del contrato en años (mayor a 0).';
        return;
      }
    }
    if (this.formulario.es_perpetuo && !this.formulario.resolucion.trim()) {
      this.error =
        'La N° de Resolución Administrativa (RA.) es obligatoria para concesiones perpetuas.';
      return;
    }
    if (
      this.formulario.monto_contrato_bs !== null &&
      Number(this.formulario.monto_contrato_bs) < 0
    ) {
      this.error = 'El monto del contrato no puede ser negativo.';
      return;
    }

    const body = {
      predio_id: this.formulario.predio_id,
      fila: Number(this.formulario.fila),
      columna: Number(this.formulario.columna),
      apellido_paterno: this.formulario.apellido_paterno.trim(),
      apellido_materno: this.formulario.apellido_materno.trim() || undefined,
      nombres: this.formulario.nombres.trim(),
      fecha_defuncion: this.formulario.fecha_defuncion || undefined,
      fecha_vencimiento: this.fechaVencimiento ?? undefined,
      solicitante: this.formulario.solicitante.trim() || undefined,
      telefono_solicitante:
        this.formulario.telefono_solicitante.trim() || undefined,
      resolucion: this.formulario.es_perpetuo
        ? this.formulario.resolucion.trim() || undefined
        : undefined,
      estado: this.formulario.pago_en_caja ? 'Ocupado' : 'Pendiente de Pago',
      tipo_espacio: this.formulario.tipo_espacio,
      plazo_anios: this.formulario.es_perpetuo
        ? undefined
        : Number(this.formulario.plazo_anios),
      es_perpetuo: this.formulario.es_perpetuo,
      monto_contrato_bs:
        this.formulario.monto_contrato_bs !== null
          ? Number(this.formulario.monto_contrato_bs)
          : undefined,
    };

    this.guardando = true;

    this.http
      .post<NichoRegistrado>(`${API_URL}/catastro/nichos/registrar`, body)
      .subscribe({
        next: (nicho) => {
          this.guardando = false;
          this.nichoRegistrado = {
            id: nicho.id,
            predio_id: nicho.predio_id ?? body.predio_id,
            fila: nicho.fila ?? body.fila,
            columna: nicho.columna ?? body.columna,
          };
          this.bloqueRegistrado =
            this.bloques.find((bloque) => bloque.id === body.predio_id)
              ?.codigo_lote ?? '';
        },
        error: (err) => {
          console.error('Error al registrar el difunto:', err);
          this.guardando = false;
          this.error =
            err?.error?.message ??
            'No se pudo registrar el difunto. Verifique la conexión con el servidor.';
        },
      });
  }

  /** Vuelve al geovisor con el nicho recién registrado seleccionado. */
  verEnGeovisor(): void {
    if (!this.nichoRegistrado) {
      return;
    }

    this.router.navigate(['/dashboard/catastro'], {
      queryParams: {
        predioId: this.nichoRegistrado.predio_id,
        fila: this.nichoRegistrado.fila,
        columna: this.nichoRegistrado.columna,
      },
    });
  }

  /**
   * Lleva el contrato al Módulo Tributario para emitir la liquidación y el
   * PDF de caja con los datos del difunto, el plazo y el precio acordado.
   */
  emitirContrato(): void {
    if (!this.nichoRegistrado) {
      return;
    }

    const difunto = [
      this.formulario.apellido_paterno.trim(),
      this.formulario.apellido_materno.trim(),
      this.formulario.nombres.trim(),
    ]
      .filter((parte) => parte.length > 0)
      .join(' ');

    const ubicacion = `${this.bloqueRegistrado || 'Bloque'} - Fila ${
      this.nichoRegistrado.fila
    }, Columna ${this.nichoRegistrado.columna}`;

    this.router.navigate(['/dashboard/recaudacion'], {
      queryParams: {
        difunto,
        solicitante: this.formulario.solicitante.trim(),
        ubicacion,
        tipoEspacio: this.formulario.tipo_espacio,
        plazoAnios: this.formulario.es_perpetuo
          ? null
          : this.formulario.plazo_anios,
        esPerpetuo: this.formulario.es_perpetuo,
        anioVencimiento: this.anioVencimiento,
        montoContrato: this.formulario.monto_contrato_bs,
        nichoId: this.nichoRegistrado.id,
        estado: this.formulario.pago_en_caja ? 'Ocupado' : 'Pendiente de Pago',
      },
    });
  }

  /** Limpia el formulario para un nuevo registro conservando el bloque. */
  registrarOtro(): void {
    this.nichoRegistrado = null;
    this.bloqueRegistrado = '';
    this.error = '';
    this.formulario.apellido_paterno = '';
    this.formulario.apellido_materno = '';
    this.formulario.nombres = '';
    this.formulario.fecha_defuncion = fechaHoy();
    this.formulario.solicitante = '';
    this.formulario.telefono_solicitante = '';
    this.formulario.resolucion = '';
    this.formulario.pago_en_caja = false;
    this.formulario.tipo_espacio = 'Nicho';
    this.formulario.regimen = this.regimenes[0].etiqueta;
    this.formulario.plazo_anios = this.regimenes[0].plazo;
    this.formulario.es_perpetuo = this.regimenes[0].perpetuo;
    this.formulario.monto_contrato_bs = this.regimenes[0].monto;
  }
}
