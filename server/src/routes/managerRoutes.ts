import express from "express";
import {
  getManager,
  createManager,
  updateManager,
  getManagerProperties,
} from "../controllers/managerControllers";
import { bindSelf, requireSelf } from "../middleware/authMiddleware";

const router = express.Router();

router.get("/:cognitoId", requireSelf("cognitoId"), getManager);
router.put("/:cognitoId", requireSelf("cognitoId"), updateManager);
router.get("/:cognitoId/properties", requireSelf("cognitoId"), getManagerProperties);
router.post("/", bindSelf("cognitoId"), createManager);

export default router;
