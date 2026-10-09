import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

function maskSecret(value: string | null | undefined, visibleChars = 8) {
  return value
    ? "•".repeat(Math.max(0, value.length - visibleChars)) + value.slice(-visibleChars)
    : "";
}

// GET /api/settings/bot — get current user's bot settings
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const settings = await prisma.botSettings.findUnique({
    where: { userId: session.user.id },
  });

  if (!settings) {
    return NextResponse.json({
      settings: {
        botToken: "",
        geminiApiKey: "",
        geminiModel: "gemini-3.1-flash-lite-preview",
        isActive: false,
      },
    });
  }

  return NextResponse.json({
    settings: {
      botToken: maskSecret(settings.botToken),
      geminiApiKey: maskSecret(settings.geminiApiKey),
      geminiModel: settings.geminiModel,
      isActive: settings.isActive,
      updatedAt: settings.updatedAt,
    },
  });
}

// PUT /api/settings/bot — update bot settings & register webhook with Telegram
export async function PUT(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { botToken, geminiApiKey, activate } = body as {
    botToken?: string;
    geminiApiKey?: string;
    activate?: boolean;
  };

  try {
    // Build the webhook URL from the current request origin
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    const webhookUrl = `${origin}/api/telegram/webhook`;

    let webhookRegistered = false;

    // Read the existing settings so we can unregister the old webhook when
    // the bot token changes (otherwise the old bot would keep receiving events).
    const existingSettings = await prisma.botSettings.findUnique({
      where: { userId: session.user.id },
      select: { botToken: true },
    });
    const oldBotToken = existingSettings?.botToken ?? null;

    const existingWebhookSecret =
      (await prisma.botSettings.findUnique({
        where: { userId: session.user.id },
        select: { webhookSecret: true },
      }))?.webhookSecret ?? null;
    const webhookSecret = existingWebhookSecret || randomBytes(32).toString("hex");

    const tokenToSave =
      botToken && !botToken.includes("•") ? botToken : undefined;
    const botTokenForWebhook = tokenToSave ?? oldBotToken;

    // One Telegram bot can only feed one account: Telegram delivers every
    // update to a single webhook URL, so a shared token would silently route
    // one owner's staff reports/files into the other's dashboard.
    if (tokenToSave) {
      const collision = await prisma.botSettings.findFirst({
        where: { botToken: tokenToSave, userId: { not: session.user.id }, isActive: true },
        select: { userId: true },
      });
      if (collision) {
        return NextResponse.json(
          { message: "This bot is already connected to another account. Use a different bot token." },
          { status: 409 },
        );
      }
    }

    // Register a webhook for a new token, and repair legacy settings that
    // predate per-bot secrets before accepting webhook traffic from them.
    // An inactive saved token needs an explicit verification path too. Without
    // this, a masked token could never be reactivated from the UI.
    if (botTokenForWebhook && (tokenToSave || !existingWebhookSecret || activate === true)) {
      const telegramRes = await fetch(
        `https://api.telegram.org/bot${botTokenForWebhook}/setWebhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: webhookUrl,
            allowed_updates: ["message", "callback_query"],
            secret_token: webhookSecret,
          }),
        }
      );

      const telegramData = await telegramRes.json();

      if (!telegramData.ok) {
        return NextResponse.json(
          {
            message: `Telegram error: ${telegramData.description || "Failed to set webhook"}`,
          },
          { status: 400 }
        );
      }

      webhookRegistered = true;

      // Drop the webhook on the previous token (if any) so it stops receiving
      // updates. Best-effort — failures here are non-fatal.
      if (oldBotToken && tokenToSave && oldBotToken !== tokenToSave) {
        await fetch(
          `https://api.telegram.org/bot${oldBotToken}/deleteWebhook`,
          { method: "POST" },
        ).catch((err) => console.error("Failed to delete old webhook:", err));
      }
    }

    // If it contains "•", the user didn't change it — keep the old one.
    const geminiKeyToSave =
      geminiApiKey && !geminiApiKey.includes("•") ? geminiApiKey : undefined;

    const settings = await prisma.botSettings.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        botToken: tokenToSave || null,
        webhookSecret,
        geminiApiKey: geminiKeyToSave || null,
        geminiModel: "gemini-3.1-flash-lite-preview",
        isActive: Boolean(tokenToSave) || (activate === true && Boolean(botTokenForWebhook)),
      },
      update: {
        ...(tokenToSave !== undefined ? { botToken: tokenToSave || null } : {}),
        webhookSecret,
        ...(geminiKeyToSave !== undefined ? { geminiApiKey: geminiKeyToSave || null } : {}),
        geminiModel: "gemini-3.1-flash-lite-preview",
        isActive: tokenToSave !== undefined ? !!tokenToSave : activate === true ? Boolean(botTokenForWebhook) : undefined,
      },
    });

    return NextResponse.json({
      settings: {
        botToken: maskSecret(settings.botToken),
        geminiApiKey: maskSecret(settings.geminiApiKey),
        geminiModel: settings.geminiModel,
        isActive: settings.isActive,
        updatedAt: settings.updatedAt,
      },
      webhookRegistered,
      webhookUrl: webhookRegistered ? webhookUrl : undefined,
    });
  } catch (error) {
    console.error("Failed to save bot settings:", error);
    return NextResponse.json(
      { message: "Failed to save settings" },
      { status: 500 }
    );
  }
}
