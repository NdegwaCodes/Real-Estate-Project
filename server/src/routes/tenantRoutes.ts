import express from "express";
import {
  getTenant,
  createTenant,
  updateTenant,
  getCurrentResidences,
  addFavoriteProperty,
  removeFavoriteProperty,
} from "../controllers/tenantControllers";
import { bindSelf, requireSelf } from "../middleware/authMiddleware";

const router = express.Router();

router.get("/:cognitoId", requireSelf("cognitoId"), getTenant);
router.put("/:cognitoId", requireSelf("cognitoId"), updateTenant);
router.post("/", bindSelf("cognitoId"), createTenant);
router.get("/:cognitoId/current-residences", requireSelf("cognitoId"), getCurrentResidences);
router.post("/:cognitoId/favorites/:propertyId", requireSelf("cognitoId"), addFavoriteProperty);
router.delete("/:cognitoId/favorites/:propertyId", requireSelf("cognitoId"), removeFavoriteProperty);

export default router;
