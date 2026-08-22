import { requireVerifiedUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { jsonOk, readJson, route } from "@/lib/http";
import { notificationReadSchema } from "@/lib/validation";

export const GET = route(async (request: Request) => {
  const user = await requireVerifiedUser();
  const url = new URL(request.url);
  const take = Math.min(50, Math.max(1, Number(url.searchParams.get("take") ?? 20)));
  const unreadOnly = url.searchParams.get("unread") === "1";

  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      // Scoped by userId, so one user can never read another's inbox.
      where: { userId: user.userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.notification.count({ where: { userId: user.userId, readAt: null } }),
  ]);

  return jsonOk({
    unread,
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      href: n.href,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
  });
});

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
