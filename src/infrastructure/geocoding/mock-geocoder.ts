import type { Geocoder } from '../../application/ports/geocoder.js';
import type { Address } from '../../domain/orders/order.types.js';
import type { Point } from '../../domain/warehouses/point.js';
import { OrderError } from '../../domain/orders/order.error.js';
import { ERROR_MESSAGE, HTTP_STATUS } from '../../shared/constants.js';

const CITY_COORDINATES: Record<string, Point> = {
  bogota: { latitude: 4.711, longitude: -74.0721 },
  cali: { latitude: 3.4516, longitude: -76.532 },
  medellin: { latitude: 6.2442, longitude: -75.5812 },
  'new york': { latitude: 40.7128, longitude: -74.006 },
  'los angeles': { latitude: 34.0522, longitude: -118.2437 },
  chicago: { latitude: 41.8781, longitude: -87.6298 },
  houston: { latitude: 29.7604, longitude: -95.3698 },
  phoenix: { latitude: 33.4484, longitude: -112.074 },
  philadelphia: { latitude: 39.9526, longitude: -75.1652 },
  'san antonio': { latitude: 29.4241, longitude: -98.4936 },
  'san diego': { latitude: 32.7157, longitude: -117.1611 },
  dallas: { latitude: 32.7767, longitude: -96.797 },
  'san jose': { latitude: 37.3382, longitude: -121.8863 },
  austin: { latitude: 30.2672, longitude: -97.7431 },
  jacksonville: { latitude: 30.3322, longitude: -81.6557 },
  'fort worth': { latitude: 32.7555, longitude: -97.3308 },
  columbus: { latitude: 39.9612, longitude: -82.9988 },
  charlotte: { latitude: 35.2271, longitude: -80.8431 },
  indianapolis: { latitude: 39.7684, longitude: -86.1581 },
  seattle: { latitude: 47.6062, longitude: -122.3321 },
  denver: { latitude: 39.7392, longitude: -104.9903 },
  washington: { latitude: 38.9072, longitude: -77.0369 },
  boston: { latitude: 42.3601, longitude: -71.0589 },
  miami: { latitude: 25.7617, longitude: -80.1918 },
  atlanta: { latitude: 33.749, longitude: -84.388 },
  'las vegas': { latitude: 36.1699, longitude: -115.1398 },
  'san francisco': { latitude: 37.7749, longitude: -122.4194 },
};

function normalizeCity(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export class MockGeocoderAdapter implements Geocoder {
  async geocode(address: Address): Promise<Point> {
    const point = CITY_COORDINATES[normalizeCity(address.city)];
    if (!point) {
      throw new OrderError(ERROR_MESSAGE.ADDRESS_NOT_GEOCODABLE, HTTP_STATUS.UNPROCESSABLE_ENTITY);
    }
    return point;
  }
}
