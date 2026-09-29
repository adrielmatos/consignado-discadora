"use client";
import {useEffect} from "react";
export default function Error({error,reset}:{error:Error&{digest?:string};reset:()=>void}){useEffect(()=>{console.error(error)},[error]);return <main className="login"><div className="loginCard"><div className="brand big">A&K <em>Deskcomm</em></div><h2>O CRM encontrou um erro</h2><p>{error.message||"Falha inesperada ao carregar a aplicação."}</p><button className="btn primary wide" onClick={()=>reset()}>Tentar novamente</button></div></main>}
