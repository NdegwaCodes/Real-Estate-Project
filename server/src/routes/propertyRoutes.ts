import express from "express";
import {
  getProperties,
  getProperty,
  createProperty,
} from "../controllers/propertyControllers";
import multer from "multer";
import { authMiddleware, bindSelf } from "../middleware/authMiddleware";

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const router = express.Router();

router.get("/", getProperties);
router.get("/:id", getProperty);
router.post(
  "/",
  authMiddleware(["manager"]),
  upload.array("photos"),
  bindSelf("managerCognitoId"),
  createProperty
);

export default router;
