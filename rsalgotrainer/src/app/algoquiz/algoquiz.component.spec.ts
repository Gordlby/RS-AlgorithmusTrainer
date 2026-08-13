import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AlgoquizComponent } from './algoquiz.component';

describe('AlgoquizComponent', () => {
  let component: AlgoquizComponent;
  let fixture: ComponentFixture<AlgoquizComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlgoquizComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AlgoquizComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
