import express from "express";
import { authMiddleware, bindSelf } from "../middleware/authMiddleware";
import {
  createApplication,
  listApplications,
  updateApplicationStatus,
} from "../controllers/applicationControllers";

const router = express.Router();

router.post(
  "/",
  authMiddleware(["tenant"]),
  bindSelf("tenantCognitoId"),
  createApplication
);
router.put("/:id/status", authMiddleware(["manager"]), updateApplicationStatus);
router.get("/", authMiddleware(["manager", "tenant"]), listApplications);

export default router;
