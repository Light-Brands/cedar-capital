/**
 * BatchData API Client
 * Skip tracing — owner name, phone, email, mailing address, bankruptcy/lien/death flags.
 * https://api.batchdata.com/api/v1
 *
 * Response shape (as of 2026-04):
 *   {
 *     status: { code: 200, text: "OK" },
 *     results: {
 *       persons: [
 *         {
 *           propertyAddress: { street, city, state, zip, ... },
 *           name: { first, last, middle, full },
 *           phoneNumbers: [{ number, type, score, tested }],
 *           emails: [{ email, tested }],
 *           mailingAddress: { street, city, state, zip, addressValidity },
 *           bankruptcy: {} | { filingDate, type, ... },
 *           involuntaryLien: {} | { amount, filingDate, ... },
 *           death: { deceased: bool, date?, ... },
 *           dnc: { tcpa: bool },
 *           litigator: bool,
 *           property: {
 *             id, address, owner: { name, mailingAddress }, ...
 *           }
 *         }
 *       ]
 *     }
 *   }
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

export async function skipTrace(
  address: string,
  city: string,
  state: string,
  zip: string,
): Promise<OwnerInfo | null> {
  try {
    const res = await fetch(`${BATCHDATA_BASE_URL}/property/skip-trace`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        requests: [
          { propertyAddress: { street: address, city, state, zip } },
        ],
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`BatchData API error ${res.status}: ${text}`)
    }

    const data = await res.json() as Record<string, unknown>
    const results = (data.results ?? {}) as Record<string, unknown>
    const persons = (results.persons ?? []) as Record<string, unknown>[]
    if (persons.length === 0) return null
    return mapPerson(persons[0])
  } catch (err) {
    console.error('BatchData skip trace error:', err)
    return null
  }
}

export async function batchSkipTrace(
  addresses: Array<{ address: string; city: string; state: string; zip: string }>,
): Promise<(OwnerInfo | null)[]> {
  try {
    const res = await fetch(`${BATCHDATA_BASE_URL}/property/skip-trace`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        requests: addresses.map(a => ({
          propertyAddress: { street: a.address, city: a.city, state: a.state, zip: a.zip },
        })),
      }),
    })
    if (!res.ok) throw new Error(`BatchData batch API error ${res.status}`)
    const data = await res.json() as Record<string, unknown>
    const results = (data.results ?? {}) as Record<string, unknown>
    const persons = (results.persons ?? []) as Record<string, unknown>[]
    return addresses.map((_, i) => (persons[i] ? mapPerson(persons[i]) : null))
  } catch (err) {
    console.error('BatchData batch skip trace error:', err)
    return addresses.map(() => null)
  }
}

// ---------- Mapper ----------

function mapPerson(person: Record<string, unknown>): OwnerInfo | null {
  const name = (person.name ?? {}) as Record<string, unknown>
  const phoneNumbers = (person.phoneNumbers ?? []) as Array<Record<string, unknown>>
  const emails = (person.emails ?? []) as Array<Record<string, unknown>>
  const personMail = (person.mailingAddress ?? {}) as Record<string, unknown>
  const propertyAddr = (person.propertyAddress ?? {}) as Record<string, unknown>
  const property = (person.property ?? {}) as Record<string, unknown>
  const propertyOwner = (property.owner ?? {}) as Record<string, unknown>
  const propertyOwnerMail = (propertyOwner.mailingAddress ?? {}) as Record<string, unknown>
  const bankruptcy = (person.bankruptcy ?? {}) as Record<string, unknown>
  const involuntaryLien = (person.involuntaryLien ?? {}) as Record<string, unknown>
  const death = (person.death ?? {}) as Record<string, unknown>
  const dnc = (person.dnc ?? {}) as Record<string, unknown>

  const fullName = String(name.full ?? [name.first, name.middle, name.last].filter(Boolean).join(' '))
  if (!fullName && phoneNumbers.length === 0 && emails.length === 0) return null

  const phones = phoneNumbers
    .map(p => String(p.number ?? p.phone ?? ''))
    .filter(Boolean)
  const emailList = emails
    .map(e => String(e.email ?? e.address ?? ''))
    .filter(Boolean)

  const propertyStreet = String(propertyAddr.street ?? '').toLowerCase()
  const propertyZip = String(propertyAddr.zip ?? '').slice(0, 5)
  const mailStreet = String(propertyOwnerMail.street ?? personMail.street ?? '').toLowerCase()
  const mailZip = String(propertyOwnerMail.zip ?? personMail.zip ?? '').slice(0, 5)
  const isAbsentee = Boolean(
    (mailStreet && propertyStreet && mailStreet !== propertyStreet) ||
    (mailZip && propertyZip && mailZip !== propertyZip),
  )

  const mailAddrParts = [
    propertyOwnerMail.street ?? personMail.street,
    propertyOwnerMail.city ?? personMail.city,
    propertyOwnerMail.state ?? personMail.state,
    propertyOwnerMail.zip ?? personMail.zip,
  ].filter(Boolean)

  return {
    ownerName: fullName || undefined,
    ownerType: 'Individual',
    mailingAddress: mailAddrParts.length > 0 ? mailAddrParts.join(', ') : undefined,
    phoneNumbers: phones,
    emailAddresses: emailList,
    isAbsentee,
    isOwnerOccupied: !isAbsentee,
    ownershipLengthYears: undefined,
    estimatedEquity: undefined,
    mortgageBalance: undefined,
    rawData: {
      ...person,
      _derived_distress: deriveDistress({ bankruptcy, involuntaryLien, death, dnc }),
    },
  }
}

/**
 * Pull a single distress string out of BatchData's flag objects.
 * The enrich route already has its own regex-based detector over rawData;
 * this helper just gives the mapper a clean pre-extracted value for easy use.
 */
function deriveDistress(flags: {
  bankruptcy: Record<string, unknown>
  involuntaryLien: Record<string, unknown>
  death: Record<string, unknown>
  dnc: Record<string, unknown>
}): string | null {
  if (flags.bankruptcy && Object.keys(flags.bankruptcy).length > 0 && flags.bankruptcy.filingDate) {
    return 'Bankruptcy'
  }
  if (flags.involuntaryLien && Object.keys(flags.involuntaryLien).length > 0 && flags.involuntaryLien.amount) {
    return 'Involuntary lien'
  }
  if (flags.death?.deceased === true) {
    return 'Owner deceased'
  }
  return null
}
