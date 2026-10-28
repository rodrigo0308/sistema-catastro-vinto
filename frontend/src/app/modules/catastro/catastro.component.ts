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
    // Inicializamos el mapa centrado en Vinto con restricciones de zoom
    this.map = L.map('mapa-catastro', {
      minZoom: 14,
      maxZoom: 18 // Evita que el usuario haga un zoom excesivo que rompa el mapa
    }).setView([-17.398, -66.315], 16);

    // NUEVO: Capa Satelital de Alta Resolución (ESRI)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
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
            
            // Le damos un borde más grueso (weight) para que resalte sobre el satélite
            return { color: colorHex, weight: 3, fillOpacity: 0.7 };
          },
          onEachFeature: (feature, layer) => {
            layer.bindPopup(`
              <div style="font-family: Arial; text-align: center;">
                <b style="font-size: 1.1em; color: #2c3e50;">Lote: ${feature.properties.codigo_lote}</b><br>
                <span style="color: #7f8c8d;">Estado actual:</span><br>
                <b style="color: ${feature.properties.estado === 'Mora' ? '#f39c12' : '#2ecc71'};">${feature.properties.estado}</b>
              </div>
            `);
          }
        }).addTo(this.map);
      },
      error: (err) => console.error('Error al conectar con PostGIS:', err)
    });
  }
}