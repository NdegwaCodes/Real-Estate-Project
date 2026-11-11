import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getLeases = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: userId, role } = req.user!;
    const leases = await prisma.lease.findMany({
      where:
        role === "manager"
          ? { property: { managerCognitoId: userId } }
          : { tenantCognitoId: userId },
      include: {
        tenant: true,
        property: true,
      },
    });
    res.json(leases);
  } catch (error: any) {
    res
      .status(500)
      .json({ message: `Error retrieving leases: ${error.message}` });
  }
};

export const getLeasePayments = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { id: userId } = req.user!;
    const lease = await prisma.lease.findFirst({
      where: {
        id: Number(id),
        OR: [
          { tenantCognitoId: userId },
          { property: { managerCognitoId: userId } },
        ],
      },
      select: { id: true },
    });
    if (!lease) {
      res.status(404).json({ message: "Lease not found" });
      return;
    }
    const payments = await prisma.payment.findMany({
      where: { leaseId: Number(id) },
    });
    res.json(payments);
  } catch (error: any) {
    res
      .status(500)
      .json({ message: `Error retrieving lease payments: ${error.message}` });
  }
};
