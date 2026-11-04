/* Dev-only data for ?data=demo|worst|empty|one|1000. Boundary cases match the brief. */
const base = (o, i) => ({id:"f" + i, company:"Sample Co", title:"Software Engineer, New Grad 2027", url:"https://example.com", location:"New York, NY", family:"swe", age_days:4, grad_year:"2027",
  sponsorship:{status:"yes", reason:"Posting mentions visa sponsorship."}, flags:[], score:4, matches:["Python"], gaps:["No cloud experience listed"], actions:["Lead with your Node.js API project"], first_seen:new Date().toISOString(), score_method:"fixture", ...o});
const worst = () => [
  {company:"Bank of America Merrill Lynch Global Technology and Operations", title:"Software Engineer, New Grad 2027 (Backend, Payments Infrastructure, Remote-Friendly)", location:"New York, NY; Charlotte, NC; Jersey City, NJ; Chicago, IL; Dallas, TX; Remote"},
  {sponsorship:{status:"likely", reason:"Inferred from H-1B filings. ".repeat(12)}, score:1, matches:[], gaps:Array.from({length:12}, (_, i) => "Gap number " + (i + 1)), actions:[]},
  {score:5, age_days:0, flags:["Posted 40 days ago","Evergreen posting","Location unclear","Salary missing","Reposted"], url:""},
  {title:"ソフトウェアエンジニア 新卒2027", company:"株式会社サンプル", age_days:null, family:"pm"},
  {age_days:340, sponsorship:{status:"no", reason:"Posting says: will not sponsor"}},
  {grad_year:"2025", family:"ops", sponsorship:{status:"unclear", reason:"Not stated."}},
].map((o, i) => base(o, i));
export function fixture(kind){
  const jobs = kind === "empty" ? [] : kind === "one" ? [base({}, 0)] : kind === "worst" ? worst()
    : kind === "1000" ? Array.from({length:1000}, (_, i) => base({company:"Company " + (i % 40), title:"Role " + i, age_days:i % 60, score:1 + (i % 9) / 2, family:["swe","pm","ops"][i % 3], sponsorship:{status:["yes","likely","unclear","no"][i % 4], reason:"Fixture"}}, i))
    : [base({}, 0), base({company:"Sample Insurance", family:"ops", sponsorship:{status:"unclear", reason:"Not stated in posting."}, score:3.5, age_days:12}, 1), base({sponsorship:{status:"likely", reason:"H-1B history."}, family:"pm", age_days:20}, 2)];
  return {generated_at:new Date().toISOString(), min_score:3.5, health:{}, jobs, fixture:kind};
}
