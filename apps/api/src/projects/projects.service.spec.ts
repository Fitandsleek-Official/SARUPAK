import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ProjectsService } from "./projects.service";

describe("ProjectsService authorization", () => {
  const prisma = {
    project: {
      findUnique: jest.fn(),
    },
  };

  const service = new ProjectsService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws NotFound when missing", async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(service.getOwned("u1", "p1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("throws Forbidden for other users", async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: "p1",
      userId: "other",
    });
    await expect(service.getOwned("u1", "p1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("returns project when owner matches", async () => {
    const project = { id: "p1", userId: "u1" };
    prisma.project.findUnique.mockResolvedValue(project);
    await expect(service.getOwned("u1", "p1")).resolves.toEqual(project);
  });
});
