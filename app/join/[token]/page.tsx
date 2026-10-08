import { redirect } from "next/navigation";

/**
 * The link an invitation carries. A signed-out visitor is bounced to login
 * by the middleware with this path as `next`, and lands back here afterwards;
 * either way the token ends up on the onboarding page, where the database
 * decides whether this account may accept it.
 */
export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/onboarding?invite=${encodeURIComponent(token)}`);
}
