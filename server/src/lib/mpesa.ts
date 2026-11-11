import axios from "axios";
import { timingSafeEqual } from "crypto";

export interface MpesaConfig {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  transactionType: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
  partyB: string;
  callbackUrl: string;
  callbackToken: string;
}

const BASE_URLS = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
} as const;

export const loadMpesaConfig = (env = process.env): MpesaConfig => {
  const required = [
    "MPESA_CONSUMER_KEY",
    "MPESA_CONSUMER_SECRET",
    "MPESA_SHORTCODE",
    "MPESA_PASSKEY",
    "MPESA_CALLBACK_BASE_URL",
    "MPESA_CALLBACK_TOKEN",
  ];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`M-Pesa is not configured: missing ${missing.join(", ")}`);
  }

  const environment = env.MPESA_ENV === "production" ? "production" : "sandbox";
  const transactionType =
    env.MPESA_TRANSACTION_TYPE === "CustomerBuyGoodsOnline"
      ? "CustomerBuyGoodsOnline"
      : "CustomerPayBillOnline";
  const callbackBase = env.MPESA_CALLBACK_BASE_URL!.replace(/\/+$/, "");

  return {
    baseUrl: BASE_URLS[environment],
    consumerKey: env.MPESA_CONSUMER_KEY!,
    consumerSecret: env.MPESA_CONSUMER_SECRET!,
    shortcode: env.MPESA_SHORTCODE!,
    passkey: env.MPESA_PASSKEY!,
    transactionType,
    partyB: env.MPESA_PARTY_B || env.MPESA_SHORTCODE!,
    callbackUrl: `${callbackBase}/mpesa/callback/${env.MPESA_CALLBACK_TOKEN}`,
    callbackToken: env.MPESA_CALLBACK_TOKEN!,
  };
};

export const normalisePhone = (input: string): string | null => {
  const digits = input.replace(/[\s()-]/g, "").replace(/^\+/, "");
  let phone = digits;
  if (/^0[17]\d{8}$/.test(digits)) phone = `254${digits.slice(1)}`;
  else if (/^[17]\d{8}$/.test(digits)) phone = `254${digits}`;
  return /^254[17]\d{8}$/.test(phone) ? phone : null;
};

export const darajaTimestamp = (date = new Date()): string => {
  const eat = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    eat.getUTCFullYear() +
    pad(eat.getUTCMonth() + 1) +
    pad(eat.getUTCDate()) +
    pad(eat.getUTCHours()) +
    pad(eat.getUTCMinutes()) +
    pad(eat.getUTCSeconds())
  );
};

export const stkPassword = (
  shortcode: string,
  passkey: string,
  timestamp: string
): string => Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");

export const tokensMatch = (given: string, expected: string): boolean => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export interface StkCallback {
  merchantRequestId: string;
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  amount?: number;
  receiptNumber?: string;
  phoneNumber?: string;
}

export const parseStkCallback = (body: unknown): StkCallback | null => {
  const cb = (body as any)?.Body?.stkCallback;
  if (!cb || typeof cb.CheckoutRequestID !== "string") return null;
  const resultCode = Number(cb.ResultCode);
  if (!Number.isInteger(resultCode)) return null;

  const items: { Name: string; Value?: unknown }[] =
    cb.CallbackMetadata?.Item ?? [];
  const item = (name: string) => items.find((i) => i.Name === name)?.Value;
  const amount = item("Amount");
  const receipt = item("MpesaReceiptNumber");
  const phone = item("PhoneNumber");

  return {
    merchantRequestId: String(cb.MerchantRequestID ?? ""),
    checkoutRequestId: cb.CheckoutRequestID,
    resultCode,
    resultDesc: String(cb.ResultDesc ?? ""),
    amount: amount === undefined ? undefined : Number(amount),
    receiptNumber: receipt === undefined ? undefined : String(receipt),
    phoneNumber: phone === undefined ? undefined : String(phone),
  };
};

export const applyPayment = (
  amountDue: number,
  amountPaid: number,
  amount: number
): { amountPaid: number; paymentStatus: "Paid" | "PartiallyPaid" } => {
  const total = amountPaid + amount;
  return {
    amountPaid: total,
    paymentStatus: total >= amountDue ? "Paid" : "PartiallyPaid",
  };
};

let cachedToken: { value: string; expiresAt: number } | undefined;

const accessToken = async (config: MpesaConfig): Promise<string> => {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  const auth = Buffer.from(
    `${config.consumerKey}:${config.consumerSecret}`
  ).toString("base64");
  const { data } = await axios.get(
    `${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` }, timeout: 15000 }
  );
  const ttl = (Number(data.expires_in) || 3599) * 1000;
  cachedToken = { value: data.access_token, expiresAt: Date.now() + ttl - 60000 };
  return cachedToken.value;
};

export const stkPush = async (
  config: MpesaConfig,
  params: { phone: string; amount: number; accountReference: string; description: string }
): Promise<{ merchantRequestId: string; checkoutRequestId: string }> => {
  const timestamp = darajaTimestamp();
  const token = await accessToken(config);
  const { data } = await axios.post(
    `${config.baseUrl}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: config.shortcode,
      Password: stkPassword(config.shortcode, config.passkey, timestamp),
      Timestamp: timestamp,
      TransactionType: config.transactionType,
      Amount: params.amount,
      PartyA: params.phone,
      PartyB: config.partyB,
      PhoneNumber: params.phone,
      CallBackURL: config.callbackUrl,
      AccountReference: params.accountReference.slice(0, 12),
      TransactionDesc: params.description.slice(0, 13),
    },
    { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
  );
  if (String(data.ResponseCode) !== "0") {
    throw new Error(data.ResponseDescription || "STK push was not accepted");
  }
  return {
    merchantRequestId: data.MerchantRequestID,
    checkoutRequestId: data.CheckoutRequestID,
  };
};

export const stkQuery = async (
  config: MpesaConfig,
  checkoutRequestId: string
): Promise<{ resultCode: number; resultDesc: string } | null> => {
  const timestamp = darajaTimestamp();
  const token = await accessToken(config);
  try {
    const { data } = await axios.post(
      `${config.baseUrl}/mpesa/stkpushquery/v1/query`,
      {
        BusinessShortCode: config.shortcode,
        Password: stkPassword(config.shortcode, config.passkey, timestamp),
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
    );
    if (data.ResultCode === undefined) return null;
    return { resultCode: Number(data.ResultCode), resultDesc: String(data.ResultDesc ?? "") };
  } catch {
    return null;
  }
};
