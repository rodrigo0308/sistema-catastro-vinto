import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { CatastroComponent } from './catastro.component';

describe('CatastroComponent', () => {
  let component: CatastroComponent;
  let routerMock: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    routerMock = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [CatastroComponent],
      providers: [
        {
          provide: HttpClient,
          useValue: {
            get: jasmine.createSpy('get').and.returnValue(of({})),
          },
        },
        { provide: Router, useValue: routerMock },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(convertToParamMap({})),
            snapshot: { queryParamMap: convertToParamMap({}) },
          },
        },
      ],
    }).compileComponents();

    // No se ejecuta detectChanges para no inicializar Leaflet (ngAfterViewInit).
    component = TestBed.createComponent(CatastroComponent).componentInstance;
  });

  it('debería instanciarse con sus dependencias mockeadas', () => {
    expect(component).toBeTruthy();
    expect(component.panelAbierto).toBeFalse();
    expect(component.resultados).toEqual([]);
  });

  it('debería componer el nombre del difunto', () => {
    expect(
      component.nombreDifunto({
        nombre_difunto: 'Juan',
        apellido_difunto: 'Mamani Choque',
      } as any),
    ).toBe('Juan Mamani Choque');
    expect(component.nombreDifunto(null)).toBe('');
  });

  it('debería describir el régimen del nicho', () => {
    expect(
      component.regimenNicho({
        es_perpetuo: true,
        plazo_anios: null,
        anio_vencimiento: null,
      } as any),
    ).toBe('Perpetuo — sin vencimiento');

    expect(
      component.regimenNicho({
        es_perpetuo: false,
        plazo_anios: 5,
        anio_vencimiento: 2025,
      } as any),
    ).toBe('5 años — vence el año 2025');
  });
});
