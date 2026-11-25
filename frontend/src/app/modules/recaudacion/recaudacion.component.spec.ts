import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';

import { RecaudacionComponent } from './recaudacion.component';

describe('RecaudacionComponent', () => {
  let component: RecaudacionComponent;
  let fixture: ComponentFixture<RecaudacionComponent>;
  let httpMock: jasmine.SpyObj<HttpClient>;

  const respuestaTributario = {
    detalle: 'Liquidación de deuda tributaria estandarizada',
    costo_base_bs: 0,
    meses_retraso: 0,
    multa_bs: 0,
    interes_bs: 0,
    total_pagar_bs: 0,
    total_pagar_ufv: 0,
    parametros_aplicados: { ufv: 2.5, gestion: 2026 },
  };

  const routeStub = {
    snapshot: {
      queryParamMap: {
        get: (_clave: string) => null,
      },
    },
  };

  beforeEach(async () => {
    httpMock = jasmine.createSpyObj<HttpClient>('HttpClient', ['get', 'post']);
    httpMock.post.and.returnValue(of(respuestaTributario));

    await TestBed.configureTestingModule({
      imports: [RecaudacionComponent],
      providers: [
        { provide: HttpClient, useValue: httpMock },
        { provide: ActivatedRoute, useValue: routeStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RecaudacionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('debería crear el componente', () => {
    expect(component).toBeTruthy();
  });

  it('debería exponer el tarifario referencial del GAM Vinto', () => {
    const tarifas = component.tarifario.map((c) => [c.etiqueta, c.tarifa]);

    expect(tarifas).toContain([
      'Mantenimiento Anual — Mausoleo (60 Bs./año)',
      60,
    ]);
    expect(tarifas).toContain([
      'Mantenimiento Anual — Perpetuo (25 Bs./año)',
      25,
    ]);
    expect(tarifas).toContain([
      'Contrato de Arrendamiento — 5 años (320 Bs.)',
      320,
    ]);
    expect(tarifas).toContain([
      'Contrato de Arrendamiento — 30 años (4.000 Bs.)',
      4000,
    ]);
  });

  it('debería seleccionar el mantenimiento de Mausoleo (60 Bs./año)', () => {
    component.seleccionarConcepto(
      'Mantenimiento Anual — Mausoleo (60 Bs./año)',
    );

    expect(component.modoActual).toBe('mantenimiento');
    expect(component.tarifaUnitaria).toBe(60);
    expect(component.gestiones).toBe(1);
    expect(component.costoPreview).toBe(60);
  });

  it('debería seleccionar el mantenimiento Perpetuo (25 Bs./año)', () => {
    component.seleccionarConcepto(
      'Mantenimiento Anual — Perpetuo (25 Bs./año)',
    );

    expect(component.modoActual).toBe('mantenimiento');
    expect(component.tarifaUnitaria).toBe(25);
    expect(component.esPerpetuo).toBeTrue();
    expect(component.costoPreview).toBe(25);
  });

  it('debería seleccionar el contrato de 5 años (320 Bs.)', () => {
    component.seleccionarConcepto(
      'Contrato de Arrendamiento — 5 años (320 Bs.)',
    );

    expect(component.modoActual).toBe('contrato');
    expect(component.tarifaUnitaria).toBe(320);
    expect(component.plazoAnios).toBe(5);
    expect(component.costoPreview).toBe(320);
  });

  it('debería seleccionar el contrato de 30 años (4.000 Bs.)', () => {
    component.seleccionarConcepto(
      'Contrato de Arrendamiento — 30 años (4.000 Bs.)',
    );

    expect(component.modoActual).toBe('contrato');
    expect(component.tarifaUnitaria).toBe(4000);
    expect(component.plazoAnios).toBe(30);
    expect(component.costoPreview).toBe(4000);
  });

  it('no debería multiplicar el monto global del contrato por los años', () => {
    component.seleccionarConcepto(
      'Contrato de Arrendamiento — 30 años (4.000 Bs.)',
    );
    component.gestiones = 30;

    // La vista previa tampoco multiplica en los contratos.
    expect(component.costoPreview).toBe(4000);

    component.calcularLiquidacion();

    expect(httpMock.post).toHaveBeenCalledWith(
      'http://localhost:3000/tributario/liquidar',
      { costoBase: 4000, mesesRetraso: 0 },
    );
  });

  it('debería multiplicar tarifa x gestiones en mantenimiento', () => {
    component.seleccionarConcepto(
      'Mantenimiento Anual — Mausoleo (60 Bs./año)',
    );
    component.gestiones = 3;

    expect(component.costoPreview).toBe(180);

    component.calcularLiquidacion();

    expect(httpMock.post).toHaveBeenCalledWith(
      'http://localhost:3000/tributario/liquidar',
      { costoBase: 180, mesesRetraso: 0 },
    );
  });

  it('debería rechazar el cálculo sin tarifa válida', () => {
    component.seleccionarConcepto('Tarifa Personalizada / Otro Concepto');
    component.tarifaUnitaria = null;

    component.calcularLiquidacion();

    expect(httpMock.post).not.toHaveBeenCalled();
    expect(component.error).toContain('tarifa');
  });
});
