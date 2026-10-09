'use client';

import {ArrowUpRight, MapPin, PlayCircle} from 'lucide-react';

export type ProductFacts = {ingredients?:string;allergens?:string;storage?:string;preparation?:string;servings?:string;shipping?:string};
export type PublicStoreContent = {products:Record<string,ProductFacts>;presentationVideoUrl?:string;secondaryVideoUrl?:string;googleMapsUrl?:string;businessHours?:string;instagramUrl?:string};
export const emptyStoreContent:PublicStoreContent={products:{}};

const labels:[keyof ProductFacts,string][]=[['ingredients','Ingredientes principales'],['allergens','Alérgenos'],['storage','Conservación'],['preparation','Anticipación del pedido'],['servings','Presentación'],['shipping','Entrega y envío']];

export function ProductInformation({facts}:{facts?:ProductFacts}){
 return <details className="product-information"><summary>Ingredientes, conservación y entrega</summary><dl>{labels.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{facts?.[key]?.trim()||'Consulta este dato con Carly antes de confirmar tu pedido.'}</dd></div>)}</dl></details>;
}

export function StudioLinks({content}:{content:PublicStoreContent}){
 const videos=[content.presentationVideoUrl,content.secondaryVideoUrl].filter((url):url is string=>Boolean(url));
 if(!videos.length&&!content.googleMapsUrl&&!content.businessHours&&!content.instagramUrl)return null;
 return <section className="wrap studio-links" aria-label="Conoce Carlyfit Lab"><div><p className="eyebrow">MÁS CERCA DE CARLY</p><h2>Conoce nuestro <em>día a día.</em></h2>{content.businessHours&&<p className="studio-hours">{content.businessHours}</p>}{videos.some(url=>url.includes('facebook.com/'))&&<p className="studio-hours">Nuestros videos se abren en Facebook. Es posible que te pida iniciar sesión.</p>}</div><div className="studio-actions">{videos.map((url,index)=><a className="button outline" href={url} key={url} target="_blank" rel="noopener noreferrer"><PlayCircle size={20}/> {index===0?'Ver video de Carly':'Ver otro video de Carly'} <ArrowUpRight size={17}/></a>)}{content.instagramUrl&&<a className="button outline" href={content.instagramUrl} target="_blank" rel="noopener noreferrer">Síguenos en Instagram <ArrowUpRight size={17}/></a>}{content.googleMapsUrl&&<a className="button outline" href={content.googleMapsUrl} target="_blank" rel="noopener noreferrer"><MapPin size={20}/> Ver en Google Maps <ArrowUpRight size={17}/></a>}</div></section>;
}
