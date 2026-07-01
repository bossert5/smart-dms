import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

const DOCUMENTS_LIST_REUSE_DATA_KEY = 'reuseDocumentsList';

@Injectable({ providedIn: 'root' })
export class DocumentsRouteReuseStrategy implements RouteReuseStrategy {
  private documentsListHandle: DetachedRouteHandle | null = null;
  private skipNextDocumentsListDetach = false;

  clearDocumentsListRoute(skipNextDetach = false): void {
    this.documentsListHandle = null;
    this.skipNextDocumentsListDetach = skipNextDetach;
  }

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    if (!isDocumentsListRoute(route)) {
      return false;
    }

    if (this.skipNextDocumentsListDetach) {
      this.skipNextDocumentsListDetach = false;
      return false;
    }

    return true;
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    if (isDocumentsListRoute(route)) {
      this.documentsListHandle = handle;
    }
  }

  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    return isDocumentsListRoute(route) && this.documentsListHandle !== null;
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    return isDocumentsListRoute(route) ? this.documentsListHandle : null;
  }

  shouldReuseRoute(future: ActivatedRouteSnapshot, current: ActivatedRouteSnapshot): boolean {
    return future.routeConfig === current.routeConfig;
  }
}

function isDocumentsListRoute(route: ActivatedRouteSnapshot): boolean {
  return (
    route.routeConfig?.path === 'documents' && route.data[DOCUMENTS_LIST_REUSE_DATA_KEY] === true
  );
}
