import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { jsPDF } from 'jspdf';

@Component({
  selector: 'app-recaudacion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recaudacion.component.html',
  styleUrl: './recaudacion.component.css'
})
export class RecaudacionComponent {
  costoBase: number | null = null;
  mesesRetraso: number | null = null;

  resultado: any = null;
  cargando: boolean = false;
  error: string = '';

  constructor(private http: HttpClient) {}

  calcularLiquidacion(): void {
    if (!this.costoBase || this.costoBase <= 0) {
      this.error = 'Por favor, ingrese un costo base válido mayor a 0.';
      return;
    }

    this.error = '';
    this.cargando = true;
    this.resultado = null;

    // Preparamos el cuerpo de la petición exactamente como lo probaste en la consola de PowerShell
    const body = {
      costoBase: this.costoBase,
      mesesRetraso: this.mesesRetraso || 0
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
      ['Costo base del nicho', this.formatear(r.costo_base_bs) + ' Bs.'],
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
