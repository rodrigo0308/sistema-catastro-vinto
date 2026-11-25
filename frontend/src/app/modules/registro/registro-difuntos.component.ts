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
  }
}
