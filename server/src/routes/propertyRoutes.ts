import express from "express";
import {
  getProperties,
  getProperty,
  createProperty,
  getPropertyLeases,
} from "../controllers/propertyControllers";
import multer from "multer";
import { authMiddleware, bindSelf } from "../middleware/authMiddleware";

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const router = express.Router();

router.get("/", getProperties);
router.get("/:id", getProperty);
router.get("/:id/leases", authMiddleware(["manager"]), getPropertyLeases);
router.post(
  "/",
  authMiddleware(["manager"]),
  upload.array("photos"),
  bindSelf("managerCognitoId"),
  createProperty
);

export default router;
