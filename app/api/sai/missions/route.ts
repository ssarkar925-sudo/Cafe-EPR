import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createSaiMission, listSaiMissions, updateSaiMission } from "@/lib/sai/core/goals";
import type { SaiMissionStatus } from "@/lib/sai/core/types";
export const dynamic="force-dynamic";
async function authorize(){const role=await getUserRole();if(!hasRole(role,["admin","manager","staff"]))return null;const supabase=await createClient();const {data:auth}=await supabase.auth.getUser();if(!auth.user)return null;return {userId:auth.user.id,role};}
export async function GET(request:Request){
  const auth=await authorize();if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
  const url=new URL(request.url),goalId=url.searchParams.get("goalId")||undefined,rawStatus=url.searchParams.get("status");
  const status=["queued","running","waiting_approval","blocked","completed","failed","cancelled"].includes(rawStatus??"")?rawStatus as SaiMissionStatus:undefined;
  try{const missions=await listSaiMissions({userId:auth.userId,businessId:auth.userId,role:auth.role as string},{goalId,status});return NextResponse.json({missions});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to load missions"},{status:500});}
}
export async function POST(request:Request){
  const auth=await authorize();if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await request.json().catch(()=>null);if(!body||typeof body.goalId!=="string"||typeof body.title!=="string")return NextResponse.json({error:"goalId and title are required"},{status:400});
  try{const mission=await createSaiMission({userId:auth.userId,businessId:auth.userId,role:auth.role as string},{goalId:body.goalId,title:body.title,plan:isRecord(body.plan)?body.plan:{}});return NextResponse.json({mission},{status:201});}
  catch(error){const message=error instanceof Error?error.message:"Unable to create mission";return NextResponse.json({error:message},{status:message==="SAI_GOAL_NOT_FOUND"?404:400});}
}
export async function PATCH(request:Request){
  const auth=await authorize();if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await request.json().catch(()=>null);if(!body||typeof body.missionId!=="string")return NextResponse.json({error:"missionId is required"},{status:400});
  try{const mission=await updateSaiMission({userId:auth.userId,businessId:auth.userId,role:auth.role as string},body.missionId,{
    ...(typeof body.status==="string"&&["queued","running","waiting_approval","blocked","completed","failed","cancelled"].includes(body.status)?{status:body.status as SaiMissionStatus}:{}),
    ...(body.currentStep!==undefined?{currentStep:Number(body.currentStep)}:{}),...(body.attemptCount!==undefined?{attemptCount:Number(body.attemptCount)}:{}),
    ...(body.blockedReason!==undefined?{blockedReason:typeof body.blockedReason==="string"?body.blockedReason:null}:{}),
    ...(body.result!==undefined?{result:isRecord(body.result)?body.result:{}}:{})
  });return NextResponse.json({mission});}
  catch(error){const message=error instanceof Error?error.message:"Unable to update mission";return NextResponse.json({error:message},{status:message==="SAI_MISSION_NOT_FOUND"?404:400});}
}
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value);}