import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AlgoeditorComponent } from './algoeditor.component';

describe('AlgoeditorComponent', () => {
  let component: AlgoeditorComponent;
  let fixture: ComponentFixture<AlgoeditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlgoeditorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AlgoeditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
