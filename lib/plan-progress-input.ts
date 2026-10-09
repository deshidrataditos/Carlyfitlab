import {MemberInputError} from './member-input';
import {storeId} from './store-input';
import {addPlanDays, isPlanDate, PLAN_REVIEW_DAYS, type PlanReviewDay} from './plan-progress';

type BaseInput = {orderId:string; requestId:string; expectedVersion:number};
export type PlanProgressInput = BaseInput & (
  {action:'session'; date:string; completed:boolean} |
  {action:'review'; day:PlanReviewDay; comment:string} |
  {action:'feedback'; day:PlanReviewDay; feedback:string} |
  {action:'dates'; estimatedDeliveryDate:string|null; planStartedOn:string|null}
);

function progressText(value:unknown) {
  if (typeof value !== 'string') throw new MemberInputError('Escribe un comentario sobre tu entrenamiento.');
  const text = value.trim();
  if ([...text].length < 3 || [...text].length > 1200 || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new MemberInputError('Usa de 3 a 1200 caracteres, sin etiquetas.');
  return text;
}

function progressDate(value:unknown):string|null {
  if (value === null) return null;
  if (!isPlanDate(value)) throw new MemberInputError('Usa una fecha válida con formato año-mes-día.');
  return value;
}

export function progressQuery(url:string) {
  const params = new URL(url).searchParams;
  if ([...params.keys()].some(key => key !== 'orderId') || params.getAll('orderId').length !== 1) throw new MemberInputError('Revisa el pedido que quieres consultar.');
  return storeId(params.get('orderId'));
}

export function progressInput(data:Record<string,unknown>, admin:boolean):PlanProgressInput {
  const fields:Record<string,string[]> = admin ? {dates:['estimatedDeliveryDate', 'planStartedOn'], feedback:['day', 'feedback']} : {session:['date', 'completed'], review:['day', 'comment']};
  if (typeof data.action !== 'string' || !Object.hasOwn(fields, data.action)) throw new MemberInputError('La acción de seguimiento no es válida.');
  const allowed = ['action', 'orderId', 'requestId', 'expectedVersion', ...fields[data.action]];
  if (Object.keys(data).length !== allowed.length || Object.keys(data).some(key => !allowed.includes(key))) throw new MemberInputError('Comparte solo los datos de seguimiento solicitados.');
  if (typeof data.expectedVersion !== 'number' || !Number.isInteger(data.expectedVersion) || data.expectedVersion < 0 || data.expectedVersion > 2147483646) throw new MemberInputError('Actualiza el seguimiento antes de guardar.');
  const base = {orderId:storeId(data.orderId), requestId:storeId(data.requestId), expectedVersion:data.expectedVersion};
  if (data.action === 'dates') {
    const planStartedOn = progressDate(data.planStartedOn);
    if (planStartedOn && !isPlanDate(addPlanDays(planStartedOn, 89))) throw new MemberInputError('La fecha de inicio debe permitir un periodo completo de 90 días.');
    return {...base, action:'dates', estimatedDeliveryDate:progressDate(data.estimatedDeliveryDate), planStartedOn};
  }
  if (data.action === 'session') {
    if (!isPlanDate(data.date) || typeof data.completed !== 'boolean') throw new MemberInputError('Revisa la fecha y el estado de la sesión.');
    return {...base, action:'session', date:data.date, completed:data.completed};
  }
  if (typeof data.day !== 'number' || !PLAN_REVIEW_DAYS.includes(data.day as PlanReviewDay)) throw new MemberInputError('Elige la revisión de los días 30, 60 o 90.');
  if (data.action === 'review') return {...base, action:'review', day:data.day as PlanReviewDay, comment:progressText(data.comment)};
  return {...base, action:'feedback', day:data.day as PlanReviewDay, feedback:progressText(data.feedback)};
}
