import { authenticator } from 'otplib';
import QRCode from 'qrcode';

authenticator.options = { window: 1 };

export const newMfaSecret = () => authenticator.generateSecret();
export const verifyTotp = (code: string, secret: string) => /^\d{6}$/.test(code) && authenticator.check(code, secret);

export async function mfaQrDataUrl(username: string, issuer: string, secret: string) {
  return QRCode.toDataURL(authenticator.keyuri(username, issuer, secret));
}
