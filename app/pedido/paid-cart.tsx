'use client';

import {useEffect} from 'react';
import {settleCheckout} from '@/lib/cart-state';
import {updateCart} from '@/lib/cart-storage';

// Rendered only for an order approved in the server database, never from
// Mercado Pago's untrusted return parameters (status/collection_status).
export default function PaidCart({orderId}:{orderId:string}){
 useEffect(()=>{updateCart(state=>settleCheckout(state,orderId,'approved'));},[orderId]);
 return null;
}
