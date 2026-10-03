export type CatalogItem = { id: string; name: string; price: number; priceProvisional: boolean; kind: 'product' | 'plan'; description: string; presentation?: string; image?: string; tag?: string; features?: string[] };
export const catalog: CatalogItem[] = [
 {id:'rutina-90',name:'Activa tu fuerza',price:1490,priceProvisional:true,kind:'plan',description:'Una ruta de entrenamiento para avanzar a tu ritmo.',features:['Rutina de entrenamiento de 90 días','Adaptada a tu objetivo y experiencia','Atención en línea o presencial']},
 {id:'integral-90',name:'Tu balance completo',price:2490,priceProvisional:true,kind:'plan',description:'Entrenamiento y alimentación que trabajan juntos.',features:['Rutina de entrenamiento de 90 días','Plan de alimentación personalizado','Opción de integrar tus postres favoritos','Atención en línea o presencial']},
 {id:'dulce-90',name:'El lado dulce del plan',price:2990,priceProvisional:true,kind:'plan',description:'Prueba nuestros productos y decide con Carly cuáles integrar a tu alimentación.',features:['Todo lo del plan Tu balance completo','Un paquete inicial de postres Carlyfit Lab','Contenido y entrega acordados con Carly','Postres adicionales se compran por separado']},
 {id:'mermelada',name:'Mermelada sin azúcar',price:129,priceProvisional:true,kind:'product',presentation:'300 g',description:'Un toque de sabor para acompañar tus desayunos y antojos. Presentación de 300 g; consulta los sabores disponibles.',image:'/images/strawberry-jam.png',tag:'PARA TUS MAÑANAS'},
 {id:'galletas',name:'Psy Cookie',price:59,priceProvisional:false,kind:'product',presentation:'1 pieza',description:'Galleta de chocolate con adaptógenos y semillas de cáñamo por encima. Una pausa deliciosa para disfrutar por pieza.',image:'/images/psy-cookie.png',tag:'CHOCOLATE + CÁÑAMO'},
 {id:'core-cookie',name:'Core Cookie',price:55,priceProvisional:false,kind:'product',presentation:'1 pieza',description:'Galleta de vainilla con un centro firme de chocolate. Dos sabores que se encuentran en cada mordida.',image:'/images/core-cookie.png',tag:'VAINILLA + CHOCOLATE'},
 {id:'golden-milk',name:'Golden milk',price:189,priceProvisional:true,kind:'product',presentation:'250 g',description:'Dale un momento cálido a tu día. Presentación de 250 g; consulta las indicaciones de preparación.',image:'/images/golden-milk.png',tag:'UN RITUAL DELICIOSO'},
];
export const money = (value:number) => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(value);
export const whatsapp = (message:string) => `https://wa.me/5214433580280?text=${encodeURIComponent(message)}`;
export type CartLine = { id: string; quantity: number };
export function validateCart(value:unknown): CartLine[] {
 if(!Array.isArray(value)||!value.length||value.length>catalog.length)throw new Error('Selecciona al menos un producto o plan.');
 const seen = new Set<string>();
 return value.map((row:unknown)=>{if(!row||typeof row!=='object')throw new Error('Carrito inválido.');const {id,quantity}=row as CartLine;if(typeof id!=='string'||!catalog.some(p=>p.id===id)||seen.has(id)||!Number.isInteger(quantity)||quantity<1||quantity>20)throw new Error('Producto o cantidad inválida.');seen.add(id);return {id,quantity};});
}
