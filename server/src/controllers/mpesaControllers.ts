import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import {
  MpesaConfig,
  applyPayment,
  loadMpesaConfig,
  normalisePhone,
  parseStkCallback,
  stkPush,
  stkQuery,
  tokensMatch,
} from "../lib/mpesa";

const prisma = new PrismaClient();

const PENDING_WINDOW_MS = 2 * 60 * 1000;
const QUERY_AFTER_MS = 30 * 1000;

const currentDueDate = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

const configOrNull = (): MpesaConfig | null => {
  try {
    return loadMpesaConfig();
  } catch (error) {
    console.error(error);
    return null;
  }
};

interface Settlement {
  resultCode: number;
  resultDesc: string;
  amount?: number;
  receiptNumber?: string;
}

export const settleTransaction = async (
  checkoutRequestId: string,
  result: Settlement
): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    const transaction = await tx.mpesaTransaction.findUnique({
      where: { checkoutRequestId },
      include: { payment: true },
    });
    if (!transaction || transaction.status !== "Pending") return;

    let succeeded = result.resultCode === 0;
    let resultDesc = result.resultDesc;
    if (succeeded && result.amount !== undefined && result.amount !== transaction.amount) {
      succeeded = false;
      resultDesc = `Amount mismatch: expected ${transaction.amount}, received ${result.amount}`;
      console.error(`M-Pesa ${checkoutRequestId}: ${resultDesc}`);
    }

    const claimed = await tx.mpesaTransaction.updateMany({
      where: { id: transaction.id, status: "Pending" },
      data: {
        status: succeeded ? "Success" : "Failed",
        resultCode: result.resultCode,
        resultDesc,
        mpesaReceiptNumber: succeeded ? result.receiptNumber ?? null : null,
      },
    });
    if (claimed.count === 0 || !succeeded) return;

    const { payment } = transaction;
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        ...applyPayment(payment.amountDue, payment.amountPaid, transaction.amount),
        paymentDate: new Date(),
      },
    });
  });
};

export const initiateRentPayment = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const leaseId = Number(req.params.id);
    const lease = await prisma.lease.findFirst({
      where: { id: leaseId, tenantCognitoId: req.user!.id },
    });
    if (!lease) {
      res.status(404).json({ message: "Lease not found" });
      return;
    }

    const now = new Date();
    if (now < lease.startDate || now > lease.endDate) {
      res.status(409).json({ message: "This lease is not active" });
      return;
    }

    const phone = normalisePhone(String(req.body?.phoneNumber ?? ""));
    if (!phone) {
      res
        .status(400)
        .json({ message: "Enter a Safaricom number like 0712 345 678" });
      return;
    }

    const config = configOrNull();
    if (!config) {
      res.status(503).json({ message: "M-Pesa payments are not available right now" });
      return;
    }

    const dueDate = currentDueDate(now);
    const payment = await prisma.payment.upsert({
      where: { leaseId_dueDate: { leaseId, dueDate } },
      update: {},
      create: {
        leaseId,
        dueDate,
        amountDue: lease.rent,
        amountPaid: 0,
        paymentStatus: "Pending",
      },
    });

    const amount = Math.ceil(payment.amountDue - payment.amountPaid);
    if (payment.paymentStatus === "Paid" || amount < 1) {
      res.status(409).json({ message: "This month's rent is already paid" });
      return;
    }

    const inFlight = await prisma.mpesaTransaction.findFirst({
      where: {
        paymentId: payment.id,
        status: "Pending",
        createdAt: { gt: new Date(now.getTime() - PENDING_WINDOW_MS) },
      },
    });
    if (inFlight) {
      res.status(409).json({
        message: "A payment request is already waiting on your phone",
        transactionId: inFlight.id,
      });
      return;
    }

    let push;
    try {
      push = await stkPush(config, {
        phone,
        amount,
        accountReference: `LEASE${lease.id}`,
        description: "Rent payment",
      });
    } catch (error: any) {
      console.error("STK push failed:", error?.response?.data ?? error.message);
      res.status(502).json({ message: "M-Pesa did not accept the request. Try again." });
      return;
    }

    const transaction = await prisma.mpesaTransaction.create({
      data: {
        paymentId: payment.id,
        phoneNumber: phone,
        amount,
        merchantRequestId: push.merchantRequestId,
        checkoutRequestId: push.checkoutRequestId,
      },
    });

    res.status(201).json({
      transactionId: transaction.id,
      status: transaction.status,
      amount,
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ message: `Error starting M-Pesa payment: ${error.message}` });
  }
};

export const getRentPaymentStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const where = {
      id: Number(req.params.transactionId),
      payment: {
        leaseId: Number(req.params.id),
        lease: { tenantCognitoId: req.user!.id },
      },
    };
    let transaction = await prisma.mpesaTransaction.findFirst({ where });
    if (!transaction) {
      res.status(404).json({ message: "Payment not found" });
      return;
    }

    const age = Date.now() - transaction.createdAt.getTime();
    if (transaction.status === "Pending" && age > QUERY_AFTER_MS) {
      const config = configOrNull();
      const result = config && (await stkQuery(config, transaction.checkoutRequestId));
      if (result) {
        await settleTransaction(transaction.checkoutRequestId, result);
        transaction = await prisma.mpesaTransaction.findFirst({ where });
      }
    }

    res.json({
      transactionId: transaction!.id,
      status: transaction!.status,
      amount: transaction!.amount,
      resultDesc: transaction!.resultDesc,
      mpesaReceiptNumber: transaction!.mpesaReceiptNumber,
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ message: `Error retrieving payment status: ${error.message}` });
  }
};

export const mpesaCallback = async (
  req: Request,
  res: Response
): Promise<void> => {
  const expected = process.env.MPESA_CALLBACK_TOKEN;
  if (!expected || !tokensMatch(req.params.token ?? "", expected)) {
    res.status(404).end();
    return;
  }

  const callback = parseStkCallback(req.body);
  if (!callback) {
    res.status(400).json({ ResultCode: 1, ResultDesc: "Malformed callback" });
    return;
  }

  try {
    await settleTransaction(callback.checkoutRequestId, callback);
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error: any) {
    console.error("M-Pesa callback failed:", error.message);
    res.status(500).json({ ResultCode: 1, ResultDesc: "Processing failed" });
  }
};
