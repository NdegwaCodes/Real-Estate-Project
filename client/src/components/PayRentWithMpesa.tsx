"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKES } from "@/lib/utils";
import {
  api,
  useGetRentPaymentStatusQuery,
  usePayRentWithMpesaMutation,
} from "@/state/api";
import { useAppDispatch } from "@/state/redux";
import { Lease, Payment } from "@/types/prismaTypes";
import { Check, Loader2, Smartphone } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";

const WAIT_LIMIT_MS = 2 * 60 * 1000;

const isThisMonth = (date: Date | string) => {
  const d = new Date(date);
  const now = new Date();
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth()
  );
};

const PayRentWithMpesa = ({
  lease,
  payments,
  defaultPhone,
}: {
  lease: Lease;
  payments: Payment[];
  defaultPhone?: string;
}) => {
  const dispatch = useAppDispatch();
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [pending, setPending] = useState<{ id: number; since: number } | null>(
    null
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [payRent, { isLoading: starting }] = usePayRentWithMpesaMutation();

  const { data: status } = useGetRentPaymentStatusQuery(
    { leaseId: lease.id, transactionId: pending?.id ?? 0 },
    { skip: !pending, pollingInterval: 3000 }
  );

  const thisMonth = payments.find((p) => isThisMonth(p.dueDate));
  const balance = thisMonth
    ? Math.max(0, Math.ceil(thisMonth.amountDue - thisMonth.amountPaid))
    : Math.ceil(lease.rent);
  const isPaid = thisMonth?.paymentStatus === "Paid" || balance === 0;

  useEffect(() => {
    if (!pending || !status || status.transactionId !== pending.id) return;
    if (status.status === "Success") {
      toast.success(
        status.mpesaReceiptNumber
          ? `Rent paid. M-Pesa receipt ${status.mpesaReceiptNumber}.`
          : "Rent paid."
      );
      setNotice(null);
      setPending(null);
      dispatch(api.util.invalidateTags(["Payments"]));
    } else if (status.status === "Failed") {
      setNotice(status.resultDesc || "The payment did not go through.");
      setPending(null);
    }
  }, [status, pending, dispatch]);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      setNotice(
        "We have not heard back from M-Pesa yet. If you paid, it will show in your billing history once confirmed."
      );
      setPending(null);
      dispatch(api.util.invalidateTags(["Payments"]));
    }, Math.max(0, pending.since + WAIT_LIMIT_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [pending, dispatch]);

  const startPayment = async () => {
    setNotice(null);
    try {
      const result = await payRent({ leaseId: lease.id, phoneNumber: phone }).unwrap();
      setPending({ id: result.transactionId, since: Date.now() });
    } catch (error: any) {
      const data = error?.data ?? {};
      if (data.transactionId) {
        setPending({ id: data.transactionId, since: Date.now() });
        return;
      }
      setNotice(data.message || "Could not start the payment. Try again.");
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden p-6 mt-10 md:mt-0 flex-1">
      <h2 className="text-2xl font-bold mb-1">Pay rent</h2>
      <p className="text-sm text-gray-500 mb-4">
        Pay this month&apos;s rent with M-Pesa. You will get a prompt on your
        phone to enter your PIN.
      </p>
      <div className="border rounded-lg p-6">
        <div className="flex justify-between items-baseline mb-4">
          <span className="text-gray-500">Due this month</span>
          <span className="text-2xl font-bold">{formatKES(balance)}</span>
        </div>

        {isPaid ? (
          <div className="flex items-center text-green-700 font-semibold">
            <Check className="w-5 h-5 mr-2" />
            This month&apos;s rent is paid
          </div>
        ) : pending ? (
          <div className="flex items-center text-primary-700">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Check your phone and enter your M-Pesa PIN to pay{" "}
            {formatKES(balance)}.
          </div>
        ) : (
          <div className="space-y-3">
            <label htmlFor="mpesa-phone" className="text-sm font-medium">
              M-Pesa phone number
            </label>
            <Input
              id="mpesa-phone"
              type="tel"
              inputMode="tel"
              placeholder="0712 345 678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              disabled={starting || !phone.trim()}
              onClick={startPayment}
            >
              <Smartphone className="w-4 h-4 mr-2" />
              {starting ? "Sending request..." : `Pay ${formatKES(balance)} with M-Pesa`}
            </Button>
          </div>
        )}

        {notice && <p className="text-sm text-red-600 mt-3">{notice}</p>}
      </div>
    </div>
  );
};

export default PayRentWithMpesa;
