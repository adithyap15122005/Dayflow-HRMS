import { redirect } from "next/navigation";

/**
 * Root is a router only. Middleware has already decided whether a session
 * exists, so anyone reaching this point belongs in the app shell.
 */
export default function RootPage() {
  redirect("/overview");
}
