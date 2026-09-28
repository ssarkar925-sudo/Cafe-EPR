import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createSaiGoal, listSaiGoals, updateSaiGoal } from "@/lib/sai/core/goals";
import type { SaiGoalPriority, SaiGoalStatus } from "@/lib/sai/core/types";
export const dynamic = "force-dynamic";
async function authorize() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin","manager","staff"])) return null;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  return { userId: auth.user.id, role };
}
export async function GET(request: Request) {
  const auth = await authorize(); if (!auth) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
  const rawStatus = new URL(request.url).searchParams.get("status");
  const status = ["active","paused","completed","cancelled","failed"].includes(rawStatus ?? "") ? rawStatus as SaiGoalStatus : undefined;
  try {
    const goals = await listSaiGoals({ userId:auth.userId,businessId:auth.userId,role:auth.role as string }, status);
    return NextResponse.json({ goals });
  } catch(error){ return NextResponse.json({ error:error instanceof Error?error.message:"Unable to load goals" },{status:500}); }
}
export async function POST(request: Request) {
  const auth=await authorize(); if(!auth) return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await request.json().catch(()=>null);
  if(!body||typeof body.title!=="string"||typeof body.objective!=="string") return NextResponse.json({error:"title and objective are required"},{status:400});
  const priority=["low","normal","high","critical"].includes(body.priority)?body.priority as SaiGoalPriority:"normal";
  try{
    const goal=await createSaiGoal({userId:auth.userId,businessId:auth.userId,role:auth.role as string},{
      title:body.title,objective:body.objective,priority,target:isRecord(body.target)?body.target:{},
      successCriteria:Array.isArray(body.successCriteria)?body.successCriteria:[],context:isRecord(body.context)?body.context:{},
      nextAction:typeof body.nextAction==="string"?body.nextAction:undefined,dueAt:typeof body.dueAt==="string"?body.dueAt:null
    });
    return NextResponse.json({goal},{status:201});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to create goal"},{status:400});}
}
export async function PATCH(request: Request) {
  const auth=await authorize(); if(!auth) return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await request.json().catch(()=>null); if(!body||typeof body.goalId!=="string") return NextResponse.json({error:"goalId is required"},{status:400});
  try{
    const goal=await updateSaiGoal({userId:auth.userId,businessId:auth.userId,role:auth.role as string},body.goalId,{
      ...(typeof body.title==="string"?{title:body.title}:{}),...(typeof body.objective==="string"?{objective:body.objective}:{}),
      ...(typeof body.status==="string"&&["active","paused","completed","cancelled","failed"].includes(body.status)?{status:body.status as SaiGoalStatus}:{}),
      ...(typeof body.priority==="string"&&["low","normal","high","critical"].includes(body.priority)?{priority:body.priority as SaiGoalPriority}:{}),
      ...(body.target!==undefined?{target:isRecord(body.target)?body.target:{}}:{}),...(body.successCriteria!==undefined?{successCriteria:Array.isArray(body.successCriteria)?body.successCriteria:[]}:{}),
      ...(body.context!==undefined?{context:isRecord(body.context)?body.context:{}}:{}),...(body.nextAction!==undefined?{nextAction:typeof body.nextAction==="string"?body.nextAction:null}:{}),
      ...(body.dueAt!==undefined?{dueAt:typeof body.dueAt==="string"?body.dueAt:null}:{}),
    });
    return NextResponse.json({goal});
  }catch(error){const message=error instanceof Error?error.message:"Unable to update goal";return NextResponse.json({error:message},{status:message==="SAI_GOAL_NOT_FOUND"?404:400});}
}
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value);}