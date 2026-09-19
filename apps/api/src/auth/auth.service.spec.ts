import * as bcrypt from "bcrypt";

describe("password hashing", () => {
  it("hashes and verifies passwords", async () => {
    const hash = await bcrypt.hash("password123", 4);
    await expect(bcrypt.compare("password123", hash)).resolves.toBe(true);
    await expect(bcrypt.compare("wrong", hash)).resolves.toBe(false);
  });
});
