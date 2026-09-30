export type CatalogItem = { id: string; name: string; price: number; kind: 'product' | 'plan'; description: string; image?: string; tag?: string; features?: string[] };
export const catalog: CatalogItem[] = [
 {id:'rutina-90',name:'Activa tu fuerza',price:1490,kind:'plan',description:'Una ruta de entrenamiento para avanzar a tu ritmo.',features:['Rutina de entrenamiento de 90 días','Adaptada a tu objetivo y experiencia','Atención en línea o presencial']},
 {id:'integral-90',name:'Tu balance completo',price:2490,kind:'plan',description:'Entrenamiento y alimentación que trabajan juntos.',features:['Rutina de entrenamiento de 90 días','Plan de alimentación personalizado','Opción de integrar tus postres favoritos','Atención en línea o presencial']},
 {id:'dulce-90',name:'El lado dulce del plan',price:2990,kind:'plan',description:'Tu plan integral, con una selección de postres incluida.',features:['Todo lo del plan Tu balance completo','Selección de postres Carlyfit Lab','Porciones adaptadas a tu alimentación','Selección y entregas por acordar']},
 {id:'mermelada',name:'Mermelada sin azúcar',price:129,kind:'product',description:'Un toque de sabor para acompañar tus desayunos y antojos. Consulta los sabores y presentaciones disponibles.',image:'/images/strawberry-jam.png',tag:'PARA TUS MAÑANAS'},
 {id:'galletas',name:'Galletas de alulosa',price:149,kind:'product',description:'Una pausa deliciosa, hecha para disfrutarse. Pregunta por sabores, ingredientes y la presentación de tu pedido.',image:'/images/allulose-cookies.png',tag:'TU PAUSA FAVORITA'},
 {id:'golden-milk',name:'Golden milk',price:189,kind:'product',description:'Dale un momento cálido a tu día. Consulta la presentación disponible y las indicaciones de preparación.',image:'/images/golden-milk.png',tag:'UN RITUAL DELICIOSO'},
];
export const money = (value:number) => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(value);
export const whatsapp = (message:string) => `https://wa.me/5214433580280?text=${encodeURIComponent(message)}`;
export type CartLine = { id: string; quantity: number };
export function validateCart(value:unknown): CartLine[] {
 if(!Array.isArray(value)||!value.length||value.length>catalog.length)throw new Error('Selecciona al menos un producto o plan.');
 const seen = new Set<string>();
 return value.map((row:unknown)=>{if(!row||typeof row!=='object')throw new Error('Carrito inválido.');const {id,quantity}=row as CartLine;if(typeof id!=='string'||!catalog.some(p=>p.id===id)||seen.has(id)||!Number.isInteger(quantity)||quantity<1||quantity>20)throw new Error('Producto o cantidad inválida.');seen.add(id);return {id,quantity};});
}
