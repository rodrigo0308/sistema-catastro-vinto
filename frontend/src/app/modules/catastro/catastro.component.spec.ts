import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CatastroComponent } from './catastro.component';

describe('CatastroComponent', () => {
  let component: CatastroComponent;
  let fixture: ComponentFixture<CatastroComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CatastroComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CatastroComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
