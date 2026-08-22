import { requireVerifiedUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { jsonOk, readJson, route } from "@/lib/http";
import { notificationReadSchema } from "@/lib/validation";

/** Dedicated endpoint so the bell can mark-all-read without a list round trip. */
export const POST = route(async (request: Request) => {
  const user = await requireVerifiedUser();
  const { ids, all } = notificationReadSchema.parse(await readJson(request));

  const result = await prisma.notification.updateMany({
    where: {
      userId: user.userId,
      readAt: null,
      ...(all ? {} : { id: { in: ids ?? [] } }),
    },
    data: { readAt: new Date() },
  });

  const unread = await prisma.notification.count({
    where: { userId: user.userId, readAt: null },
  });
  return jsonOk({ updated: result.count, unread });
});
