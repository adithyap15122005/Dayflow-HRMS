import { SignJWT, jwtVerify, type JWTPayload } from "jose";

import type { Role } from "@/lib/domain/constants";

export const SESSION_COOKIE = "dayflow_session";

export type SessionClaims = {
  /** User id. */
  sub: string;
  role: Role;
  /** Employee record id, or null for a user with no employee profile. */
  eid: string | null;
  /** Display name, cached so the shell can render before any DB read. */
  name: string;
  /** Bumped server-side to invalidate issued tokens (role change, sign-out-all). */
  ver: number;
};

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or shorter than 32 characters. Run `npm run setup` to generate a .env file.",
    );
  }
  return new TextEncoder().encode(secret);
}

export function sessionTtlSeconds(): number {
  const hours = Number(process.env.SESSION_TTL_HOURS ?? 12);
  return (Number.isFinite(hours) && hours > 0 ? hours : 12) * 3600;
}

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  const ttl = sessionTtlSeconds();
  return new SignJWT({ ...claims } as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setIssuer("dayflow")
    .setAudience("dayflow-app")
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttl)
    .sign(secretKey());
}

/** Verify a token's signature, issuer, audience and expiry. */
export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: "dayflow",
      audience: "dayflow-app",
      algorithms: ["HS256"],
    });
    const { sub, role, eid, name, ver } = payload as unknown as SessionClaims;
    if (typeof sub !== "string" || typeof role !== "string") return null;
    return {
      sub,
      role: role as Role,
      eid: typeof eid === "string" ? eid : null,
      name: typeof name === "string" ? name : "",
      ver: typeof ver === "number" ? ver : 1,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionTtlSeconds(),
  };
}
