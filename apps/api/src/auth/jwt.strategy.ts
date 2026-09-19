import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { Request } from "express";

export interface JwtPayload {
  sub: string;
  email: string;
}

function fromAuthHeaderOrQuery(req: Request): string | null {
  const header = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (header) return header;
  const token = req.query?.token;
  return typeof token === "string" && token.length > 0 ? token : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: fromAuthHeaderOrQuery,
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET") ?? "dev-only-change-me",
    });
  }

  validate(payload: JwtPayload) {
    return { userId: payload.sub, email: payload.email };
  }
}
