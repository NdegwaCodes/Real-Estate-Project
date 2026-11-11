import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const listApplications = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id: userId, role } = req.user!;

    const whereClause =
      role === "manager"
        ? { property: { managerCognitoId: userId } }
        : { tenantCognitoId: userId };

    const applications = await prisma.application.findMany({
      where: whereClause,
      include: {
        property: {
          include: {
            location: true,
            manager: true,
          },
        },
        tenant: true,
      },
    });

    function calculateNextPaymentDate(startDate: Date): Date {
      const today = new Date();
      const nextPaymentDate = new Date(startDate);
      while (nextPaymentDate <= today) {
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
      }
      return nextPaymentDate;
    }

    const formattedApplications = await Promise.all(
      applications.map(async (app) => {
        const lease = await prisma.lease.findFirst({
          where: {
            tenant: {
              cognitoId: app.tenantCognitoId,
            },
            propertyId: app.propertyId,
          },
          orderBy: { startDate: "desc" },
        });

        return {
          ...app,
          property: {
            ...app.property,
            address: app.property.location.address,
          },
          manager: app.property.manager,
          lease: lease
            ? {
                ...lease,
                nextPaymentDate: calculateNextPaymentDate(lease.startDate),
              }
            : null,
        };
      })
    );

    res.json(formattedApplications);
  } catch (error: any) {
    res
      .status(500)
      .json({ message: `Error retrieving applications: ${error.message}` });
  }
};

export const createApplication = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      propertyId,
      tenantCognitoId,
      name,
      email,
      phoneNumber,
      message,
    } = req.body;

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });

    if (!property) {
      res.status(404).json({ message: "Property not found" });
      return;
    }

    const existing = await prisma.application.findFirst({
      where: { propertyId, tenantCognitoId, status: "Pending" },
      select: { id: true },
    });
    if (existing) {
      res
        .status(409)
        .json({ message: "You already have a pending application for this property" });
      return;
    }

    const newApplication = await prisma.application.create({
      data: {
        applicationDate: new Date(),
        status: "Pending",
        name,
        email,
        phoneNumber,
        message,
        property: { connect: { id: propertyId } },
        tenant: { connect: { cognitoId: tenantCognitoId } },
      },
      include: {
        property: true,
        tenant: true,
        lease: true,
      },
    });

    res.status(201).json(newApplication);
  } catch (error: any) {
    res
      .status(500)
      .json({ message: `Error creating application: ${error.message}` });
  }
};

export const updateApplicationStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const application = await prisma.application.findUnique({
      where: { id: Number(id) },
      include: {
        property: true,
        tenant: true,
      },
    });

    if (
      !application ||
      application.property.managerCognitoId !== req.user!.id
    ) {
      res.status(404).json({ message: "Application not found." });
      return;
    }

    if (!["Approved", "Denied"].includes(status)) {
      res.status(400).json({ message: "Status must be Approved or Denied" });
      return;
    }
    if (application.status !== "Pending") {
      res
        .status(409)
        .json({ message: `Application is already ${application.status}` });
      return;
    }

    if (status === "Approved") {
      await prisma.$transaction(async (tx) => {
        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setFullYear(endDate.getFullYear() + 1);

        const lease = await tx.lease.create({
          data: {
            startDate,
            endDate,
            rent: application.property.pricePerMonth,
            deposit: application.property.securityDeposit,
            propertyId: application.propertyId,
            tenantCognitoId: application.tenantCognitoId,
          },
        });

        await tx.property.update({
          where: { id: application.propertyId },
          data: {
            tenants: { connect: { cognitoId: application.tenantCognitoId } },
          },
        });

        await tx.application.update({
          where: { id: application.id },
          data: { status, leaseId: lease.id },
        });
      });
    } else {
      await prisma.application.update({
        where: { id: application.id },
        data: { status },
      });
    }

    // Respond with the updated application details
    const updatedApplication = await prisma.application.findUnique({
      where: { id: Number(id) },
      include: {
        property: true,
        tenant: true,
        lease: true,
      },
    });

    res.json(updatedApplication);
  } catch (error: any) {
    res
      .status(500)
      .json({ message: `Error updating application status: ${error.message}` });
  }
};
