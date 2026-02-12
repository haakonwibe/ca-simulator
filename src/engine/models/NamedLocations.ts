// engine/models/NamedLocations.ts

export interface NamedLocation {
  id: string;
  displayName: string;
  isTrusted: boolean;
}

export interface IpNamedLocation extends NamedLocation {
  type: 'ip';
  ipRanges: string[];
}

export interface CountryNamedLocation extends NamedLocation {
  type: 'country';
  countriesAndRegions: string[];
  includeUnknownCountriesAndRegions: boolean;
}

export type NamedLocationUnion = IpNamedLocation | CountryNamedLocation;
