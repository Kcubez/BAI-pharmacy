# BAI-Pharmacy

> Cloned from BAI-Commerce. Pharmaceutical Distribution / Dealer Management Decision Support System — Sales, Stock, AR, Payable, Cash/Bank, AI analysis (မြန်မာလို), management alerts.

An enterprise-grade **Business Operations & AI Integration Dashboard** that consolidates multi-channel data (demands, finance, customer service, project infra) and leverages Google Gemini to generate real-time performance insights and localized action recommendations.

Built with **Next.js 15 (App Router)**, **TypeScript**, **Supabase (PostgreSQL)**, and **Prisma ORM**.

---

## ✨ Core Features

### 🧠 Gemini AI Operations Analyst
* **Real-time Insights:** Automatically feeds operational metrics (leads, followups, appointments, sales, cost) to Google Gemini AI.
* **Burmese Recommendations:** Generates contextual action plans (marketing bottlenecks, overdue followups, show-rate analysis) in Myanmar language.
* **Interactive Navigation:** Action cards link directly to relevant workspaces (e.g., clicking a lead recommendation redirects directly to high-priority leads in Sales & Marketing).
* **Heuristic Fallback:** Robust fallback mechanisms to provide core business rules suggestions when API limits are reached.

### 📈 Operational Workspaces
* **Business Overview:** Tracks pacing of sales, appointments, expenses, and new customers against custom target lines.
* **Finance Hub:** Monitors revenue, expense, profit/loss, ROI, and cost distributions.
* **Sales & Marketing:** Tracks deals through standard funnels (leads -> quoted -> pending -> closed) with advanced column filtering.
* **Customer Service:** Real-time client messaging records, followup tracking (due today, overdue), and conversion rates.
* **Projects & Infrastructure:** Tracks active projects, hosting expiries, and infrastructure updates.

### 📊 Zero-Dependency Premium SVG Charts
* **Custom Charts:** Custom-built React SVG Line Charts and Bar Charts with tooltips, grid overlays, and curved tension paths.
* **Zero External Bloat:** No external charting libraries (e.g. Recharts) used in core widgets, ensuring fast bundle delivery and perfect style synchronization.

### 📥 Multi-Source Excel Parsing
* **Bulk Imports:** Direct Excel sheet parsing (`xlsx`) for June/May demand sheets, website updates, and project expiry lists.
* **Auto-Validation:** Verifies sheet column shapes before database updates.

### 🔐 Enterprise Authentication
* **Role-Based Auth:** Secure standard and admin routes using **Better Auth**.
* **Admin Panel:** Detailed user listing, role promotion, and session tracking.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 15.2 (App Router) |
| **Language** | TypeScript 5 |
| **Database** | PostgreSQL (Supabase) |
| **ORM** | Prisma ORM 7 |
| **Authentication** | Better Auth |
| **AI Integration** | Google Gen AI SDK (`@google/genai` with Gemini 1.5/2.5) |
| **Data Ingestion** | XLSX library |
| **Query Engine** | TanStack Query v5 |
| **State & Forms** | React Hook Form + Zod |
| **Notification** | Sonner toast |

---

## 📁 Project Structure

```text
company_data_app/
├── prisma/
│   └── schema.prisma          # DB schema (User, DemandRecord, PeriodTarget, etc.)
├── src/
│   ├── app/
│   │   ├── api/               # AI recommendations & dashboard polling APIs
│   │   ├── (auth)/            # Auth routes (login/register)
│   │   ├── (dashboard)/       # Module-specific dashboards (finance, customer service, infra)
│   │   └── layout.tsx         # Global provider bootstrap
│   ├── components/
│   │   ├── ui/                # Shadcn primitives
│   │   └── layout/            # Sidebar layouts and Sync Pollers
│   ├── hooks/                 # Date filters and polling hooks
│   └── lib/                   # Auth configs and Prisma client
```

---

## 🚀 Getting Started

### 1. Prerequisites
* Node.js 20+
* PostgreSQL database
* Google AI Studio API Key

### 2. Setup Env
Create a `.env` in the root:
```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
BETTER_AUTH_SECRET="your-auth-secret"
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="BAI-Commerce"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Install & Run
```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

---

## 👨‍💻 Initial Admin Setup
1. Register a user at `/register`.
2. Update the role column for your user to `admin` in your Postgres database.
3. Access the `/admin/users` console.
