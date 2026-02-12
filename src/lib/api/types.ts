/**
 * Shared types for external API integrations.
 */

export interface DiscoveredProperty {
  address: string
  city: string
  state: string
  zipCode: string
  county?: string
  lat?: number
  lng?: number
  beds?: number
  baths?: number
  sqft?: number
  lotSize?: number
  yearBuilt?: number
  propertyType?: string
  listType?: string
  source: string
  sourceId: string
  askingPrice?: number
  estimatedValue?: number
  taxAssessedValue?: number
  lastSalePrice?: number
  lastSaleDate?: string
  daysOnMarket?: number
  link?: string
  photos?: string[]
  rawData: Record<string, unknown>
}

export interface OwnerInfo {
  ownerName?: string
  ownerType?: string
  mailingAddress?: string
  phoneNumbers: string[]
  emailAddresses: string[]
  isAbsentee?: boolean
  isOwnerOccupied?: boolean
  ownershipLengthYears?: number
  estimatedEquity?: number
  mortgageBalance?: number
  rawData: Record<string, unknown>
}

export interface PropertyValuation {
  estimatedValue: number
  valuationDate: string
  confidence: 'high' | 'medium' | 'low'
  source: string
}

export interface SalesComp {
  address: string
  salePrice: number
  sqft: number
  beds: number
  baths: number
  saleDate: string
  distanceMiles: number
}

export interface DiscoveryQuery {
  zipCodes: string[]
  listTypes?: string[]
  minPrice?: number
  maxPrice?: number
  minBeds?: number
  maxBeds?: number
  propertyTypes?: string[]
  maxDaysOnMarket?: number
}
