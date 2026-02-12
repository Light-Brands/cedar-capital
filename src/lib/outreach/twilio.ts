/**
 * Twilio SMS Client
 * Sends SMS messages for seller outreach.
 */

import Twilio from 'twilio'

function getClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) throw new Error('Twilio credentials not configured')
  return Twilio(accountSid, authToken)
}

function getFromNumber(): string {
  const num = process.env.TWILIO_PHONE_NUMBER
  if (!num) throw new Error('TWILIO_PHONE_NUMBER not configured')
  return num
}

export interface SMSResult {
  success: boolean
  messageId?: string
  status?: string
  error?: string
}

/**
 * Send an SMS message to a phone number.
 */
export async function sendSMS(to: string, body: string): Promise<SMSResult> {
  try {
    const client = getClient()
    const message = await client.messages.create({
      to: formatPhoneNumber(to),
      from: getFromNumber(),
      body,
    })

    return {
      success: true,
      messageId: message.sid,
      status: message.status,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error(`Twilio SMS error:`, errorMessage)
    return {
      success: false,
      error: errorMessage,
    }
  }
}

/**
 * Format a phone number to E.164 format for Twilio.
 */
function formatPhoneNumber(phone: string): string {
  // Already in E.164 format
  if (phone.startsWith('+')) return phone
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+1${digits}`
}
