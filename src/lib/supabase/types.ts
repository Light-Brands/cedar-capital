export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      properties: {
        Row: Property
        Insert: PropertyInsert
        Update: PropertyUpdate
        Relationships: []
      }
      leads: {
        Row: Lead
        Insert: LeadInsert
        Update: LeadUpdate
        Relationships: []
      }
      analyses: {
        Row: Analysis
        Insert: AnalysisInsert
        Update: AnalysisUpdate
        Relationships: []
      }
      pipeline: {
        Row: PipelineEntry
        Insert: PipelineInsert
        Update: PipelineUpdate
        Relationships: []
      }
      outreach_log: {
        Row: OutreachLogEntry
        Insert: OutreachLogInsert
        Update: OutreachLogUpdate
        Relationships: []
      }
      austin_zip_codes: {
        Row: AustinZipCode
        Insert: AustinZipCodeInsert
        Update: AustinZipCodeUpdate
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// ---------- Properties ----------
export interface Property {
  id: string
  address: string
  city: string
  state: string
  zip_code: string | null
  county: string | null
  lat: number | null
  lng: number | null
  beds: number | null
  baths: number | null
  sqft: number | null
  lot_size: number | null
  year_built: number | null
  property_type: string | null
  list_type: string | null
  source: string | null
  source_id: string | null
  asking_price: number | null
  zestimate: number | null
  tax_assessed_value: number | null
  last_sale_price: number | null
  last_sale_date: string | null
  days_on_market: number | null
  link: string | null
  photos: string[] | null
  raw_data: Json | null
  // Added by migration 001_lead_flow_phase1
  special_features: string[] | null
  agent_name: string | null
  agent_phone: string | null
  agent_email: string | null
  listing_status: 'Active' | 'Pending' | 'Closed' | 'Expired' | 'Unknown' | null
  review_status: 'New' | 'Reviewed' | 'Contacted' | 'Dead' | null
  notes: string | null
  licensing_tag: string | null
  // Added by migration 004_tcad_enrichment
  tcad_prop_id: string | null
  tcad_geo_id: string | null
  owner_name: string | null
  owner_mailing_address: string | null
  is_absentee: boolean | null
  has_homestead_exemption: boolean | null
  market_value: number | null
  appraised_value: number | null
  deed_date: string | null
  tcad_updated_at: string | null
  // Added by migration 005_manual_enrichment
  distress_signal: string | null
  last_enriched_at: string | null
  created_at: string
  updated_at: string
}

export type PropertyInsert =
  Omit<Property, 'id' | 'created_at' | 'updated_at' | 'special_features' | 'agent_name' | 'agent_phone' | 'agent_email' | 'listing_status' | 'review_status' | 'notes' | 'licensing_tag' | 'tcad_prop_id' | 'tcad_geo_id' | 'owner_name' | 'owner_mailing_address' | 'is_absentee' | 'has_homestead_exemption' | 'market_value' | 'appraised_value' | 'deed_date' | 'tcad_updated_at' | 'distress_signal' | 'last_enriched_at'> & {
    id?: string
    created_at?: string
    updated_at?: string
    // Migration 001 fields — optional on insert; DB has sensible defaults or null is fine
    special_features?: string[] | null
    agent_name?: string | null
    agent_phone?: string | null
    agent_email?: string | null
    listing_status?: 'Active' | 'Pending' | 'Closed' | 'Expired' | 'Unknown' | null
    review_status?: 'New' | 'Reviewed' | 'Contacted' | 'Dead' | null
    notes?: string | null
    licensing_tag?: string | null
    // Migration 004 fields
    tcad_prop_id?: string | null
    tcad_geo_id?: string | null
    owner_name?: string | null
    owner_mailing_address?: string | null
    is_absentee?: boolean | null
    has_homestead_exemption?: boolean | null
    market_value?: number | null
    appraised_value?: number | null
    deed_date?: string | null
    tcad_updated_at?: string | null
    // Migration 005 fields
    distress_signal?: string | null
    last_enriched_at?: string | null
  }

export type PropertyUpdate = Partial<PropertyInsert>

// ---------- Leads ----------
export interface Lead {
  id: string
  property_id: string
  owner_name: string | null
  owner_type: string | null
  mailing_address: string | null
  phone_numbers: string[] | null
  email_addresses: string[] | null
  is_absentee: boolean | null
  is_owner_occupied: boolean | null
  ownership_length_years: number | null
  estimated_equity: number | null
  mortgage_balance: number | null
  skip_trace_data: Json | null
  created_at: string
}

export type LeadInsert = Omit<Lead, 'id' | 'created_at'> & {
  id?: string
  created_at?: string
}

export type LeadUpdate = Partial<LeadInsert>

// ---------- Analyses ----------
export interface Analysis {
  id: string
  property_id: string
  // Offer Analysis
  offer_price: number | null
  offer_per_sqft: number | null
  arv: number | null
  arv_per_sqft: number | null
  diff: number | null
  // Rehab Breakdown
  rehab_total: number | null
  rehab_kitchen: number | null
  rehab_bath: number | null
  rehab_interior_paint: number | null
  rehab_exterior_paint: number | null
  rehab_flooring: number | null
  rehab_windows: number | null
  rehab_misc: number | null
  rehab_roof: number | null
  rehab_sheetrock: number | null
  rehab_framing: number | null
  rehab_electrical: number | null
  rehab_plumbing: number | null
  rehab_hvac: number | null
  rehab_landscape: number | null
  rehab_foundation: number | null
  rehab_other: number | null
  // Cost Analysis
  selling_costs: number | null
  total_cost: number | null
  // Profit Analysis
  est_profit: number | null
  // Finance Analysis
  ltv: number | null
  loan_amount: number | null
  points_pct: number | null
  interest_pct: number | null
  months_held: number | null
  monthly_payment: number | null
  total_interest: number | null
  total_points: number | null
  total_finance_cost: number | null
  profit_with_finance: number | null
  roi: number | null
  // Wholesale Analysis
  mao: number | null
  wholesale_profit: number | null
  // Scoring
  deal_score: string | null
  deal_score_numeric: number | null
  score_factors: Json | null
  // Comp data
  comp_addresses: string[] | null
  comp_prices: number[] | null
  comp_avg_per_sqft: number | null
  // Added by migration 001_lead_flow_phase1
  discount_pct: number | null
  total_in: number | null
  gross_profit: number | null
  verified: boolean | null
  badge: 'Perfect Fit' | 'Strong Match' | 'Could Work' | 'Needs a Reason' | 'Pass' | null
  comp_per_sqft: number[] | null
  created_at: string
}

export type AnalysisInsert = Omit<Analysis, 'id' | 'created_at'> & {
  id?: string
  created_at?: string
}

export type AnalysisUpdate = Partial<AnalysisInsert>

// ---------- Pipeline ----------
export type PipelineStage = 'new' | 'verbal_offer' | 'wrote_offer' | 'in_contract' | 'closed' | 'rejected'

export interface PipelineEntry {
  id: string
  property_id: string
  analysis_id: string | null
  stage: PipelineStage
  notes: string | null
  assigned_to: string | null
  next_action: string | null
  next_action_date: string | null
  created_at: string
  updated_at: string
}

export type PipelineInsert = Omit<PipelineEntry, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
  updated_at?: string
}

export type PipelineUpdate = Partial<PipelineInsert>

// ---------- Outreach Log ----------
export interface OutreachLogEntry {
  id: string
  lead_id: string
  property_id: string
  channel: 'sms' | 'email' | 'call'
  status: 'sent' | 'delivered' | 'opened' | 'replied' | 'failed'
  template_used: string | null
  message_content: string | null
  sent_at: string | null
  response_text: string | null
  response_at: string | null
}

export type OutreachLogInsert = Omit<OutreachLogEntry, 'id' | 'response_text' | 'response_at'> & {
  id?: string
  response_text?: string | null
  response_at?: string | null
}

export type OutreachLogUpdate = Partial<OutreachLogInsert>

// ---------- Lead Sources (migration 001) ----------
export type SourceKind = 'listings' | 'enrichment' | 'skip_trace'
export type SourceSyncStatus = 'success' | 'partial' | 'failed' | 'needs_config' | 'never_run'

export interface LeadSource {
  slug: string
  display_name: string
  kind: SourceKind
  enabled: boolean
  config: Json
  env_key_names: string[] | null
  docs_url: string | null
  notes: string | null
  last_sync_at: string | null
  last_sync_status: SourceSyncStatus | null
  last_sync_count: number | null
  last_sync_duration_ms: number | null
  last_error: string | null
  total_synced_count: number
  total_errors_count: number
  created_at: string
  updated_at: string
}

export interface LeadSourceSync {
  id: string
  source_slug: string
  started_at: string
  finished_at: string | null
  status: 'running' | 'success' | 'partial' | 'failed'
  count: number
  duration_ms: number | null
  error_message: string | null
  metadata: Json
}

// ---------- Austin Zip Codes ----------
export interface AustinZipCode {
  zip_code: string
  area_name: string | null
  is_active: boolean
}

export type AustinZipCodeInsert = Omit<AustinZipCode, 'is_active'> & { is_active?: boolean }
export type AustinZipCodeUpdate = Partial<AustinZipCode>
