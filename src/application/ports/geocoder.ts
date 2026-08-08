import type { Address } from '../../domain/orders/order.types.js';
import type { Point } from '../../domain/warehouses/point.js';

export interface Geocoder {
  geocode(address: Address): Promise<Point>;
}
