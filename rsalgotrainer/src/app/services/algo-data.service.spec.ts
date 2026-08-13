import { TestBed } from '@angular/core/testing';

import { AlgoDataService } from './algo-data.service';

describe('AlgoDataService', () => {
  let service: AlgoDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AlgoDataService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
