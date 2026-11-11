import express from "express";
import { mpesaCallback } from "../controllers/mpesaControllers";

const router = express.Router();

router.post("/callback/:token", mpesaCallback);

export default router;
