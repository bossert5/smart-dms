import type { ActivatedRouteSnapshot, DetachedRouteHandle } from '@angular/router';
import { DocumentsRouteReuseStrategy } from './documents-route-reuse.strategy';

function route(path: string, reuseDocumentsList = false): ActivatedRouteSnapshot {
  return {
    routeConfig: { path },
    data: reuseDocumentsList ? { reuseDocumentsList: true } : {},
  } as ActivatedRouteSnapshot;
}

describe('DocumentsRouteReuseStrategy', () => {
  it('stores and retrieves only the documents list route', () => {
    const strategy = new DocumentsRouteReuseStrategy();
    const documentsRoute = route('documents', true);
    const calendarRoute = route('calendar');
    const handle = { componentRef: {} } as DetachedRouteHandle;

    expect(strategy.shouldDetach(documentsRoute)).toBe(true);
    expect(strategy.shouldDetach(calendarRoute)).toBe(false);

    strategy.store(documentsRoute, handle);

    expect(strategy.shouldAttach(documentsRoute)).toBe(true);
    expect(strategy.retrieve(documentsRoute)).toBe(handle);
    expect(strategy.shouldAttach(calendarRoute)).toBe(false);
    expect(strategy.retrieve(calendarRoute)).toBeNull();
  });

  it('clears the cached documents route and can skip the next detach', () => {
    const strategy = new DocumentsRouteReuseStrategy();
    const documentsRoute = route('documents', true);
    const handle = { componentRef: {} } as DetachedRouteHandle;
    strategy.store(documentsRoute, handle);

    strategy.clearDocumentsListRoute(true);

    expect(strategy.shouldAttach(documentsRoute)).toBe(false);
    expect(strategy.retrieve(documentsRoute)).toBeNull();
    expect(strategy.shouldDetach(documentsRoute)).toBe(false);
    expect(strategy.shouldDetach(documentsRoute)).toBe(true);
  });
});
