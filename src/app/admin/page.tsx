import type { User as PrismaUser } from "@prisma/client";
import { getCurrentSession } from "@/lib/server/session";
import { redirect } from "next/navigation";
import { LogoutButton } from "../components";

export default async function Page() {
  const { user } = await getCurrentSession();
  if (!user) {
    redirect("/login");
  }

  const profile = user as PrismaUser;
  const image = `https://avatars.githubusercontent.com/u/${profile.githubId}`;

  return (
    <div className="flex flex-col items-center gap-12 pt-20">
      <h1 className="text-3xl font-bold">[admin]</h1>
      <div className="flex flex-col items-center gap-4">
        <img src={image} alt="profile" height="100" width="100" className="rounded-full" />
        <p className="font-semibold">{profile.email}</p>
        <LogoutButton />
      </div>
    </div>
  );
}