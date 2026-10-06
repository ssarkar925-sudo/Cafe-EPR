const { execFile } = require("child_process");
const path = require("path");
function candidates(){
 const c=[];
 if(process.env.CAFECAM_MANAGER_PATH)c.push(process.env.CAFECAM_MANAGER_PATH);
 if(process.platform==="win32")c.push(path.join(process.env.ProgramFiles||"C:\\Program Files","CafeERP","CafeCAM","CafeCamManager.exe"));
 c.push(path.join(__dirname,"..","cafecam","native","bin","x64","Release","CafeCamManager.exe"));
 return [...new Set(c)];
}
function runCafeCam(args){
 return new Promise(resolve=>{
  if(process.platform!=="win32"){resolve({success:false,error:"CafeCAM native controls require Windows 11."});return;}
  const c=candidates();
  const next=i=>{
   if(!c[i]){resolve({success:false,error:"CafeCamManager.exe was not found. Install CafeCAM first."});return;}
   execFile(c[i],args,{windowsHide:true,timeout:20000,maxBuffer:1024*1024},(error,stdout,stderr)=>{
    if(error&&error.code==="ENOENT"){next(i+1);return;}
    let data=null;try{data=JSON.parse(String(stdout||"").trim());}catch{}
    resolve({success:!error,data,stdout:String(stdout||"").trim(),stderr:String(stderr||"").trim(),error:error?error.message:null});
   });
  };
  next(0);
 });
}
module.exports={runCafeCam};