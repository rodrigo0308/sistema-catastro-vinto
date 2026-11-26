import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        {
          provide: HttpClient,
          useValue: {
            get: () =>
              of({
                totalCriticos: 0,
                totalAdvertencias: 0,
                totalPerpetuos: 0,
                totalAlertas: 0,
                alertas: [],
              }),
            post: () => of({}),
          },
        },
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('debería alternar el sidebar', () => {
    expect(component.isCollapsed).toBeFalse();
    component.toggleSidebar();
    expect(component.isCollapsed).toBeTrue();
  });
});
