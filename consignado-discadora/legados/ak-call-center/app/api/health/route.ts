import {NextResponse} from "next/server";
export async function GET(){return NextResponse.json({ok:true,service:"ak-call-center",timestamp:new Date().toISOString(),supabaseConfigured:Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)});}
