import { decryptJson, encryptJson } from "@/lib/crypto";
import { optionalEnv } from "@/lib/config";
import { prisma } from "@/lib/prisma";

export type OuraTokenData = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope?: string;
};

export type IntervalsData = {
  apiKey: string;
  athleteId: string;
};

export type ConnectionProvider = "oura" | "intervals";

export async function saveConnection(provider: ConnectionProvider, value: unknown) {
  return prisma.connection.upsert({
    where: { provider },
    update: { encryptedData: encryptJson(value) },
    create: { provider, encryptedData: encryptJson(value) }
  });
}

export async function getConnection<T>(provider: ConnectionProvider) {
  const connection = await prisma.connection.findUnique({ where: { provider } });
  if (!connection) return null;
  return decryptJson<T>(connection.encryptedData);
}

export async function getIntervalsConfig(): Promise<IntervalsData | null> {
  const stored = await getConnection<IntervalsData>("intervals");
  if (stored?.apiKey) return stored;
  const apiKey = optionalEnv("INTERVALS_API_KEY");
  if (!apiKey) return null;
  return {
    apiKey,
    athleteId: optionalEnv("INTERVALS_ATHLETE_ID") || "0"
  };
}
