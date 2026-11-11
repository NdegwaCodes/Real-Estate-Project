import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyPayment,
  darajaTimestamp,
  loadMpesaConfig,
  normalisePhone,
  parseStkCallback,
  stkPassword,
  tokensMatch,
} from "./mpesa";

test("normalisePhone accepts the common Kenyan formats", () => {
  for (const input of ["0712345678", "+254712345678", "254712345678", "712345678", "0712 345 678", "0110345678"]) {
    assert.match(normalisePhone(input) ?? "", /^254(7|1)\d{8}$/, input);
  }
  assert.equal(normalisePhone("0712 345 678"), "254712345678");
  assert.equal(normalisePhone("0110345678"), "254110345678");
});

test("normalisePhone rejects numbers M-Pesa cannot charge", () => {
  for (const input of ["", "12345", "0812345678", "+1 555 123 4567", "07123456789", "abc"]) {
    assert.equal(normalisePhone(input), null, input);
  }
});

test("darajaTimestamp is East Africa Time, yyyyMMddHHmmss", () => {
  assert.equal(darajaTimestamp(new Date("2026-11-11T21:05:09Z")), "20261112000509");
  assert.equal(darajaTimestamp(new Date("2026-01-01T00:00:00Z")), "20260101030000");
});

test("stkPassword is base64 of shortcode, passkey and timestamp", () => {
  const password = stkPassword("174379", "passkey", "20261111120000");
  assert.equal(Buffer.from(password, "base64").toString(), "174379passkey20261111120000");
});

test("tokensMatch compares in constant time and handles length mismatch", () => {
  assert.equal(tokensMatch("secret-token", "secret-token"), true);
  assert.equal(tokensMatch("secret-tokeN", "secret-token"), false);
  assert.equal(tokensMatch("short", "secret-token"), false);
});

test("parseStkCallback reads a successful callback", () => {
  const parsed = parseStkCallback({
    Body: {
      stkCallback: {
        MerchantRequestID: "29115-34620561-1",
        CheckoutRequestID: "ws_CO_191220191020363925",
        ResultCode: 0,
        ResultDesc: "The service request is processed successfully.",
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: 85000 },
            { Name: "MpesaReceiptNumber", Value: "NLJ7RT61SV" },
            { Name: "TransactionDate", Value: 20191219102115 },
            { Name: "PhoneNumber", Value: 254712345678 },
          ],
        },
      },
    },
  });
  assert.deepEqual(parsed, {
    merchantRequestId: "29115-34620561-1",
    checkoutRequestId: "ws_CO_191220191020363925",
    resultCode: 0,
    resultDesc: "The service request is processed successfully.",
    amount: 85000,
    receiptNumber: "NLJ7RT61SV",
    phoneNumber: "254712345678",
  });
});

test("parseStkCallback reads a cancelled callback without metadata", () => {
  const parsed = parseStkCallback({
    Body: {
      stkCallback: {
        MerchantRequestID: "1",
        CheckoutRequestID: "ws_CO_1",
        ResultCode: 1032,
        ResultDesc: "Request cancelled by user",
      },
    },
  });
  assert.equal(parsed?.resultCode, 1032);
  assert.equal(parsed?.amount, undefined);
  assert.equal(parsed?.receiptNumber, undefined);
});

test("parseStkCallback rejects malformed bodies", () => {
  assert.equal(parseStkCallback(null), null);
  assert.equal(parseStkCallback({}), null);
  assert.equal(parseStkCallback({ Body: { stkCallback: { ResultCode: 0 } } }), null);
  assert.equal(
    parseStkCallback({ Body: { stkCallback: { CheckoutRequestID: "x", ResultCode: "abc" } } }),
    null
  );
});

test("applyPayment marks full and partial payments", () => {
  assert.deepEqual(applyPayment(85000, 0, 85000), { amountPaid: 85000, paymentStatus: "Paid" });
  assert.deepEqual(applyPayment(85000, 0, 40000), { amountPaid: 40000, paymentStatus: "PartiallyPaid" });
  assert.deepEqual(applyPayment(85000, 40000, 45000), { amountPaid: 85000, paymentStatus: "Paid" });
});

test("loadMpesaConfig requires credentials and builds the callback URL", () => {
  assert.throws(() => loadMpesaConfig({}), /MPESA_CONSUMER_KEY/);
  const config = loadMpesaConfig({
    MPESA_CONSUMER_KEY: "key",
    MPESA_CONSUMER_SECRET: "secret",
    MPESA_SHORTCODE: "174379",
    MPESA_PASSKEY: "passkey",
    MPESA_CALLBACK_BASE_URL: "https://api.example.com/",
    MPESA_CALLBACK_TOKEN: "tok123",
  });
  assert.equal(config.baseUrl, "https://sandbox.safaricom.co.ke");
  assert.equal(config.callbackUrl, "https://api.example.com/mpesa/callback/tok123");
  assert.equal(config.transactionType, "CustomerPayBillOnline");
  assert.equal(config.partyB, "174379");
});
