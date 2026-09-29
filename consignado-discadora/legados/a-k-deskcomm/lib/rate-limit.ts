import "server-only";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const memory=new Map<string,{count:number;reset:number}>();
let limiter:Ratelimit|undefined;
function getLimiter(){if(limiter)return limiter;const url=process.env.UPSTASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN;if(!url||!token)return undefined;limiter=new Ratelimit({redis:new Redis({url,token,enableTelemetry:false}),limiter:Ratelimit.slidingWindow(60,"1 m"),analytics:false,prefix:"ak-deskcomm"});return limiter}
export async function rateLimit(id:string){const distributed=getLimiter();if(distributed){const r=await distributed.limit(id);return {ok:r.success,remaining:r.remaining}}const now=Date.now(),cur=memory.get(id);if(!cur||cur.reset<=now){memory.set(id,{count:1,reset:now+60000});return {ok:true,remaining:59}}if(cur.count>=60)return {ok:false,remaining:0};cur.count++;return {ok:true,remaining:60-cur.count}}
