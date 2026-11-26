import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { jsPDF } from 'jspdf';

type ModoConcepto = 'mantenimiento' | 'contrato' | 'libre';

interface ConceptoTarifario {
  etiqueta: string;
  modo: ModoConcepto;
  tarifa: number | null;
  gestiones: number;
  plazo: number | null;
  referencia: string;
}

@Component({
  selector: 'app-recaudacion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recaudacion.component.html',
  styleUrl: './recaudacion.component.css'
})
export class RecaudacionComponent implements AfterViewInit {
  /** Campo de gestiones, para enfocarlo cuando se llega desde el Geovisor. */
  @ViewChild('gestionesInput') gestionesInput?: ElementRef<HTMLInputElement>;

  // Tarifario referencial oficial del GAM Vinto (montos de caja)
  readonly tarifario: ConceptoTarifario[] = [
    {
      etiqueta: 'Contrato de Arrendamiento — 5 años (320 Bs.)',
      modo: 'contrato',
      tarifa: 320,
      gestiones: 1,
      plazo: 5,
      referencia:
        'Contrato con vigencia de 5 años: los 320 Bs. son el monto global del contrato (no se multiplican por los años).'
    },
    {
      etiqueta: 'Contrato de Arrendamiento — 30 años (4.000 Bs.)',
      modo: 'contrato',
      tarifa: 4000,
      gestiones: 1,
      plazo: 30,
      referencia:
        'Contrato con vigencia de 30 años: los 4.000 Bs. son el monto global del contrato (no se multiplican por los años).'
    },
    {
      etiqueta: 'Contrato de Arrendamiento — Plazo Personalizado (Precio libre)',
      modo: 'contrato',
      tarifa: null,
      gestiones: 1,
      plazo: null,
      referencia:
        'Escriba los años de vigencia y el precio acordado. El monto es global: no se multiplica por los años.'
    },
    {
      etiqueta: 'Mantenimiento Anual — Mausoleo (60 Bs./año)',
      modo: 'mantenimiento',
      tarifa: 60,
      gestiones: 1,
      plazo: null,
      referencia: 'Tarifa referencial: 60 Bs. por año. El cobro es tarifa x gestiones.'
    },
    {
      etiqueta: 'Mantenimiento Anual — Perpetuo (25 Bs./año)',
      modo: 'mantenimiento',
      tarifa: 25,
      gestiones: 1,
      plazo: null,
      referencia: 'Tarifa referencial: 25 Bs. por año. El cobro es tarifa x gestiones.'
    },
    {
      etiqueta: 'Tarifa Personalizada / Otro Concepto',
      modo: 'libre',
      tarifa: null,
      gestiones: 1,
      plazo: null,
      referencia: 'Ingrese libremente la tarifa y las gestiones según el caso atendido en caja.'
    }
  ];

  readonly conceptos = this.tarifario.map((c) => c.etiqueta);
  readonly tiposEspacio = ['Nicho', 'Mausoleo', 'Camposanto'];

  concepto: string = this.conceptos[0];
  gestiones: number | null = 1;
  tarifaUnitaria: number | null = 320;
  mesesRetraso: number | null = 0;
  notaConcepto: string = this.tarifario[0].referencia;

  // Datos del contrato (se prellenan desde el Registro de Difuntos)
  titular = '';
  difunto = '';
  ubicacion = '';
  tipoEspacio = 'Nicho';
  plazoAnios: number | null = 5;
  esPerpetuo = false;
  anioVencimiento: number | null = null;
  desdeRegistro = false;
  desdeMantenimiento = false;
  estadoOrigen = '';

  // Vínculo con la celda del catastro y estado del trámite de caja
  nichoId = '';
  estadoTramite = '';
  confirmandoPago = false;
  mensajePago = '';
  errorPago = '';

  // Datos congelados al momento de calcular, para el ticket y el PDF
  conceptoAplicado = '';
  gestionesAplicadas = 1;
  tarifaAplicada = 0;
  costoBase = 0;
  esContratoAplicado = false;
  titularAplicado = '';
  difuntoAplicado = '';
  ubicacionAplicada = '';
  tipoEspacioAplicado = 'Nicho';
  vigenciaAplicada = '';

  resultado: any = null;
  cargando: boolean = false;
  error: string = '';

  constructor(
    private readonly http: HttpClient,
    private readonly route: ActivatedRoute
  ) {
    this.prellenarDesdeRegistro();
  }

  /** Enfoca las gestiones cuando el cobro viene de una celda del Geovisor. */
  ngAfterViewInit(): void {
    if (!this.desdeMantenimiento) {
      return;
    }

    // El campo vive dentro de un *ngIf: esperamos al siguiente ciclo.
    setTimeout(() => {
      this.gestionesInput?.nativeElement.focus();
      this.gestionesInput?.nativeElement.select();
    });
  }

  get modoActual(): ModoConcepto {
    return (
      this.tarifario.find((c) => c.etiqueta === this.concepto)?.modo ?? 'libre'
    );
  }

  /** El trámite ya fue cancelado en caja (espacio Ocupado / Vigente). */
  get pagoConfirmado(): boolean {
    return this.estadoTramite === 'Ocupado';
  }

  /** Leyenda oficial que se imprime en el contrato y la pre-liquidación. */
  get estadoTramiteTexto(): string {
    return this.pagoConfirmado
      ? 'CANCELADO EN CAJA'
      : 'PENDIENTE DE CANCELACIÓN EN CAJA MUNICIPAL';
  }

  get costoPreview(): number {
    const tarifa = Number(this.tarifaUnitaria) || 0;
    if (this.modoActual === 'contrato') {
      return tarifa;
    }
    return tarifa * (Number(this.gestiones) || 0);
  }

  /** Prellena el formulario con los queryParams enviados desde el registro. */
  private prellenarDesdeRegistro(): void {
    const params = this.route.snapshot.queryParamMap;

    // Vínculo con la celda del catastro: permite confirmar el pago en caja.
    this.nichoId = params.get('nichoId') ?? '';
    this.estadoTramite = params.get('estado') ?? '';

    // Cobro de mantenimiento anual desde una celda Ocupada / En Mora.
    if (params.get('modo') === 'mantenimiento') {
      this.prellenarMantenimiento();
      return;
    }

    const difunto = params.get('difunto') ?? '';
    const titular = params.get('solicitante') ?? '';
    const ubicacion = params.get('ubicacion') ?? '';
    const tipoEspacio = params.get('tipoEspacio') ?? '';
    const perpetuo = params.get('esPerpetuo') === 'true';

    const plazoRaw = Number(params.get('plazoAnios'));
    const plazo =
      Number.isFinite(plazoRaw) && plazoRaw > 0 ? Math.trunc(plazoRaw) : null;

    const montoRaw = Number(params.get('montoContrato'));
    const monto =
      Number.isFinite(montoRaw) && montoRaw > 0 ? montoRaw : null;

    const vencimientoRaw = Number(params.get('anioVencimiento'));
    const vencimiento =
      Number.isFinite(vencimientoRaw) && vencimientoRaw > 0
        ? Math.trunc(vencimientoRaw)
        : null;

    if (!difunto && !titular && !ubicacion && !monto) {
      return;
    }

    this.desdeRegistro = true;
    this.difunto = difunto;
    this.titular = titular;
    this.ubicacion = ubicacion;
    if (tipoEspacio) {
      this.tipoEspacio = tipoEspacio;
    }
    this.esPerpetuo = perpetuo;
    this.anioVencimiento = vencimiento;

    if (perpetuo) {
      this.seleccionarConcepto('Mantenimiento Anual — Perpetuo (25 Bs./año)');
      if (monto !== null) {
        this.tarifaUnitaria = monto;
      }
      this.plazoAnios = null;
      this.anioVencimiento = null;
      return;
    }

    this.plazoAnios = plazo;

    if (plazo === 5) {
      this.seleccionarConcepto('Contrato de Arrendamiento — 5 años (320 Bs.)');
    } else if (plazo === 30) {
      this.seleccionarConcepto(
        'Contrato de Arrendamiento — 30 años (4.000 Bs.)'
      );
    } else if (plazo !== null) {
      this.seleccionarConcepto(
        'Contrato de Arrendamiento — Plazo Personalizado (Precio libre)'
      );
    }

    if (monto !== null) {
      this.tarifaUnitaria = monto;
    }
  }

  /**
   * Prellena el cobro de mantenimiento con los datos de la celda del Geovisor
   * y elige la tarifa referencial según el tipo de espacio y el régimen.
   */
  private prellenarMantenimiento(): void {
    const params = this.route.snapshot.queryParamMap;

    const difunto = params.get('difunto') ?? '';
    const titular = params.get('solicitante') ?? '';
    const ubicacion = params.get('ubicacion') ?? '';
    const tipoEspacio = params.get('tipoEspacio') ?? '';
    const perpetuo = params.get('esPerpetuo') === 'true';

    if (!difunto && !titular && !ubicacion) {
      return;
    }

    this.desdeRegistro = true;
    this.desdeMantenimiento = true;
    this.estadoOrigen = params.get('estado') ?? '';
    this.difunto = difunto;
    this.titular = titular;
    this.ubicacion = ubicacion;
    if (tipoEspacio) {
      this.tipoEspacio = tipoEspacio;
    }
    this.esPerpetuo = perpetuo;
    this.plazoAnios = null;
    this.anioVencimiento = null;

    if (perpetuo) {
      this.seleccionarConcepto('Mantenimiento Anual — Perpetuo (25 Bs./año)');
    } else if (tipoEspacio === 'Mausoleo') {
      this.seleccionarConcepto('Mantenimiento Anual — Mausoleo (60 Bs./año)');
    } else {
      // Nicho o camposanto: el encargado define la tarifa del mantenimiento.
      this.seleccionarConcepto('Tarifa Personalizada / Otro Concepto');
      this.tarifaUnitaria = null;
    }

    this.gestiones = 1;
  }

  // Autocompleta tarifa, gestiones y plazo según el concepto elegido; luego
  // el funcionario puede seguir editando los campos si hay una excepción.
  seleccionarConcepto(etiqueta: string): void {
    this.concepto = etiqueta;

    const item = this.tarifario.find((c) => c.etiqueta === etiqueta);
    if (!item) {
      return;
    }

    this.notaConcepto = item.referencia;
    this.esPerpetuo = etiqueta.includes('Perpetuo');

    if (item.tarifa !== null) {
      this.tarifaUnitaria = item.tarifa;
    }

    this.gestiones = item.gestiones;

    if (item.plazo !== null) {
      this.plazoAnios = item.plazo;
    } else if (item.modo === 'contrato') {
      this.plazoAnios = null;
    }

    this.error = '';
  }

  /** Texto informativo de vigencia para el ticket y el PDF. */
  private textoVigencia(): string {
    if (this.esPerpetuo) {
      return 'Perpetuo — sin vencimiento (mantenimiento anual)';
    }

    const plazo = Number(this.plazoAnios);
    if (!Number.isFinite(plazo) || plazo < 1) {
      return 'No especificado';
    }

    const anios = `${Math.trunc(plazo)} años`;
    return this.anioVencimiento
      ? `${anios} — vence el año ${this.anioVencimiento}`
      : anios;
  }

  calcularLiquidacion(): void {
    const tarifa = Number(this.tarifaUnitaria);
    const esContrato = this.modoActual === 'contrato';
    const gestiones = esContrato ? 1 : Math.trunc(Number(this.gestiones));

    if (!Number.isFinite(tarifa) || tarifa <= 0) {
      this.error = 'Por favor, ingrese una tarifa o monto de contrato válido mayor a 0.';
      return;
    }

    if (!Number.isFinite(gestiones) || gestiones < 1) {
      this.error = 'Indique al menos 1 gestión (año) a pagar.';
      return;
    }

    if (esContrato) {
      const plazo = Number(this.plazoAnios);
      if (!Number.isFinite(plazo) || plazo < 1) {
        this.error = 'Indique los años de vigencia del contrato.';
        return;
      }
    }

    this.error = '';
    this.cargando = true;
    this.resultado = null;

    // Contrato de arrendamiento: el precio fijado es el monto global y NO se
    // multiplica por los años de vigencia. Mantenimiento anual: tarifa x años.
    this.conceptoAplicado = this.concepto;
    this.gestionesAplicadas = gestiones;
    this.tarifaAplicada = tarifa;
    this.costoBase = esContrato ? tarifa : tarifa * gestiones;
    this.esContratoAplicado = esContrato;
    this.titularAplicado = this.titular.trim();
    this.difuntoAplicado = this.difunto.trim();
    this.ubicacionAplicada = this.ubicacion.trim();
    this.tipoEspacioAplicado = this.tipoEspacio;
    this.vigenciaAplicada = this.textoVigencia();

    const body = {
      costoBase: this.costoBase,
      mesesRetraso: Number(this.mesesRetraso) || 0
    };

    // Consumimos el endpoint de tu Motor Tributario en el Backend
    this.http.post('http://localhost:3000/tributario/liquidar', body).subscribe({
      next: (res) => {
        this.resultado = res;
        this.cargando = false;
      },
      error: (err) => {
        console.error('Error al calcular:', err);
        this.error = 'Ocurrió un error al conectar con el servidor. Verifique que el backend esté encendido.';
        this.cargando = false;
      }
    });
  }

  /** Confirma en el catastro que el contribuyente canceló el trámite en caja. */
  confirmarPagoEnCaja(): void {
    if (!this.nichoId || this.confirmandoPago) {
      return;
    }

    this.confirmandoPago = true;
    this.errorPago = '';
    this.mensajePago = '';

    this.http
      .patch(`http://localhost:3000/catastro/nichos/${this.nichoId}/confirmar-pago`, {})
      .subscribe({
        next: () => {
          this.confirmandoPago = false;
          this.estadoTramite = 'Ocupado';
          this.estadoOrigen = 'Ocupado';
          this.mensajePago =
            'Pago confirmado: el trámite figura como CANCELADO EN CAJA.';
        },
        error: (err) => {
          console.error('Error al confirmar el pago en caja:', err);
          this.confirmandoPago = false;
          this.errorPago =
            err?.error?.message ??
            'No se pudo confirmar el pago. Verifique la conexión con el servidor.';
        },
      });
  }

  // Genera y descarga el estado de cuenta / contrato en PDF, listo para caja.
  exportarPdf(): void {
    if (!this.resultado) {
      return;
    }

    const r = this.resultado;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const anchoPagina = doc.internal.pageSize.getWidth();
    const margen = 20;
    const derecha = anchoPagina - margen;
    let y = 22;

    // Encabezado institucional
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('GOBIERNO AUTÓNOMO MUNICIPAL DE VINTO', anchoPagina / 2, y, { align: 'center' });
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Sistema de Catastro y Recaudación - Cementerio Municipal', anchoPagina / 2, y, {
      align: 'center'
    });
    y += 4;
    doc.setDrawColor(44, 62, 80);
    doc.setLineWidth(0.6);
    doc.line(margen, y, derecha, y);
    y += 12;

    // Título del documento
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(
      this.esContratoAplicado
        ? 'CONTRATO DE ARRENDAMIENTO / ORDEN DE PAGO'
        : 'ESTADO DE CUENTA / PRE-LIQUIDACIÓN',
      margen,
      y
    );
    y += 6;

    // Estado del trámite: pendiente de caja o ya cancelado
    doc.setFontSize(9.5);
    doc.setTextColor(
      this.pagoConfirmado ? 21 : 185,
      this.pagoConfirmado ? 128 : 28,
      this.pagoConfirmado ? 61 : 28
    );
    doc.text('ESTADO DEL TRÁMITE: ' + this.estadoTramiteTexto, margen, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text('Fecha de emisión: ' + new Date().toLocaleString('es-BO'), margen, y);
    doc.setTextColor(0);
    y += 12;

    const escribirFilas = (filas: Array<[string, string]>) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      filas.forEach(([etiqueta, valor]) => {
        const texto = valor && valor.length > 0 ? valor : '-';
        const lineas = doc.splitTextToSize(texto, derecha - margen - 55) as string[];
        doc.text(etiqueta, margen, y);
        doc.text(lineas, derecha, y, { align: 'right' });
        y += Math.max(1, lineas.length) * 5 + 3;
        doc.setDrawColor(224);
        doc.setLineWidth(0.2);
        doc.line(margen, y - 1.5, derecha, y - 1.5);
      });
    };

    const tituloSeccion = (texto: string) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.text(texto, margen, y);
      y += 7;
    };

    // Datos del contrato
    const filasContrato: Array<[string, string]> = [];
    if (this.titularAplicado) {
      filasContrato.push(['Titular / Solicitante', this.titularAplicado]);
    }
    if (this.difuntoAplicado) {
      filasContrato.push(['Difunto', this.difuntoAplicado]);
    }
    if (this.ubicacionAplicada) {
      filasContrato.push(['Ubicación', this.ubicacionAplicada]);
    }
    filasContrato.push(['Tipo de Espacio', this.tipoEspacioAplicado]);
    filasContrato.push(['Plazo de Vigencia', this.vigenciaAplicada]);
    if (this.esContratoAplicado) {
      filasContrato.push([
        'Monto del Contrato',
        this.formatear(this.tarifaAplicada) + ' Bs. (monto global)'
      ]);
    }

    tituloSeccion('DATOS DEL CONTRATO');
    escribirFilas(filasContrato);

    // Desglose tributario
    y += 5;
    tituloSeccion('DESGLOSE TRIBUTARIO');
    escribirFilas([
      ['Concepto', this.conceptoAplicado],
      [
        'Gestiones / Años pagados',
        String(this.esContratoAplicado ? (this.plazoAnios ?? 1) : this.gestionesAplicadas)
      ],
      ['Tarifa / Precio fijado', this.formatear(this.tarifaAplicada) + ' Bs.'],
      ['Costo base (según concepto)', this.formatear(r.costo_base_bs) + ' Bs.'],
      ['Meses de retraso (mora)', String(r.meses_retraso ?? 0)],
      ['Multa aplicada', this.formatear(r.multa_bs) + ' Bs.'],
      ['Interés generado', this.formatear(r.interes_bs) + ' Bs.']
    ]);

    // Totales
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('TOTAL A PAGAR (Bs.)', margen, y);
    doc.text(this.formatear(r.total_pagar_bs) + ' Bs.', derecha, y, { align: 'right' });
    y += 8;
    doc.setFontSize(11);
    doc.text('EQUIVALENTE EN UFV', margen, y);
    doc.text(this.formatear(r.total_pagar_ufv) + ' UFV', derecha, y, { align: 'right' });

    // Pie de página
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(110);
    doc.text(
      'Parámetros aplicados: UFV ' +
        this.formatear(r.parametros_aplicados?.ufv) +
        ' - Gestión ' +
        (r.parametros_aplicados?.gestion ?? ''),
      margen,
      y
    );
    y += 5;
    doc.text(
      'Documento generado automáticamente por el Sistema de Catastro y Recaudación - GAM Vinto.',
      margen,
      y
    );

    // Bloque de firmas: orden de pago y constancia de contrato
    let yFirmas = Math.max(y + 26, 238);
    if (yFirmas > 258) {
      doc.addPage();
      yFirmas = 60;
    }

    doc.setTextColor(0);
    doc.setDrawColor(80);
    doc.setLineWidth(0.3);
    doc.line(margen, yFirmas, margen + 65, yFirmas);
    doc.line(derecha - 65, yFirmas, derecha, yFirmas);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Funcionario de Recaudaciones', margen + 32.5, yFirmas + 5, { align: 'center' });
    doc.text('Solicitante / Titular', derecha - 32.5, yFirmas + 5, { align: 'center' });

    const fecha = new Date().toISOString().slice(0, 10);
    doc.save(
      (this.esContratoAplicado ? 'contrato-' : 'estado-cuenta-') + fecha + '.pdf'
    );
  }

  private formatear(valor: unknown): string {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero.toFixed(2) : '0.00';
  }
}
