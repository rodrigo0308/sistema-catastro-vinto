import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

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
}