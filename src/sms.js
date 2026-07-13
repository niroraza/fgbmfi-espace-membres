// ============================================================
// sms.js — Envoi du code OTP par SMS
// Deux modes selon SMS_PROVIDER dans .env :
//   - "mock"   : aucun SMS réel envoyé, le code est loggé côté serveur
//                et visible dans l'admin (section "Codes de test").
//                Pratique pour développer/tester sans compte Twilio.
//   - "twilio" : envoi réel via l'API Twilio.
// ============================================================

async function envoyerSMS(telephone, code) {
  const provider = process.env.SMS_PROVIDER || 'mock';
  const message = `Votre code de connexion FGBMFI Paris est : ${code}. Ce code expire dans 5 minutes. Ne le communiquez à personne.`;

  if (provider === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) {
      throw new Error("Configuration Twilio incomplète (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER manquants dans .env)");
    }
    const twilio = require('twilio')(sid, token);
    await twilio.messages.create({ body: message, from, to: telephone });
    return { envoye: true, mode: 'twilio' };
  }

  // Mode mock : on log simplement (visible dans les logs Render/console)
  console.log(`[SMS-MOCK] → ${telephone} : ${message}`);
  return { envoye: true, mode: 'mock', codeVisible: code };
}

module.exports = { envoyerSMS };
