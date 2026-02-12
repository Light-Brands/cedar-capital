/**
 * BatchData API Client
 * Skip tracing service for finding owner contact information.
 * https://api.batchdata.com/api/v1
 */

import type { OwnerInfo } from './types'

const BATCHDATA_BASE_URL = 'https://api.batchdata.com/api/v1'

function getHeaders(): HeadersInit {
  const apiKey = process.env.BATCHDATA_API_KEY
  if (!apiKey) throw new Error('BATCHDATA_API_KEY not configured')
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }
}

/**
 * Skip trace a single property address to find owner contact info.
 */
export async function skipTrace(address: string, city: string, state: string, zip: string): Promise<OwnerInfo | null> {
  try {
    const res = await fetch(`${BATCHDATA_BASE_URL}/property/skip-trace`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        requests: [
          {
            propertyAddress: {
              street: address,
              city,
              state,
              zip,
            },
          },
        ],
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`BatchData API error ${res.status}: ${text}`)
    }

    const data = await res.json() as Record<string, unknown>
    const results = (data.results ?? data.data ?? []) as Record<string, unknown>[]
    if (results.length === 0) return null

    return mapBatchDataResult(results[0])
  } catch (err) {
    console.error(`BatchData skip trace error:`, err)
    return null
  }
}

/**
 * Batch skip trace multiple addresses.
 */
export async function batchSkipTrace(
  addresses: Array<{ address: string; city: string; state: string; zip: string }>
): Promise<(OwnerInfo | null)[]> {
  try {
    const requests = addresses.map(a => ({
      propertyAddress: {
        street: a.address,
        city: a.city,
        state: a.state,
        zip: a.zip,
      },
    }))

    const res = await fetch(`${BATCHDATA_BASE_URL}/property/skip-trace`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ requests }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`BatchData batch API error ${res.status}: ${text}`)
    }

    const data = await res.json() as Record<string, unknown>
    const results = (data.results ?? data.data ?? []) as Record<string, unknown>[]
    return results.map(mapBatchDataResult)
  } catch (err) {
    console.error(`BatchData batch skip trace error:`, err)
    return addresses.map(() => null)
  }
}

// ---------- Helpers ----------

function mapBatchDataResult(record: Record<string, unknown>): OwnerInfo | null {
  const owner = (record.owner ?? record.contact ?? {}) as Record<string, unknown>
  const property = (record.property ?? {}) as Record<string, unknown>
  const phones = (owner.phones ?? owner.phoneNumbers ?? []) as Array<Record<string, unknown> | string>
  const emails = (owner.emails ?? owner.emailAddresses ?? []) as Array<Record<string, unknown> | string>
  const mailingAddr = (owner.mailingAddress ?? owner.address ?? {}) as Record<string, unknown>

  const phoneNumbers = phones
    .map(p => typeof p === 'string' ? p : String(p.number ?? p.phone ?? ''))
    .filter(Boolean)

  const emailAddresses = emails
    .map(e => typeof e === 'string' ? e : String(e.address ?? e.email ?? ''))
    .filter(Boolean)

  if (!phoneNumbers.length && !emailAddresses.length && !owner.name) {
    return null
  }

  const ownerAddress = typeof mailingAddr === 'string'
    ? mailingAddr
    : [mailingAddr.street, mailingAddr.city, mailingAddr.state, mailingAddr.zip]
        .filter(Boolean).join(', ')

  const propertyAddress = String(property.address ?? '')

  return {
    ownerName: String(owner.name ?? owner.fullName ?? ''),
    ownerType: String(owner.type ?? owner.ownerType ?? 'Individual'),
    mailingAddress: ownerAddress || undefined,
    phoneNumbers,
    emailAddresses,
    isAbsentee: ownerAddress && propertyAddress
      ? !ownerAddress.toLowerCase().includes(propertyAddress.toLowerCase().split(',')[0])
      : undefined,
    isOwnerOccupied: owner.ownerOccupied != null
      ? Boolean(owner.ownerOccupied)
      : undefined,
    ownershipLengthYears: Number(owner.ownershipLength ?? owner.yearsOwned ?? 0) || undefined,
    estimatedEquity: Number(property.estimatedEquity ?? property.equity ?? 0) || undefined,
    mortgageBalance: Number(property.mortgageBalance ?? property.mortgage ?? 0) || undefined,
    rawData: record,
  }
}
