import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const today = process.argv[2] ?? "2026-08-22";

const rows = await p.attendance.findMany({
  where: { workDate: today },
  include: { employee: { select: { firstName: true, employeeCode: true } } },
  orderBy: { checkInAt: "asc" },
});
console.log("today rows:", rows.length);
for (const r of rows) {
  console.log(
    " ",
    r.employee.employeeCode,
    r.employee.firstName.padEnd(9),
    r.status.padEnd(8),
    (r.checkInAt?.toISOString().slice(11, 16) ?? "-").padEnd(6),
    (r.checkOutAt?.toISOString().slice(11, 16) ?? "-").padEnd(6),
    "late",
    r.lateMinutes,
  );
}
console.log("employees:", await p.employee.count());
const late14 = await p.attendance.groupBy({
  by: ["employeeId"],
  where: { workDate: { gte: "2026-08-09" }, lateMinutes: { gt: 0 } },
  _count: { _all: true },
});
console.log("chronic-late (>=3 in 14d):", late14.filter((x) => x._count._all >= 3).length);
console.log(
  "unclosed past rows:",
  await p.attendance.count({
    where: { checkInAt: { not: null }, checkOutAt: null, workDate: { lt: today } },
  }),
);
console.log("no-salary employees:", await p.employee.count({ where: { salaryStructure: null } }));
const pend = await p.leaveRequest.findMany({
  where: { status: "PENDING" },
  include: { employee: { select: { firstName: true } } },
});
for (const r of pend) {
  console.log(
    "pending:",
    r.employee.firstName,
    r.startDate,
    "->",
    r.endDate,
    "age(h)",
    Math.round((Date.now() - r.createdAt.getTime()) / 3600000),
  );
}
await p.$disconnect();
