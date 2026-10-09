/**
 * Transactional Email Helper using Brevo API
 */

export async function sendOTPEmail(recipientEmail: string, otpCode: string): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "BAI-Pharmacy";

  if (!apiKey) {
    console.error("Missing BREVO_API_KEY environment variable. Unable to send verification email.");
    return false;
  }

  if (!senderEmail) {
    console.error("Missing BREVO_SENDER_EMAIL environment variable. Unable to send verification email.");
    return false;
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: senderName,
          email: senderEmail,
        },
        to: [
          {
            email: recipientEmail,
          },
        ],
        subject: "Telegram Bot Verification OTP",
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h2 style="color: #0284c7; margin: 0;">BAI-Pharmacy</h2>
              <p style="color: #64748b; font-size: 14px; margin-top: 5px;">Telegram Bot Verification</p>
            </div>
            <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
            <p style="color: #334155; font-size: 16px; line-height: 1.5;">
              မင်္ဂလာပါ၊
            </p>
            <p style="color: #334155; font-size: 16px; line-height: 1.5;">
              Telegram Bot အတွင်း ဝင်ရောက်ခွင့် အတည်ပြုရန်အတွက် သင်၏ OTP verification ကုဒ်မှာ အောက်ပါအတိုင်း ဖြစ်ပါသည် -
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <span style="display: inline-block; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0f172a; background-color: #f1f5f9; padding: 10px 30px; border-radius: 6px; border: 1px solid #cbd5e1;">
                ${otpCode}
              </span>
            </div>
            <p style="color: #ef4444; font-size: 14px; line-height: 1.5; font-weight: 500;">
              * ဤကုဒ်သည် ၁၀ မိနစ်သာ အကျုံးဝင်ပါသည်။ မည်သူ့ကိုမျှ မျှဝေခြင်း မပြုပါရန်။
            </p>
            <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
            <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; text-align: center;">
              This email was generated automatically by the BAI-Pharmacy Platform. Please do not reply directly to this email.
            </p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      console.error("Brevo API error response:", response.status, errBody);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Failed to send OTP email via Brevo API:", error);
    return false;
  }
}
