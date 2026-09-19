import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UsersService } from "../users/users.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: {
    email: string;
    password: string;
    displayName?: string;
  }) {
    const user = await this.users.createUser(input);
    return this.issueToken(user);
  }

  async login(input: { email: string; password: string }) {
    const user = await this.users.findByEmail(input.email);
    if (!user) {
      throw new UnauthorizedException("Invalid email or password.");
    }
    const ok = await this.users.verifyPassword(user.passwordHash, input.password);
    if (!ok) {
      throw new UnauthorizedException("Invalid email or password.");
    }
    return this.issueToken(user);
  }

  private issueToken(user: {
    id: string;
    email: string;
    displayName: string | null;
    createdAt: Date;
  }) {
    const accessToken = this.jwt.sign({
      sub: user.id,
      email: user.email,
    });
    return {
      accessToken,
      user: this.users.toPublic(user),
    };
  }
}
