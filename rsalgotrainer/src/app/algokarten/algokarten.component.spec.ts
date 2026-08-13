import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AlgokartenComponent } from './algokarten.component';

describe('AlgokartenComponent', () => {
  let component: AlgokartenComponent;
  let fixture: ComponentFixture<AlgokartenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlgokartenComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AlgokartenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
