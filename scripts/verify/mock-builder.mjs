// Admin mock builder over HTTP with real session cookies and scoped cleanup.
// node --env-file=.env.local scripts/verify/mock-builder.mjs <baseUrl>
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const BASE = process.argv[2] ?? "http://127.0.0.1:3002";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL || !PUB || !SECRET) throw new Error("missing Supabase env");
const service = createClient(URL, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = Date.now(); const password = `MockVerify${stamp}x`; const people = {}; const made = { mocks: [], questions: [], sections: [] };
let passes = 0;
function check(name, pass, detail = "") { console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`); if (!pass) throw new Error(name); passes += 1; }
async function signIn(email) { const jar=[]; const ssr=createServerClient(URL,PUB,{cookies:{getAll:()=>[],setAll:(v)=>jar.push(...v)}}); const {data,error}=await ssr.auth.signInWithPassword({email,password}); if(error)throw error; return {cookie:jar.map(c=>`${c.name}=${c.value}`).join("; "),client:createClient(URL,PUB,{auth:{autoRefreshToken:false,persistSession:false},global:{headers:{Authorization:`Bearer ${data.session.access_token}`}}})}; }
async function person(key,role){const email=`mock-${key}-${stamp}@example.com`;const {data,error}=await service.auth.admin.createUser({email,email_confirm:true,password});if(error)throw error;const {error:pe}=await service.from("profiles").insert({id:data.user.id,email,name:`Mock ${key}`,org_id:1,role});if(pe)throw pe;people[key]={id:data.user.id,...await signIn(email)};}
async function get(path,key){const r=await fetch(`${BASE}${path}`,{headers:key?{cookie:people[key].cookie}:{},redirect:"manual"});return{status:r.status,location:r.headers.get("location"),body:await r.text()};}
const forms=(html)=>[...html.matchAll(/<form[\s\S]*?<\/form>/g)].map(m=>m[0]);
const decode=(s)=>s.replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&");
function hidden(form){const out=[];for(const m of form.matchAll(/<input [^>]*>/g)){if(!/type="hidden"/.test(m[0]))continue;const n=m[0].match(/name="([^"]*)"/)?.[1];if(n)out.push([decode(n),decode(m[0].match(/value="([^"]*)"/)?.[1]??"")]);}return out;}
async function post(path,key,form,fields){const body=new FormData();const names=new Set(fields.map(([n])=>n));for(const [n,v] of hidden(form))if(!names.has(n))body.append(n,v);for(const [n,v] of fields)body.append(n,String(v));const r=await fetch(`${BASE}${path}`,{method:"POST",body,headers:{cookie:people[key].cookie,origin:BASE},redirect:"manual"});return{status:r.status,location:r.headers.get("location"),body:await r.text()};}
async function saveQuestion(input){const {data,error}=await people.admin.client.rpc("save_question",input);if(error)throw error;made.questions.push(data);return data;}

try {
  await person("admin","admin"); await person("student","student");
  const {data:section,error:se}=await service.from("question_sections").insert({org_id:1,name:`Mock QA ${stamp}`}).select("id").single();if(se)throw se;made.sections.push(section.id);
  const q=await saveQuestion({p_question_id:null,p_type:"mcq",p_body:`Mock question ${stamp}`,p_options:[{id:"a",text:"A"},{id:"b",text:"B"}],p_images:[],p_parent_id:null,p_section_id:section.id,p_topic:"Mock topic",p_difficulty:"easy",p_marks:3,p_correct_answer:{options:["a"]},p_solution:null});
  const stimulus=await saveQuestion({p_question_id:null,p_type:"di_stimulus",p_body:`DI passage ${stamp}`,p_options:[],p_images:[],p_parent_id:null,p_section_id:section.id,p_topic:"DI",p_difficulty:"medium",p_marks:0,p_correct_answer:null,p_solution:null});
  const child=await saveQuestion({p_question_id:null,p_type:"numerical",p_body:`DI child ${stamp}`,p_options:[],p_images:[],p_parent_id:stimulus,p_section_id:section.id,p_topic:"DI",p_difficulty:"medium",p_marks:3,p_correct_answer:{accepted:["1"],tolerance:0},p_solution:null});

  check("anonymous and student are refused the admin mock list",(await get("/admin/mocks")).status===307&&(await get("/admin/mocks","student")).status===307);
  const fresh=await get("/admin/mocks/new","admin"); check("new mock screen loads with settings and active questions",fresh.status===200&&fresh.body.includes(`Mock question ${stamp}`)&&fresh.body.includes("Overall timer only"));
  const form=forms(fresh.body).find(f=>f.includes('name="title"')&&f.includes('name="timingMode"'));if(!form)throw new Error("mock form absent");
  const created=await post("/admin/mocks/new","admin",form,[["title",`Verify mock ${stamp}`],["instructions","Read carefully"],["durationMinutes","120"],["maxAttempts","2"],["negativeMarking","1"],["negative_mcq","on"],["negative_mcq_multi","on"],["allowMobile","on"],["timingMode","overall"],["questionId",q],[`questionSection_${q}`,"0"]]);
  const id=Number((created.location??"").match(/\/admin\/mocks\/(\d+)/)?.[1]);if(id)made.mocks.push(id);
  check("admin creates an overall-timed mock and lands on it",created.status===303&&Number.isInteger(id),created.location??"");
  let {data:sections}=await service.from("mock_sections").select("id,duration_minutes").eq("mock_id",id);let {data:links}=await service.from("mock_questions").select("question_id").eq("mock_id",id);
  check("overall timing stores one implicit untimed section",sections?.length===1&&sections[0].duration_minutes===null);
  check("the selected bank question is attached",links?.length===1&&links[0].question_id===q);

  let edit=await get(`/admin/mocks/${id}`,"admin");let editForm=forms(edit.body).find(f=>f.includes('name="mockId"'));if(!editForm)throw new Error("edit form absent");
  const bad=await post(`/admin/mocks/${id}`,"admin",editForm,[["mockId",id],["title",`Verify mock ${stamp}`],["durationMinutes","120"],["maxAttempts","2"],["negativeMarking","1"],["timingMode","sectional"],["sectionTitle_0","QA"],["sectionDuration_0","50"],["sectionTitle_1","LR"],["sectionDuration_1","50"]]);
  check("section durations that do not total 120 are refused before writing",bad.location===`/admin/mocks/${id}?error=duration`);

  edit=await get(`/admin/mocks/${id}`,"admin");editForm=forms(edit.body).find(f=>f.includes('name="mockId"'));
  const good=await post(`/admin/mocks/${id}`,"admin",editForm,[["mockId",id],["title",`Verify mock ${stamp}`],["durationMinutes","120"],["maxAttempts","3"],["negativeMarking","0"],["proctoringEnabled","on"],["timingMode","sectional"],["sectionTitle_0","QA"],["sectionDuration_0","60"],["sectionTitle_1","DI"],["sectionDuration_1","60"],["questionId",stimulus],[`questionSection_${stimulus}`,"1"]]);
  check("valid sectional settings save",good.location===`/admin/mocks/${id}?notice=saved`,good.location??"");
  ({data:sections}=await service.from("mock_sections").select("id,title,duration_minutes").eq("mock_id",id));({data:links}=await service.from("mock_questions").select("question_id,mock_section_id").eq("mock_id",id));
  check("sectional durations add exactly to the full duration",sections?.length===2&&sections.reduce((s,r)=>s+r.duration_minutes,0)===120);
  const diSection=sections?.find(s=>s.title==="DI")?.id;check("selecting a DI set adds passage and every child to one section",links?.length===2&&links.every(r=>r.mock_section_id===diSection)&&links.some(r=>r.question_id===child));

  const {data:studentRows}=await people.student.client.from("mocks").select("id").eq("id",id);check("student reads zero mock-builder rows through the API",(studentRows??[]).length===0);
  console.log(`\n${passes} of ${passes} passed`);
} finally {
  if(made.mocks.length)await service.from("mocks").delete().in("id",made.mocks);
  if(made.questions.length){await service.from("question_keys").delete().in("question_id",made.questions);await service.from("questions").delete().in("id",made.questions);}
  if(made.sections.length)await service.from("question_sections").delete().in("id",made.sections);
  for(const p of Object.values(people)){await service.from("profiles").delete().eq("id",p.id);await service.auth.admin.deleteUser(p.id);}
  const counts={};for(const table of ["mocks","mock_sections","mock_questions","questions","question_keys","question_sections","profiles","courses","documents"]){const {count}=await service.from(table).select("*",{count:"exact",head:true});counts[table]=count;}console.log(`live counts after cleanup: ${JSON.stringify(counts)}`);
}
