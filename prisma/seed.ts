import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module __dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file manually to support running script directly via npx tsx
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    });
  }
} catch (e) {
  console.warn("Failed to load .env file:", e);
}

import { PrismaClient } from '../src/generated/prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Instantiate database connection matching src/lib/prisma.ts
const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({
  adapter,
});

// Helper: Custom CSV Parser to avoid external dependencies
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/);
  const result: Record<string, string>[] = [];
  if (lines.length === 0 || !lines[0].trim()) return result;
  
  const headers = parseCSVLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, index) => {
      row[h] = values[index] !== undefined ? values[index] : "";
    });
    result.push(row);
  }
  return result;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Heuristic Priority Analyzer
function analyzeDemandRecord(record: {
  customerName?: string;
  customerPhone?: string | null;
  customerCompany?: string | null;
  serviceName?: string | null;
  serviceAmount?: number | null;
  serviceQty?: number | null;
  followUpDate?: Date | null;
  status?: string;
  note?: string;
}) {
  const missingFields: string[] = [];
  if (!record.customerName) missingFields.push("customerName");
  if (!record.customerPhone) missingFields.push("phone");
  if (!record.serviceName) missingFields.push("service");
  if (!record.followUpDate) missingFields.push("followUpDate");

  let score = 35;
  const reasons: string[] = [];
  
  const followUpDate = record.followUpDate;
  let followUpStatus = "not_scheduled";
  if (followUpDate) {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const date = new Date(followUpDate);
    if (date.toDateString() === today.toDateString()) {
      followUpStatus = "due";
    } else if (date < startOfToday) {
      followUpStatus = "overdue";
    } else {
      followUpStatus = "scheduled";
    }
  }

  if (record.customerName) score += 8;
  if (record.customerPhone) {
    score += 18;
    reasons.push("phone available");
  } else {
    score -= 14;
    reasons.push("phone missing");
  }

  if (record.customerCompany) score += 6;
  if (record.serviceName) {
    score += 14;
    reasons.push("service interest is clear");
  }
  if (record.serviceAmount && record.serviceAmount > 0) {
    score += 14;
    reasons.push("amount/revenue signal exists");
  }
  if (record.serviceQty && record.serviceQty > 0) score += 4;

  if (followUpStatus === "due") {
    score += 12;
    reasons.push("follow-up due today");
  }
  if (followUpStatus === "overdue") {
    score -= 8;
    reasons.push("follow-up overdue");
  }

  score = Math.min(100, Math.max(0, score));

  let priority = "medium";
  if (score >= 70) priority = "high";
  else if (score < 40) priority = "low";

  return {
    priority,
    potentialScore: score,
    priorityReason: reasons.join(", ") || "standard lead metrics",
    recommendedAction: score >= 70 ? "Contact immediately for proposal." : "Place in standard follow-up list.",
    missingFields,
    followUpStatus
  };
}

function normalizeServiceName(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = name.trim();
  if (n === "Gold Package") return "Website Gold Package";
  if (n === "Silver Package") return "Website Silver Package";
  if (n === "Diamond Package") return "Website Diamond Package";
  if (n === "Website Package" || n === "Project Website" || n === "Website Care") return "Website Silver Package";
  if (n === "CRM Setup" || n === "POS") return "POS";
  if (n === "AI Automation" || n === "Support Retainer" || n === "Lead Capture Form" || n === "Social Media Management") return "Other";
  if (n === "Chatbot Setup") return "Messenger Sale Bot";
  return n;
}

async function main() {
  console.log("Starting database seed from typescript...");

  // 1. Clean Database
  console.log("Cleaning existing data...");
  await prisma.demandRecord.deleteMany({});
  await prisma.customerActivity.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.projectExpiration.deleteMany({});
  await prisma.websiteUpdate.deleteMany({});
  await prisma.businessReport.deleteMany({});
  await prisma.telegramMessage.deleteMany({});
  await prisma.telegramSender.deleteMany({});
  console.log("Database cleaned successfully.");

  // Ensure dashboard system sender exists
  const sender =
    (await prisma.telegramSender.findFirst({ where: { telegramUserId: 0, userId: null } })) ||
    (await prisma.telegramSender.create({
      data: {
      telegramUserId: 0,
      firstName: "Dashboard",
      lastName: "System",
      username: "dashboard_system",
      displayName: "Dashboard System",
      activeReportType: "none",
      },
    }));

  const message = await prisma.telegramMessage.upsert({
    where: { id: "dashboard_placeholder_msg" },
    update: {},
    create: {
      id: "dashboard_placeholder_msg",
      telegramMsgId: 0,
      text: "Dashboard Manual/Sample Entry",
      senderId: sender.id,
      chatId: 0,
    },
  });

  // 2. Seed Customer Service (Purchased Customers Directory)
  const csFile = path.resolve(__dirname, '../sample-data/customer_service_june_2026.csv');
  if (fs.existsSync(csFile)) {
    console.log("Seeding Customer Service records...");
    const rows = parseCSV(fs.readFileSync(csFile, 'utf8'));
    for (const row of rows) {
      const normalizedName = row.customer_name.toLowerCase().replace(/\s+/g, " ").trim();
      
      const customer = await prisma.customer.create({
        data: {
          name: row.customer_name,
          nameNormalized: normalizedName,
          phone: row.phone || null,
          email: row.email || null,
          company: row.company || null,
          notes: row.last_contact_note || null,
          status: row.status || "active",
          createdAt: row.date ? new Date(row.date) : new Date(),
        }
      });

      // Add a matching closed/won demand record so it lists in their purchased service history
      if (row.purchased_service) {
        const serviceName = normalizeServiceName(row.purchased_service);
        const analysis = analyzeDemandRecord({
          customerName: row.customer_name,
          customerPhone: row.phone,
          customerCompany: row.company,
          serviceName: serviceName,
          serviceAmount: row.purchase_amount_mmk ? parseFloat(row.purchase_amount_mmk) : null,
          serviceQty: 1,
          followUpDate: row.next_follow_up ? new Date(row.next_follow_up) : null,
          status: "closed",
          note: row.last_contact_note || "",
        });

        await prisma.demandRecord.create({
          data: {
            messageId: message.id,
            senderId: sender.id,
            customerId: customer.id,
            customerName: row.customer_name,
            category: "sales",
            status: "closed",
            note: row.last_contact_note || "Milestone completed",
            serviceName: serviceName,
            serviceAmount: row.purchase_amount_mmk ? parseFloat(row.purchase_amount_mmk) : null,
            serviceQty: 1,
            followUpDate: row.next_follow_up ? new Date(row.next_follow_up) : null,
            followUpStatus: analysis.followUpStatus,
            priority: analysis.priority,
            potentialScore: analysis.potentialScore,
            priorityReason: "already purchased client",
            recommendedAction: "Maintain monthly support.",
            confidence: 1.0,
            aiProvider: "manual",
            createdAt: row.date ? new Date(row.date) : new Date(),
          }
        });
      }
    }
    console.log(`Seeded ${rows.length} customers.`);
  }

  // 3. Seed Sales & Marketing (Leads/Demand Records)
  const salesFile = path.resolve(__dirname, '../sample-data/sales_marketing_demand_june_2026.csv');
  if (fs.existsSync(salesFile)) {
    console.log("Seeding Sales & Marketing demand records...");
    const rows = parseCSV(fs.readFileSync(salesFile, 'utf8'));
    for (const row of rows) {
      const normalizedName = row.customer_name.toLowerCase().replace(/\s+/g, " ").trim();
      
      // Upsert Customer
      let customer = await prisma.customer.findFirst({
        where: {
          OR: [
            { nameNormalized: normalizedName },
            { name: { equals: row.customer_name, mode: "insensitive" } }
          ]
        }
      });
      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            name: row.customer_name,
            nameNormalized: normalizedName,
            phone: row.phone || null,
            company: row.company || null,
            status: "active",
            createdAt: row.date ? new Date(row.date) : new Date(),
          }
        });
      }

      const serviceName = normalizeServiceName(row.service_name);
      const rawAmount = row.service_amount;
      const parsedAmount = rawAmount ? parseFloat(rawAmount) : null;
      const parsedQty = row.service_qty ? parseInt(row.service_qty) : 1;

      const analysis = analyzeDemandRecord({
        customerName: row.customer_name,
        customerPhone: row.phone,
        customerCompany: row.company,
        serviceName: serviceName,
        serviceAmount: parsedAmount,
        serviceQty: parsedQty,
        followUpDate: row.follow_up_date ? new Date(row.follow_up_date) : null,
        status: row.lead_stage,
        note: row.note || "",
      });

      // Avoid duplicate closed/won records already seeded from the CS file
      if (row.lead_stage === "closed") {
        const existingClosed = await prisma.demandRecord.findFirst({
          where: {
            customerId: customer.id,
            serviceName: serviceName || null,
            status: "closed",
          },
        });
        if (existingClosed) {
          console.log(`Skipping duplicate closed demand record for customer ${row.customer_name} (already seeded from CS)`);
          continue;
        }
      }

      await prisma.demandRecord.create({
        data: {
          messageId: message.id,
          senderId: sender.id,
          customerId: customer.id,
          customerName: row.customer_name,
          category: row.lead_stage === "closed" ? "sales" : "inquiry",
          status: row.lead_stage || "new",
          note: row.note || "",
          sourceType: row.source_channel || "telegram",
          serviceName: serviceName || null,
          serviceAmount: parsedAmount,
          serviceQty: parsedQty,
          followUpDate: row.follow_up_date ? new Date(row.follow_up_date) : null,
          followUpStatus: analysis.followUpStatus,
          priority: row.priority || analysis.priority,
          potentialScore: analysis.potentialScore,
          priorityReason: analysis.priorityReason,
          recommendedAction: analysis.recommendedAction,
          confidence: 1.0,
          aiProvider: "manual",
          createdAt: row.date ? new Date(row.date) : new Date(),
        }
      });
    }
    console.log(`Seeded ${rows.length} sales leads.`);
  }

  // 4. Seed Finance (Business Reports)
  const financeFile = path.resolve(__dirname, '../sample-data/finance_records_june_2026.csv');
  if (fs.existsSync(financeFile)) {
    console.log("Seeding Finance/Business Report records...");
    const rows = parseCSV(fs.readFileSync(financeFile, 'utf8'));
    for (const row of rows) {
      const parsedAmount = row.amount_mmk ? parseFloat(row.amount_mmk) : 0;
      const isIncome = row.type === "Income";
      
      await prisma.businessReport.create({
        data: {
          reportDate: new Date(row.date),
          senderId: sender.id,
          marketingBudget: isIncome ? 0 : parsedAmount,
          marketingChannel: row.category || "Service",
          notes: `${row.description} (Ref: ${row.reference}, Method: ${row.payment_method}). ${row.notes || ""}`,
          totalSalesAmount: isIncome ? parsedAmount : 0,
          newLeads: isIncome ? 0 : (row.category === "Marketing" ? 1 : 0),
          closedDeals: isIncome ? 1 : 0,
          totalDemandCount: 1,
          reporterName: "Dashboard Seeder",
          createdAt: new Date(row.date),
        }
      });
    }
    console.log(`Seeded ${rows.length} financial transactions.`);
  }

  // 4b. Seed Daily Business Summary Reports (30 Days)
  console.log("Seeding Daily Business Summary Reports for pacing...");
  for (let i = 1; i <= 23; i++) {
    const dateObj = new Date(2026, 5, i); // June 1 to 23, 2026
    const dateStr = dateObj.toISOString().slice(0, 10);
    const budget = i % 3 === 0 ? Math.floor(100000 + (i * 12345) % 200000) : 0;
    const sales = i % 2 === 0 ? Math.floor(300000 + (i * 45678) % 1500000) : 0;
    const calls = Math.floor(15 + (i * 7) % 25);
    const appts = Math.floor(5 + (i * 3) % 10);
    const kept = Math.max(1, appts - (i % 3));
    const leads = Math.floor(4 + (i * 9) % 12);
    const closed = i % 2 === 0 ? Math.max(1, Math.floor(kept / 2)) : 0;

    await prisma.businessReport.create({
      data: {
        reportDate: new Date(dateStr),
        senderId: sender.id,
        marketingBudget: budget,
        marketingChannel: ["Facebook", "Google", "Referral", "Walk-in", "Telegram"][i % 5],
        callsMade: calls,
        appointmentsMade: appts,
        appointmentsKept: kept,
        newLeads: leads,
        totalDemandCount: leads + 2,
        totalSalesAmount: sales,
        closedDeals: closed,
        pendingDeals: Math.max(0, appts - closed),
        notes: `Daily summary for ${dateStr}. Pacing metrics captured.`,
        reporterName: "Daily Bot Ingestion",
        createdAt: new Date(dateStr),
      }
    });
  }

  // 5. Seed Projects / Infra (Project Expirations)
  const expiryFile = path.resolve(__dirname, '../sample-data/projects_infra_expiry_june_2026.csv');
  if (fs.existsSync(expiryFile)) {
    console.log("Seeding Project Expirations...");
    const rows = parseCSV(fs.readFileSync(expiryFile, 'utf8'));
    for (const row of rows) {
      await prisma.projectExpiration.create({
        data: {
          projectName: row.project_name,
          url: row.url || null,
          packageName: row.package_name || null,
          domainProvider: row.domain_provider || null,
          hostingProvider: row.hosting_provider || null,
          domainExpireDate: row.domain_expire_date ? new Date(row.domain_expire_date) : null,
          hostingExpireDate: row.hosting_expire_date ? new Date(row.hosting_expire_date) : null,
          remark: `${row.remark || ""}. Owner: ${row.owner}, Priority: ${row.priority}`,
          createdAt: new Date(),
        }
      });
    }
    console.log(`Seeded ${rows.length} project expirations.`);
  }

  // 6. Seed Website Updates
  const updateFile = path.resolve(__dirname, '../sample-data/website_updates_june_2026.csv');
  if (fs.existsSync(updateFile)) {
    console.log("Seeding Website Updates...");
    const rows = parseCSV(fs.readFileSync(updateFile, 'utf8'));
    for (const row of rows) {
      await prisma.websiteUpdate.create({
        data: {
          name: row.name,
          url: row.url || null,
          businessType: row.business_type || null,
          packageName: row.package_name || null,
          status: row.status || "up_to_date",
          remark: `${row.requested_change || ""}. ${row.remark || ""}`,
          createdAt: row.last_update_date ? new Date(row.last_update_date) : new Date(),
        }
      });
    }
    console.log(`Seeded ${rows.length} website updates.`);
  }

  console.log("Database seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    pool.end();
  });
