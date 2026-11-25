import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { jsPDF } from 'jspdf';

interface ConceptoTarifario {
  etiqueta: string;
  tarifa: number | null;
  gestiones: number;
  referencia: string;
}

@Component({
  selector: 'app-recaudacion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recaudacion.component.html',
  styleUrl: './recaudacion.component.css'
})
export class RecaudacionComponent {
  // Tarifario referencial oficial del GAM Vinto (montos de caja)
  readonly tarifario: ConceptoTarifario[] = [
    {
      etiqueta: 'Mantenimiento Anual — Mausoleo (60 Bs./año)',
      tarifa: 60,
      gestiones: 1,
      referencia: 'Tarifa referencial: 60 Bs. por año. El costo base es tarifa x gestiones.'
    },
    {
      etiqueta: 'Mantenimiento Anual — Perpetuo (25 Bs./año)',
      tarifa: 25,
      gestiones: 1,
      referencia: 'Tarifa referencial: 25 Bs. por año. El costo base es tarifa x gestiones.'
    },
    {
      etiqueta: 'Contrato de Arrendamiento — 5 años (320 Bs.)',
      tarifa: 320,
      gestiones: 1,
      referencia:
        'Contrato con vigencia de 5 años: los 320 Bs. son el monto global del contrato (no se multiplican por los 5 años).'
    },
    {
      etiqueta: 'Contrato de Arrendamiento — 30 años (4.000 Bs.)',
      tarifa: 4000,
      gestiones: 1,
      referencia:
        'Contrato con vigencia de 30 años: los 4.000 Bs. son el monto global del contrato (no se multiplican por los 30 años).'
    },
    {
      etiqueta: 'Tarifa Personalizada / Otro Concepto',
      tarifa: null,
      gestiones: 1,
      referencia: 'Ingrese libremente la tarifa y las gestiones según el caso atendido en caja.'
    }
  ];

  readonly conceptos = this.tarifario.map((c) => c.etiqueta);

  concepto: string = this.conceptos[0];
  gestiones: number | null = this.tarifario[0].gestiones;
  tarifaUnitaria: number | null = this.tarifario[0].tarifa;
  mesesRetraso: number | null = 0;
  notaConcepto: string = this.tarifario[0].referencia;

  // Datos congelados al momento de calcular, para el ticket y el PDF
  conceptoAplicado = '';
  gestionesAplicadas = 1;
  tarifaAplicada = 0;
  costoBase = 0;

  resultado: any = null;
  cargando: boolean = false;
  error: string = '';

  constructor(private http: HttpClient) {}

  // Autocompleta tarifa y gestiones según el concepto elegido; luego el
  // funcionario puede seguir editando ambos campos si hay una excepción.
  seleccionarConcepto(etiqueta: string): void {
    this.concepto = etiqueta;

    const item = this.tarifario.find((c) => c.etiqueta === etiqueta);
    if (!item) {
      return;
    }

    this.notaConcepto = item.referencia;

    if (item.tarifa !== null) {
      this.tarifaUnitaria = item.tarifa;
      this.gestiones = item.gestiones;
    }

    this.error = '';
  }

  calcularLiquidacion(): void {
    const tarifa = Number(this.tarifaUnitaria);
    const gestiones = Math.trunc(Number(this.gestiones));

    if (!Number.isFinite(tarifa) || tarifa <= 0) {
      this.error = 'Por favor, ingrese una tarifa unitaria válida mayor a 0.';
      return;
    }

    if (!Number.isFinite(gestiones) || gestiones < 1) {
      this.error = 'Indique al menos 1 gestión (año) a pagar.';
      return;
    }

    this.error = '';
    this.cargando = true;
    this.resultado = null;

    // El costo base es la tarifa fijada por el funcionario multiplicada por
    // las gestiones (años) que se están cobrando
    this.conceptoAplicado = this.concepto;
    this.gestionesAplicadas = gestiones;
    this.tarifaAplicada = tarifa;
    this.costoBase = tarifa * gestiones;

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

  // Genera y descarga el estado de cuenta en PDF, listo para imprimir.
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
    doc.text('ESTADO DE CUENTA / PRE-LIQUIDACIÓN', margen, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text('Fecha de emisión: ' + new Date().toLocaleString('es-BO'), margen, y);
    doc.setTextColor(0);
    y += 12;

    // Desglose tributario
    const filas: Array<[string, string]> = [
      ['Concepto', this.conceptoAplicado],
      ['Gestiones / Años pagados', String(this.gestionesAplicadas)],
      ['Tarifa unitaria', this.formatear(this.tarifaAplicada) + ' Bs.'],
      ['Costo base (tarifa x gestiones)', this.formatear(r.costo_base_bs) + ' Bs.'],
      ['Meses de retraso (mora)', String(r.meses_retraso ?? 0)],
      ['Multa aplicada', this.formatear(r.multa_bs) + ' Bs.'],
      ['Interés generado', this.formatear(r.interes_bs) + ' Bs.']
    ];

    doc.setFontSize(11);
    filas.forEach(([etiqueta, valor]) => {
      doc.text(etiqueta, margen, y);
      doc.text(valor, derecha, y, { align: 'right' });
      doc.setDrawColor(215);
      doc.setLineWidth(0.2);
      doc.line(margen, y + 2.5, derecha, y + 2.5);
      y += 9;
    });

    // Totales
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('TOTAL A PAGAR (Bs.)', margen, y);
    doc.text(this.formatear(r.total_pagar_bs) + ' Bs.', derecha, y, { align: 'right' });
    y += 8;
    doc.setFontSize(11);
    doc.text('EQUIVALENTE EN UFV', margen, y);
    doc.text(this.formatear(r.total_pagar_ufv) + ' UFV', derecha, y, { align: 'right' });

    // Pie de página
    y += 16;
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

    const fecha = new Date().toISOString().slice(0, 10);
    doc.save('estado-cuenta-' + fecha + '.pdf');
  }

  private formatear(valor: unknown): string {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero.toFixed(2) : '0.00';
  }
}
