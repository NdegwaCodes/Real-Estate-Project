import { Request, Response, NextFunction } from "express";
import { CognitoJwtVerifier } from "aws-jwt-verify";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
      };
    }
  }
}

type IdTokenVerifier = ReturnType<
  typeof CognitoJwtVerifier.create<{ userPoolId: string; clientId: string; tokenUse: "id" }>
>;

let verifier: IdTokenVerifier | undefined;

const getVerifier = (): IdTokenVerifier => {
  if (!verifier) {
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    const clientId = process.env.COGNITO_USER_POOL_CLIENT_ID;
    if (!userPoolId || !clientId) {
      throw new Error(
        "COGNITO_USER_POOL_ID and COGNITO_USER_POOL_CLIENT_ID must be set"
      );
    }
    verifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: "id" });
  }
  return verifier;
};

export const authMiddleware = (allowedRoles: string[]) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const [scheme, token] = req.headers.authorization?.split(" ") ?? [];

    if (scheme !== "Bearer" || !token) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    let tokenVerifier: IdTokenVerifier;
    try {
      tokenVerifier = getVerifier();
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Authentication is not configured" });
      return;
    }

    let payload;
    try {
      payload = await tokenVerifier.verify(token);
    } catch {
      res.status(401).json({ message: "Invalid or expired token" });
      return;
    }

    const role = String(payload["custom:role"] ?? "").toLowerCase();
    req.user = { id: payload.sub, role };

    if (!allowedRoles.includes(role)) {
      res.status(403).json({ message: "Access Denied" });
      return;
    }

    next();
  };
};

export const requireSelf = (param: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || req.params[param] !== req.user.id) {
      res.status(403).json({ message: "Access Denied" });
      return;
    }
    next();
  };
};

export const bindSelf = (field: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    req.body = { ...(req.body ?? {}), [field]: req.user.id };
    next();
  };
};
