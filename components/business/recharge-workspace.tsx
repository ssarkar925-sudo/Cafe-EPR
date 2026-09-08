// BILLING_WORKSPACE_PATCH_SAFE_V1
"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/realtime";
import { inr } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import SearchableSelect from "@/components/ui/searchable-select";
import MultiPaymentCollection, { type PaymentAllocation } from "@/components/business/multi-payment-collection";
import FloatingWindow from "@/components/ui/floating-window";
import ScanFillModal from "@/components/scan-fill/scan-fill-modal";
import type { ScanFields } from "@/lib/scan/extract";
import { useToast } from "@/components/ui/use-toast";
import { downloadCsv } from "@/components/ui/csv";
import { renderWhatsAppTemplate, sendWhatsAppMessage, getWhatsAppConfig, DEFAULT_WA_TEMPLATES } from "@/lib/whatsapp";
import WhatsAppSendModal from "@/components/whatsapp/whatsapp-send-modal";

export type CustomerRow = {
  id: string;
  name: string;
  code?: string;
  phone?: string | null;
  balance?: number;
};

export type RechargeProvider = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order?: number;
  code?: string;
};

export type RechargeSlab = {
  id: string;
  provider_id: string;
  min_amount: number | string;
  max_amount: number | string;
  commission_percent: number | string;
};

export type PaymentInstrument = {
  id: string;
  name: string;
  type: string;
  balance?: number;
  opening_balance?: number;
  details?: any;
  is_active: boolean;
};

export type Txn = {
  id: string;
  transaction_number: string;
  service_type: string;
  direction: string;
  transaction_date: string;
  transaction_timestamp?: string | null;
  customer_id?: string | null;
  customer_mobile?: string | null;
  reference?: string | null;
  remarks?: string | null;
  status: "success" | "pending" | "failed" | "reversed";
  provider_id?: string | null;
  instrument_id?: string | null;
  amount: number | string;
  service_fee?: number | string;
  portal_commission?: number | string;
  portal_charge?: number | string;
  customer_pay_method?: string | null;
  customer_collection_method?: string | null;
  customer_collected_amount?: number | string;
  customer_due_amount?: number | string;
  cash_in?: number | string;
  cash_out?: number | string;
  bank_in?: number | string;
  bank_out?: number | string;
  pool_out?: number | string;
  pool_credit?: number | string;
  created_at?: string;
  customers?: { name: string; phone?: string | null } | null;
  providers?: { name: string } | null;
  profiles?: { full_name: string } | null;
};

// Telecom Circles
const TELECOM_CIRCLES = [
  "West Bengal",
  "Kolkata",
  "Bihar & Jharkhand",
  "Delhi NCR",
  "Maharashtra & Goa",
  "Gujarat",
  "Rajasthan",
  "Madhya Pradesh & Chhattisgarh",
  "Uttar Pradesh (East)",
  "Uttar Pradesh (West)",
  "Punjab",
  "Haryana",
  "Himachal Pradesh",
  "Jammu & Kashmir",
  "Odisha",
  "Assam",
  "North East",
  "Tamil Nadu",
  "Kerala",
  "Karnataka",
  "Andhra Pradesh",
  "Telangana",
  "Mumbai",
];