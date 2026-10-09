export const PLAN_REVIEW_DAYS = [30, 60, 90] as const;
export type PlanReviewDay = typeof PLAN_REVIEW_DAYS[number];
export type PlanProgressReview = {day:PlanReviewDay; comment:string; feedback:string|null; updatedAt:string; feedbackAt:string|null};
export type PlanProgressSnapshot = {
  order: {id:string; hasPlan:boolean; requestedDeliveryDate:string|null; estimatedDeliveryDate:string|null; planStartedOn:string|null; planEndsOn:string|null; progressVersion:number};
  today:string;
  sessions:string[];
  reviews:PlanProgressReview[];
};

export function isPlanDate(value:unknown):value is string {
  if (typeof value !== 'string' || !/^(20\d{2}|2100)-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function addPlanDays(value:string, days:number) {
  const parsed = new Date(`${value}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function mexicoToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Mexico_City', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}

export function formatPlanDate(value:string|null|undefined) {
  return value && isPlanDate(value) ? new Intl.DateTimeFormat('es-MX', {timeZone:'UTC', day:'numeric', month:'long', year:'numeric'}).format(new Date(`${value}T00:00:00Z`)) : 'Por acordar';
}
