import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Deskcomm from "./deskcomm";
export default async function Home(){const s=await createClient();const {data}=await s.auth.getClaims();if(!data?.claims)redirect("/login");return <Deskcomm userId={String(data.claims.sub)}/>}