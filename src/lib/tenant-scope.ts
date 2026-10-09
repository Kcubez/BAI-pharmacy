import type { auth } from "@/lib/auth";

type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

export function isAdminSession(session: Session) {
  return session?.user.role === "admin";
}

export function ownedByUserOrAdmin(session: Session, ownerField = "userId") {
  if (!session) return {};
  return { [ownerField]: session.user.id };
}

export function uploadedByUserOrAdmin(session: Session) {
  if (!session) return {};
  return { uploadedByUserId: session.user.id };
}

export function senderOwnedByUserOrAdmin(session: Session) {
  if (!session) return {};
  return { sender: { userId: session.user.id } };
}

export function customerOwnedByUserOrAdmin(session: Session) {
  if (!session) return {};
  return { userId: session.user.id };
}
