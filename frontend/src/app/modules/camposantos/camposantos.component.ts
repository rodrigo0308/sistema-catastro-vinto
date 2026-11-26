import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

const API_URL = 'http://localhost:3000';

type EstadoCamposanto = 'Libre' | 'Ocupado' | 'Mora';

/** Fecha ISO (YYYY-MM-DD) de hoy según la hora local. */
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
function formatearFechaCorta(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

interface Camposanto {
  id: string;
  predio_id: string;
  codigo_lote: string | null;
  sector_camposanto: string | null;
  fila: number;
  columna: number;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  nombres: string | null;
  nombre_difunto: string | null;
  apellido_difunto: string | null;
  anio_defuncion: number | null;
  fecha_defuncion: string | null;
  fecha_vencimiento: string | null;
  solicitante: string | null;
  telefono_solicitante: string | null;
  resolucion: string | null;
  estado: EstadoCamposanto;
  tipo_espacio: string;
  plazo_anios: number | null;
  es_perpetuo: boolean;
  anio_vencimiento: number | null;
  monto_contrato_bs: number | null;
  observaciones: string | null;
}

interface FormularioCamposanto {
  sector_camposanto: string;
  fila: number | null;
  columna: number | null;
  apellido_paterno: string;
  apellido_materno: string;
  nombres: string;
  fecha_defuncion: string;
  solicitante: string;
  telefono_solicitante: string;
  resolucion: string;
  estado: EstadoCamposanto;
  es_perpetuo: boolean;
  plazo_anios: number | null;
  monto_contrato_bs: number | null;
  observaciones: string;
}

/**
 * Gestión especializada de sepulturas en tierra individual (Camposanto):
 * buscador en tiempo real, filtro por estado, alta, edición y cobro del
 * mantenimiento anual con redirección al módulo tributario.
 */
@Component({
  selector: 'app-camposantos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './camposantos.component.html',
  styleUrl: './camposantos.component.css',
})
export class CamposantosComponent implements OnInit {
  registros: Camposanto[] = [];
  cargando = false;
  error = '';

  busqueda = '';
  filtroEstado: 'Todos' | 'Ocupado' | 'Mora' = 'Todos';

  mostrarFormulario = false;
  editandoId: string | null = null;
  guardando = false;
  errorFormulario = '';
  mensajeExito = '';

  formulario: FormularioCamposanto = this.formularioVacio();

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  private formularioVacio(): FormularioCamposanto {
    return {
      sector_camposanto: '',
      fila: null,
      columna: null,
      apellido_paterno: '',
      apellido_materno: '',
      nombres: '',
      fecha_defuncion: fechaHoy(),
      solicitante: '',
      telefono_solicitante: '',
      resolucion: '',
      estado: 'Ocupado',
      es_perpetuo: false,
      plazo_anios: null,
      monto_contrato_bs: null,
      observaciones: '',
    };
  }

  cargar(): void {
    this.cargando = true;
    this.error = '';

    this.http.get<Camposanto[]>(`${API_URL}/catastro/camposantos`).subscribe({
      next: (registros) => {
        this.registros = registros ?? [];
        this.cargando = false;
      },
      error: (err) => {
        console.error('Error al cargar los camposantos:', err);
        this.error =
          'No se pudieron cargar los camposantos. Verifique la conexión con el servidor.';
        this.cargando = false;
      },
    });
  }

  /** Búsqueda en tiempo real por difunto, solicitante o sector + filtro de estado. */
  get registrosFiltrados(): Camposanto[] {
    const termino = (this.busqueda ?? '').trim().toLowerCase();

    return this.registros.filter((registro) => {
      if (
        this.filtroEstado !== 'Todos' &&
        registro.estado !== this.filtroEstado
      ) {
        return false;
      }

      if (!termino) {
        return true;
      }

      const texto = [
        registro.apellido_difunto,
        registro.nombre_difunto,
        registro.apellido_paterno,
        registro.apellido_materno,
        registro.nombres,
        registro.solicitante,
        registro.sector_camposanto,
        registro.observaciones,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return texto.includes(termino);
    });
  }

  limpiarBusqueda(): void {
    this.busqueda = '';
    this.filtroEstado = 'Todos';
  }

  nuevoCamposanto(): void {
    this.editandoId = null;
    this.formulario = this.formularioVacio();
    this.errorFormulario = '';
    this.mensajeExito = '';
    this.mostrarFormulario = true;
  }

  editar(registro: Camposanto): void {
    this.editandoId = registro.id;
    this.formulario = {
      sector_camposanto: registro.sector_camposanto ?? '',
      fila: registro.fila ?? null,
      columna: registro.columna ?? null,
      apellido_paterno: registro.apellido_paterno ?? '',
      apellido_materno: registro.apellido_materno ?? '',
      nombres: registro.nombres ?? '',
      fecha_defuncion: registro.fecha_defuncion ?? '',
      solicitante: registro.solicitante ?? '',
      telefono_solicitante: registro.telefono_solicitante ?? '',
      resolucion: registro.resolucion ?? '',
      estado: registro.estado,
      es_perpetuo: registro.es_perpetuo === true,
      plazo_anios: registro.plazo_anios ?? null,
      monto_contrato_bs: registro.monto_contrato_bs ?? null,
      observaciones: registro.observaciones ?? '',
    };
    this.errorFormulario = '';
    this.mensajeExito = '';
    this.mostrarFormulario = true;
  }

  cancelarFormulario(): void {
    this.mostrarFormulario = false;
    this.editandoId = null;
    this.errorFormulario = '';
  }

  guardar(): void {
    const datos = this.formulario;
    const sector = datos.sector_camposanto.trim();
    const apellido = datos.apellido_paterno.trim();
    const nombres = datos.nombres.trim();

    if (!sector && !apellido && !nombres) {
      this.errorFormulario =
        'Ingrese al menos el sector, el apellido o los nombres del difunto.';
      return;
    }

    if ((apellido || nombres) && !datos.fecha_defuncion) {
      this.errorFormulario =
        'Indique la fecha de defunción o entierro del difunto.';
      return;
    }

    if (!datos.es_perpetuo && datos.plazo_anios === null) {
      this.errorFormulario =
        'Indique el plazo en años o marque el régimen perpetuo.';
      return;
    }

    if (
      datos.es_perpetuo &&
      (apellido || nombres) &&
      !datos.resolucion.trim()
    ) {
      this.errorFormulario =
        'La N° de Resolución Administrativa (RA.) es obligatoria para concesiones perpetuas.';
      return;
    }

    this.guardando = true;
    this.errorFormulario = '';

    const cuerpo = this.cuerpoFormulario();

    const peticion = this.editandoId
      ? this.http.patch(`${API_URL}/catastro/nichos/${this.editandoId}`, cuerpo)
      : this.http.post(`${API_URL}/catastro/camposantos`, cuerpo);

    peticion.subscribe({
      next: () => {
        this.guardando = false;
        this.mostrarFormulario = false;
        this.mensajeExito = this.editandoId
          ? 'Camposanto actualizado correctamente.'
          : 'Nuevo camposanto registrado correctamente.';
        this.editandoId = null;
        this.cargar();
      },
      error: (err) => {
        console.error('Error al guardar el camposanto:', err);
        this.guardando = false;
        this.errorFormulario =
          err?.error?.message ??
          'No se pudo guardar el camposanto. Verifique los datos e intente nuevamente.';
      },
    });
  }

  private cuerpoFormulario() {
    const datos = this.formulario;
    const numero = (valor: number | null): number | null =>
      valor === null || !Number.isFinite(Number(valor)) ? null : Number(valor);

    return {
      sector_camposanto: datos.sector_camposanto.trim(),
      fila: numero(datos.fila) ?? undefined,
      columna: numero(datos.columna) ?? undefined,
      apellido_paterno: datos.apellido_paterno.trim(),
      apellido_materno: datos.apellido_materno.trim(),
      nombres: datos.nombres.trim(),
      fecha_defuncion: datos.fecha_defuncion || null,
      fecha_vencimiento: this.fechaVencimiento,
      solicitante: datos.solicitante.trim(),
      telefono_solicitante: datos.telefono_solicitante.trim(),
      resolucion: datos.es_perpetuo ? datos.resolucion.trim() : null,
      estado: datos.estado,
      es_perpetuo: datos.es_perpetuo,
      plazo_anios: datos.es_perpetuo ? null : numero(datos.plazo_anios),
      monto_contrato_bs: numero(datos.monto_contrato_bs),
      observaciones: datos.observaciones.trim(),
    };
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
      ? formatearFechaCorta(fecha)
      : 'Indique la fecha de entierro y el plazo';
  }

  /** Fecha de entierro para mostrar: DD/MM/YYYY o el año histórico. */
  fechaEntierro(registro: Camposanto): string {
    if (registro.fecha_defuncion) {
      return formatearFechaCorta(registro.fecha_defuncion);
    }
    return registro.anio_defuncion ? String(registro.anio_defuncion) : '';
  }

  /** Redirige a Recaudación con los datos del titular, difunto y ubicación. */
  cobrarMantenimiento(registro: Camposanto): void {
    this.router.navigate(['/dashboard/recaudacion'], {
      queryParams: {
        modo: 'mantenimiento',
        difunto: this.nombreDifunto(registro),
        solicitante: registro.solicitante ?? '',
        ubicacion: this.ubicacion(registro),
        tipoEspacio: 'Camposanto',
        esPerpetuo: registro.es_perpetuo ? 'true' : 'false',
        estado: registro.estado,
      },
    });
  }

  nombreDifunto(registro: Camposanto | null): string {
    if (!registro) {
      return '';
    }
    return (
      [registro.nombre_difunto, registro.apellido_difunto]
        .filter(Boolean)
        .join(' ')
        .trim() || 'Sin registro'
    );
  }

  ubicacion(registro: Camposanto): string {
    const sector = registro.sector_camposanto || registro.codigo_lote || 'S/N';
    return `Camposanto ${sector} - Fila ${registro.fila}, Sitio ${registro.columna}`;
  }

  regimen(registro: Camposanto): string {
    if (registro.es_perpetuo) {
      return 'Perpetuo — sin vencimiento';
    }

    const plazo = Number(registro.plazo_anios);
    const vencimiento = Number(registro.anio_vencimiento);
    const partes: string[] = [];

    if (Number.isFinite(plazo) && plazo > 0) {
      partes.push(`${Math.trunc(plazo)} años`);
    }
    if (registro.fecha_vencimiento) {
      partes.push(`vence el ${formatearFechaCorta(registro.fecha_vencimiento)}`);
    } else if (Number.isFinite(vencimiento) && vencimiento > 0) {
      partes.push(`vence el año ${Math.trunc(vencimiento)}`);
    }

    return partes.length > 0 ? partes.join(' — ') : 'Sin plazo definido';
  }

  claseEstado(estado: string): string {
    return `estado-${(estado ?? '').toLowerCase()}`;
  }
}
