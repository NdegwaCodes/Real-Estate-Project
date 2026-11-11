import express from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { getLeasePayments, getLeases } from "../controllers/leaseControllers";
import {
  getRentPaymentStatus,
  initiateRentPayment,
} from "../controllers/mpesaControllers";

const router = express.Router();

router.get("/", authMiddleware(["manager", "tenant"]), getLeases);
router.get(
  "/:id/payments",
  authMiddleware(["manager", "tenant"]),
  getLeasePayments
);
router.post("/:id/mpesa", authMiddleware(["tenant"]), initiateRentPayment);
router.get(
  "/:id/mpesa/:transactionId",
  authMiddleware(["tenant"]),
  getRentPaymentStatus
);

export default router;
