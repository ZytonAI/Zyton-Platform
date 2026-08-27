import { getSession } from "@/lib/auth/session";
import { isOwner } from "@/lib/permissions";
import { memberBySlug, TEAM_SLUGS } from "@/lib/team";
import { VIEW_AS_COOKIE, VIEW_AS_MAX_AGE } from "@/lib/view-as";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  /** Slug del miembro cuya vista se quiere ver, o null para volver a la propia */
  slug: z.enum(TEAM_SLUGS).nullable(),
});

/**
 * Entra o sale de la vista de otra persona. Solo el Dueño de verdad
 * (`realRole`) puede pedirla: si no, la cookie no serviría de nada, pero
 * mejor ni dejarla puesta.
 */
export async function POST(request: Request) {
  const { user, realRole, realMember } = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOwner(realRole)) {
    return NextResponse.json(
      { error: "Solo el Dueño puede ver la plataforma como otra persona." },
      { status: 403 }
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Slug inválido" }, { status: 400 });

  const jar = await cookies();
  const { slug } = parsed.data;

  // Volver a la propia vista también es "ver como uno mismo"
  if (!slug || slug === realMember?.slug) {
    jar.delete(VIEW_AS_COOKIE);
    return NextResponse.json({ viewing_as: null });
  }

  jar.set(VIEW_AS_COOKIE, slug, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: VIEW_AS_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({ viewing_as: slug, name: memberBySlug(slug)?.name ?? slug });
}
