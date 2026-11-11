-- CreateEnum
CREATE TYPE "MpesaStatus" AS ENUM ('Pending', 'Success', 'Failed');

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "paymentDate" DROP NOT NULL;

-- CreateTable
CREATE TABLE "MpesaTransaction" (
    "id" SERIAL NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "MpesaStatus" NOT NULL DEFAULT 'Pending',
    "merchantRequestId" TEXT NOT NULL,
    "checkoutRequestId" TEXT NOT NULL,
    "mpesaReceiptNumber" TEXT,
    "resultCode" INTEGER,
    "resultDesc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MpesaTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MpesaTransaction_checkoutRequestId_key" ON "MpesaTransaction"("checkoutRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "MpesaTransaction_mpesaReceiptNumber_key" ON "MpesaTransaction"("mpesaReceiptNumber");

-- CreateIndex
CREATE INDEX "MpesaTransaction_paymentId_status_idx" ON "MpesaTransaction"("paymentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_leaseId_dueDate_key" ON "Payment"("leaseId", "dueDate");

-- AddForeignKey
ALTER TABLE "MpesaTransaction" ADD CONSTRAINT "MpesaTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

