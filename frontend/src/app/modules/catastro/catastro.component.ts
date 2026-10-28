import { Component, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import * as L from 'leaflet';

@Component({
  selector: 'app-catastro',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './catastro.component.html',
  styleUrl: './catastro.component.css'
})
export class CatastroComponent implements AfterViewInit {
  private map!: L.Map;

  constructor(private http: HttpClient) {}

  ngAfterViewInit(): void {
    this.iniciarMapa();
    this.cargarPrediosEspaciales();
  }

  private iniciarMapa(): void {
    this.map = L.map('mapa-catastro').setView([-17.398, -66.315], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);
  }

  private cargarPrediosEspaciales(): void {
    this.http.get('http://localhost:3000/catastro/mapa').subscribe({
      next: (geojsonData: any) => {
        L.geoJSON(geojsonData, {
          style: (feature) => {
            const estado = feature?.properties?.estado;
            let colorHex = '#2ecc71'; // Verde (Libre)
            if (estado === 'Ocupado') colorHex = '#e74c3c'; // Rojo
            if (estado === 'Mora') colorHex = '#f39c12'; // Naranja
            return { color: colorHex, weight: 2, fillOpacity: 0.6 };
          },
          onEachFeature: (feature, layer) => {
            layer.bindPopup(`
              <b>Lote:</b> ${feature.properties.codigo_lote}<br>
              <b>Estado:</b> ${feature.properties.estado}
            `);
          }
        }).addTo(this.map);
      },
      error: (err) => console.error('Error al conectar con PostGIS:', err)
    });
  }
}