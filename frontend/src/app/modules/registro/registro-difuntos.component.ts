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
    anio_defuncion: new Date().getFullYear() as number | null,
    solicitante: '',
    telefono_solicitante: '',
    resolucion: '',
    estado: 'Ocupado' as 'Ocupado' | 'Mora',
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

  /** Vencimiento calculado a partir del año de defunción y el plazo. */
  get anioVencimiento(): number | null {
    if (this.formulario.es_perpetuo) {
      return null;
    }

    const plazo = Number(this.formulario.plazo_anios);
    const anio = Number(this.formulario.anio_defuncion);

    if (!Number.isFinite(plazo) || plazo < 1) {
      return null;
    }
    if (!Number.isFinite(anio) || anio < 1900) {
      return null;
    }

    return Math.trunc(anio) + Math.trunc(plazo);
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
    if (!this.formulario.es_perpetuo) {
      const plazo = Number(this.formulario.plazo_anios);
      if (!Number.isFinite(plazo) || plazo < 1) {
        this.error = 'Indique el plazo del contrato en años (mayor a 0).';
        return;
      }
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
      anio_defuncion: this.formulario.anio_defuncion
        ? Number(this.formulario.anio_defuncion)
        : undefined,
      solicitante: this.formulario.solicitante.trim() || undefined,
      telefono_solicitante:
        this.formulario.telefono_solicitante.trim() || undefined,
      resolucion: this.formulario.resolucion.trim() || undefined,
      estado: this.formulario.estado,
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
    this.formulario.anio_defuncion = new Date().getFullYear();
    this.formulario.solicitante = '';
    this.formulario.telefono_solicitante = '';
    this.formulario.resolucion = '';
    this.formulario.estado = 'Ocupado';
    this.formulario.tipo_espacio = 'Nicho';
    this.formulario.regimen = this.regimenes[0].etiqueta;
    this.formulario.plazo_anios = this.regimenes[0].plazo;
    this.formulario.es_perpetuo = this.regimenes[0].perpetuo;
    this.formulario.monto_contrato_bs = this.regimenes[0].monto;
  }
}
