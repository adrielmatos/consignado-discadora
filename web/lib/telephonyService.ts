export type TelephonyProvider = 'PHONE_LINK' | 'SIP_WEBRTC';

export class TelephonyService {
  private provider: TelephonyProvider;
  constructor(provider: TelephonyProvider = 'PHONE_LINK') { this.provider = provider; }

  public formatPhoneNumber(phoneNumber: string): string {
    let clean = String(phoneNumber ?? '').trim().replace(/\D/g, '');
    if (clean.startsWith('00')) clean = clean.slice(2);
    if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) return clean;
    if (clean.length === 10 || clean.length === 11) return `55${clean}`;
    throw new Error('Telefone inválido. Informe DDD + número.');
  }

  public makeCall(phoneNumber: string): void {
    const formatted = this.formatPhoneNumber(phoneNumber);
    if (this.provider === 'PHONE_LINK') window.location.href = `tel:+${formatted}`;
    else console.log(`[PABX WebRTC] Disparando chamada para: ${formatted}`);
  }

  public openWhatsApp(phoneNumber: string, message = 'Olá! Sou da equipe de crédito consignado da A&K. Posso fazer uma simulação para você?'): void {
    const formatted = this.formatPhoneNumber(phoneNumber);
    window.open(`https://wa.me/${formatted}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  public setProvider(provider: TelephonyProvider): void { this.provider = provider; }
}

export const telephony = new TelephonyService('PHONE_LINK');
