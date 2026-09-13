export type PosCatalogItem = {
  id: string;
  kind: "product" | "service";
  name: string;
  code?: string | null;
  sale_price: number | string;
  cost_price?: number | string;
  stock_qty?: number | string;
  reorder_level?: number | string;
  unit?: string;
  category_id?: string | null;
  category_name?: string | null;
  gst_rate?: number | string | null;
  hsn_sac?: string | null;
};

export type PosCustomer = {
  id: string;
  name: string;
  code?: string | null;
  phone?: string | null;
  balance?: number | string | null;
  gstin?: string | null;
  state_code?: string | null;
};

export type PosInstrument = {
  id: string;
  name: string;
  type: string;
  account_number?: string | null;
  current_balance?: number | string | null;
  details?: any;
};

export type PosMerchantQr = {
  id: string;
  display_name: string;
  qr_name?: string | null;
  upi_id: string;
  is_active: boolean;
  payment_instrument_id?: string | null;
};

export type PosCategory = {
  id: string;
  name: string;
};

export type CartLine = {
  key: string;
  id: string;
  kind: "product" | "service";
  name: string;
  code?: string | null;
  rate: number;
  qty: number;
  costPrice: number;
  categoryName: string;
  gstRate: number;
  hsnSac: string | null;
  stockQty: number | null;
  unit: string;
  note?: string;
};

export type PaymentChoice = "cash" | "upi" | "khata" | "split";

export type SplitRow = {
  id: string;
  instrumentId: string;
  amount: string;
};

export type OrderTab = {
  id: string;
  title: string;
  cart: CartLine[];
  customerId: string;
  customerSearch: string;
  discount: string;
  discountType: "flat" | "percent";
  paymentChoice: PaymentChoice;
  cashReceived: string;
  splitRows: SplitRow[];
  collectPreviousDue: boolean;
  useAdvance: boolean;
};

export type SuccessState = {
  invoiceId: string;
  invoiceNumber: string;
  total: number;
  paid: number;
  due: number;
  customerName?: string;
  customerPhone?: string;
};
