import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';

import { RegistroDifuntosComponent } from './registro-difuntos.component';

describe('RegistroDifuntosComponent', () => {
  let component: RegistroDifuntosComponent;
  let fixture: ComponentFixture<RegistroDifuntosComponent>;
  let routerMock: jasmine.SpyObj<Router>;

  const params: Record<string, string> = {
    predioId: 'predio-5b',
    bloque: '5-B',
    fila: '3',
    columna: '2',
  };

  beforeEach(async () => {
    routerMock = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [RegistroDifuntosComponent],
      providers: [
        {
          provide: HttpClient,
          useValue: {
            get: jasmine.createSpy('get').and.returnValue(of([])),
            post: jasmine.createSpy('post').and.returnValue(of({})),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (clave: string) => params[clave] ?? null,
              },
            },
          },
        },
        { provide: Router, useValue: routerMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RegistroDifuntosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('debería crear el componente', () => {
    expect(component).toBeTruthy();
  });

  it('debería preseleccionar bloque, fila y columna desde los queryParams', () => {
    expect(component.formulario.predio_id).toBe('predio-5b');
    expect(component.formulario.fila).toBe(3);
    expect(component.formulario.columna).toBe(2);
  });

  it('debería calcular el vencimiento de un contrato temporal', () => {
    component.formulario.es_perpetuo = false;
    component.formulario.anio_defuncion = 2020;
    component.formulario.plazo_anios = 5;

    expect(component.anioVencimiento).toBe(2025);

    component.formulario.plazo_anios = 30;
    expect(component.anioVencimiento).toBe(2050);
  });

  it('no debería calcular vencimiento para un contrato perpetuo', () => {
    component.formulario.es_perpetuo = true;
    component.formulario.anio_defuncion = 2020;
    component.formulario.plazo_anios = null;

    expect(component.anioVencimiento).toBeNull();
  });

  it('debería aplicar el monto y plazo del régimen seleccionado', () => {
    component.seleccionarRegimen('Temporal — 5 años (Ref. 320 Bs.)');

    expect(component.formulario.plazo_anios).toBe(5);
    expect(component.formulario.monto_contrato_bs).toBe(320);
    expect(component.formulario.es_perpetuo).toBeFalse();
  });

  it('debería limpiar el plazo y monto al elegir Perpetuo', () => {
    component.formulario.plazo_anios = 30;
    component.formulario.monto_contrato_bs = 4000;

    component.seleccionarRegimen('Perpetuo (Mantenimiento anual)');

    expect(component.formulario.es_perpetuo).toBeTrue();
    expect(component.formulario.plazo_anios).toBeNull();
    expect(component.formulario.monto_contrato_bs).toBeNull();
    expect(component.formulario.regimen).toBe('Perpetuo (Mantenimiento anual)');
  });
});
