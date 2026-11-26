import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { jsPDF } from 'jspdf';

const API_URL = 'http://localhost:3000';

export type NivelAlerta = 'critico' | 'advertencia' | 'info';

export interface Alerta {
  id: string;
  nivel: NivelAlerta;
  motivo: string;
  difunto: string;
  solicitante: string | null;
  telefono_solicitante: string | null;
  tipo_espacio: string | null;
  ubicacion: string;
  codigo_lote?: string | null;
  sector_camposanto?: string | null;
  fila?: number;
  columna?: number;
  anio_vencimiento: number | null;
  es_perpetuo: boolean;
  estado: string;
}

interface RespuestaAlertas {
  anio_actual: number;
  totalCriticos: number;
  totalAdvertencias: number;
  totalPerpetuos: number;
  totalAlertas: number;
  alertas: Alerta[];
}

type FiltroNivel = 'todos' | NivelAlerta;

/**
 * Centro de alertas: vencimientos de contratos, cuentas en mora y control
 * del mantenimiento anual de los contratos perpetuos. Permite notificar al
 * familiar por WhatsApp, emitir un aviso PDF y liquidar en caja.
 */
@Component({
  selector: 'app-notificaciones',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './notificaciones.component.html',
  styleUrl: './notificaciones.component.css',
})
export class NotificacionesComponent implements OnInit {
  alertas: Alerta[] = [];
  totalCriticos = 0;
  totalAdvertencias = 0;
  totalPerpetuos = 0;
  totalAlertas = 0;
  anioActual = new Date().getFullYear();

  cargando = false;
  error = '';
  aviso = '';

  busqueda = '';
  filtro: FiltroNivel = 'todos';

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando = true;
    this.error = '';

    this.http.get<RespuestaAlertas>(`${API_URL}/catastro/alertas`).subscribe({
      next: (respuesta) => {
        this.alertas = respuesta?.alertas ?? [];
        this.totalCriticos = Number(respuesta?.totalCriticos) || 0;
        this.totalAdvertencias = Number(respuesta?.totalAdvertencias) || 0;
        this.totalPerpetuos = Number(respuesta?.totalPerpetuos) || 0;
        this.totalAlertas = Number(respuesta?.totalAlertas) || this.alertas.length;
        this.anioActual = Number(respuesta?.anio_actual) || this.anioActual;
        this.cargando = false;
      },
      error: (err) => {
        console.error('Error al cargar las notificaciones:', err);
        this.error =
          'No se pudieron cargar las alertas. Verifique la conexión con el servidor.';
        this.cargando = false;
      },
    });
  }

  /** Filtro por nivel + búsqueda por apellido del difunto o solicitante. */
  get alertasFiltradas(): Alerta[] {
    const termino = (this.busqueda ?? '').trim().toLowerCase();

    return this.alertas.filter((alerta) => {
      if (this.filtro !== 'todos' && alerta.nivel !== this.filtro) {
        return false;
      }

      if (!termino) {
        return true;
      }

      const texto = [alerta.difunto, alerta.solicitante, alerta.ubicacion]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return texto.includes(termino);
    });
  }

  cambiarFiltro(filtro: FiltroNivel): void {
    this.filtro = filtro;
  }

  limpiarFiltros(): void {
    this.busqueda = '';
    this.filtro = 'todos';
  }

  etiquetaNivel(alerta: Alerta): string {
    if (alerta.nivel === 'critico') {
      return 'Crítico / Mora';
    }
    if (alerta.nivel === 'advertencia') {
      return 'Por vencer';
    }
    return 'Perpetuo';
  }

  regimen(alerta: Alerta): string {
    if (alerta.es_perpetuo) {
      return 'Perpetuo — sin vencimiento';
    }
    if (alerta.anio_vencimiento) {
      return `Temporal — vence el año ${alerta.anio_vencimiento}`;
    }
    return 'Temporal — sin vencimiento registrado';
  }

  // ---------- 1. Notificación por WhatsApp ----------

  notificarWhatsApp(alerta: Alerta): void {
    const telefono = this.limpiarTelefono(alerta.telefono_solicitante);

    if (!telefono) {
      this.aviso = `El registro de ${alerta.difunto} no tiene un teléfono de solicitante válido. Edite el registro en el Geovisor o en Camposantos para agregarlo.`;
      return;
    }

    this.aviso = '';

    const mensaje = this.mensajeWhatsApp(alerta);
    const url = `https://wa.me/591${telefono}?text=${encodeURIComponent(mensaje)}`;

    window.open(url, '_blank');
  }

  /** Deja solo dígitos y quita el prefijo país 591 si ya viene incluido. */
  private limpiarTelefono(telefono: string | null): string {
    const digitos = (telefono ?? '').replace(/\D/g, '');

    if (!digitos) {
      return '';
    }

    return digitos.startsWith('591') && digitos.length > 8
      ? digitos.slice(3)
      : digitos;
  }

  private situacion(alerta: Alerta): string {
    if (alerta.nivel === 'critico') {
      return 'EN MORA / CON CONTRATO VENCIDO';
    }
    if (alerta.nivel === 'advertencia') {
      return 'PRÓXIMO A VENCER';
    }
    return 'con mantenimiento anual perpetuo pendiente de pago';
  }

  private mensajeWhatsApp(alerta: Alerta): string {
    const titular = alerta.solicitante || 'Titular / Familiar responsable';
    const vencimiento = alerta.anio_vencimiento
      ? ` Año de vencimiento del contrato: ${alerta.anio_vencimiento}.`
      : '';

    return (
      `Estimado(a) ${titular}:\n\n` +
      `El Gobierno Autónomo Municipal de Vinto, a través de la Unidad de Recaudaciones, le informa que el registro funerario del difunto ${alerta.difunto}, ubicado en ${alerta.ubicacion}, se encuentra ${this.situacion(alerta)}.\n\n` +
      `Detalle: ${alerta.motivo}.${vencimiento}\n\n` +
      `Se solicita apersonarse a la Unidad de Recaudaciones del GAM Vinto para regularizar el pago y evitar recargos o la aplicación de la normativa municipal vigente.\n\n` +
      `Gestión ${this.anioActual} — Cementerio Municipal de Vinto.`
    );
  }

  // ---------- 2. Aviso PDF ----------

  exportarPdf(alerta: Alerta): void {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const ancho = doc.internal.pageSize.getWidth();
    const margen = 20;
    const derecha = ancho - margen;
    let y = 22;

    const saltoPagina = (espacio = 10) => {
      if (y + espacio > 270) {
        doc.addPage();
        y = 25;
      }
    };

    const parrafo = (texto: string, tamano = 9.5) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(tamano);
      const lineas = doc.splitTextToSize(texto, derecha - margen) as string[];
      saltoPagina(lineas.length * 5 + 4);
      doc.text(lineas, margen, y);
      y += lineas.length * 5 + 5;
    };

    const fila = (etiqueta: string, valor: string) => {
      saltoPagina(8);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(etiqueta, margen, y);
      doc.setFont('helvetica', 'normal');
      const lineas = doc.splitTextToSize(valor || '-', derecha - margen - 60) as string[];
      doc.text(lineas, margen + 60, y);
      y += Math.max(1, lineas.length) * 5 + 3;
      doc.setDrawColor(224, 228, 232);
      doc.setLineWidth(0.2);
      doc.line(margen, y - 1.5, derecha, y - 1.5);
    };

    // Encabezado institucional
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('GOBIERNO AUTÓNOMO MUNICIPAL DE VINTO', ancho / 2, y, {
      align: 'center',
    });
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text('Unidad de Recaudaciones — Cementerio Municipal', ancho / 2, y, {
      align: 'center',
    });
    y += 4;
    doc.setDrawColor(44, 62, 80);
    doc.setLineWidth(0.6);
    doc.line(margen, y, derecha, y);
    y += 12;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.text(
      'NOTIFICACIÓN PREVENTIVA DE VENCIMIENTO / COBRANZA',
      ancho / 2,
      y,
      { align: 'center' },
    );
    y += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(
      `Ref. NOT-ALR/${this.anioActual}/${String(alerta.id)
        .slice(0, 8)
        .toUpperCase()}`,
      margen,
      y,
    );
    doc.text(
      `Vinto, ${new Date().toLocaleDateString('es-BO')}`,
      derecha,
      y,
      { align: 'right' },
    );
    y += 12;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(
      `Sr(a). ${alerta.solicitante || 'Titular / Familiar responsable'}`,
      margen,
      y,
    );
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text('Presente.-', margen, y);
    y += 10;

    parrafo(
      `Por medio de la presente, el Gobierno Autónomo Municipal de Vinto, a través de la Unidad de Recaudaciones, comunica a usted que el registro funerario del difunto ${alerta.difunto}, ubicado en ${alerta.ubicacion}, presenta la siguiente situación: ${alerta.motivo}.`,
    );

    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('DETALLE DEL REGISTRO', margen, y);
    y += 7;

    fila('Difunto', alerta.difunto);
    fila('Titular / Solicitante', alerta.solicitante || 'Sin registro');
    fila('Ubicación', alerta.ubicacion);
    fila('Tipo de espacio', alerta.tipo_espacio || 'Nicho');
    fila('Régimen del contrato', this.regimen(alerta));
    fila('Estado del registro', alerta.estado);
    fila('Situación detectada', alerta.motivo);

    y += 5;
    parrafo(
      `Se solicita a usted apersonarse a la Unidad de Recaudaciones del GAM Vinto, en un plazo de quince (15) días hábiles a partir de la recepción de la presente, portando su cédula de identidad y los documentos que acrediten su relación con el registro funerario, a fin de regularizar la situación y evitar la aplicación de recargos, multas o las acciones previstas en la normativa municipal vigente.`,
    );
    parrafo(
      'La presente notificación es de carácter preventivo y no constituye una sanción; su finalidad es resguardar la correcta administración del Cementerio Municipal de Vinto y los derechos de los familiares.',
    );

    y += 10;
    saltoPagina(40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Atentamente,', margen, y);
    y += 26;

    doc.setDrawColor(80);
    doc.setLineWidth(0.3);
    doc.line(margen, y, margen + 65, y);
    doc.line(derecha - 65, y, derecha, y);
    doc.setFontSize(8.5);
    doc.text('Funcionario de Recaudaciones', margen + 32.5, y + 5, {
      align: 'center',
    });
    doc.text('Encargado del Cementerio', derecha - 32.5, y + 5, {
      align: 'center',
    });
    doc.text('GAM Vinto', margen + 32.5, y + 10, { align: 'center' });
    doc.text('GAM Vinto', derecha - 32.5, y + 10, { align: 'center' });

    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text(
      'Documento generado automáticamente por el Sistema de Catastro y Recaudación — GAM Vinto.',
      margen,
      285,
    );

    const nombreArchivo = (alerta.difunto || 'registro')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();

    doc.save(`notificacion-${nombreArchivo || 'registro'}-${this.anioActual}.pdf`);
  }

  // ---------- 3. Liquidación en caja ----------

  liquidarEnCaja(alerta: Alerta): void {
    this.router.navigate(['/dashboard/recaudacion'], {
      queryParams: {
        modo: 'mantenimiento',
        difunto: alerta.difunto,
        solicitante: alerta.solicitante ?? '',
        ubicacion: alerta.ubicacion,
        tipoEspacio: alerta.tipo_espacio ?? 'Nicho',
        esPerpetuo: alerta.es_perpetuo ? 'true' : 'false',
        estado: alerta.estado,
      },
    });
  }
}
