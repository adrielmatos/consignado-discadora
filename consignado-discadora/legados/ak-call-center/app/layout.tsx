import type { Metadata } from "next";
import "./globals.css";
import "./accessibility-overrides.css";
import BankBadge from "./components/bank-badge";
import DialerScript from "./components/dialer-script";

export const metadata: Metadata={title:"A&K Soluções Financeiras",description:"Central A&K Soluções Financeiras"};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="pt-BR"><body>{children}<BankBadge /><DialerScript /></body></html>;
}
