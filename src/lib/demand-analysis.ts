import type { ParsedDemandRecord } from "@/lib/demand-parser";

export type DemandPriority = "high" | "medium" | "low";

export type DemandAnalysis = {
  priority: DemandPriority;
  potentialScore: number;
  priorityReason: string;
  recommendedAction: string;
  missingFields: string[];
  followUpStatus: "due" | "scheduled" | "overdue" | "not_scheduled";
};

type DemandAnalysisInput = Pick<
  ParsedDemandRecord,
  | "customerName"
  | "customerPhone"
  | "customerCompany"
  | "serviceName"
  | "serviceAmount"
  | "serviceQty"
  | "followUpDate"
  | "status"
  | "note"
  | "createdAt"
>;

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getFollowUpStatus(followUpDate: Date | null | undefined): DemandAnalysis["followUpStatus"] {
  if (!followUpDate) return "not_scheduled";
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const date = new Date(followUpDate);

  if (isSameDay(date, today)) return "due";
  if (date < startOfToday) return "overdue";
  return "scheduled";
}

function hasDemandSignal(record: DemandAnalysisInput) {
  const text = `${record.serviceName || ""} ${record.note || ""}`.toLowerCase();
  return Boolean(
    record.serviceName ||
      text.includes("interested") ||
      text.includes("want") ||
      text.includes("need") ||
      text.includes("quote") ||
      text.includes("price") ||
      text.includes("demo") ||
      text.includes("hp") ||
      text.includes("potential"),
  );
}

export function analyzeDemandRecord(record: DemandAnalysisInput): DemandAnalysis {
  const missingFields: string[] = [];
  if (!record.customerName) missingFields.push("customerName");
  if (!record.customerPhone) missingFields.push("phone");
  if (!record.serviceName) missingFields.push("service");
  if (!record.followUpDate) missingFields.push("followUpDate");

  let score = 35;
  const reasons: string[] = [];
  const followUpStatus = getFollowUpStatus(record.followUpDate);
  const status = record.status || "new";
  const demandSignal = hasDemandSignal(record);

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
  if (demandSignal) score += 10;

  if (followUpStatus === "due") {
    score += 12;
    reasons.push("follow-up due today");
  }
  if (followUpStatus === "overdue") {
    score += 10;
    reasons.push("follow-up overdue");
  }
  if (status === "closed" || status === "completed") score -= 28;
  if (status === "contacted" || status === "quoted" || status === "pending") score += 6;

  const potentialScore = Math.max(0, Math.min(100, Math.round(score)));
  const priority: DemandPriority =
    potentialScore >= 70 ? "high" : potentialScore >= 45 ? "medium" : "low";

  let recommendedAction = "Review the demand and schedule the next follow-up.";
  if (!record.customerPhone) {
    recommendedAction = "Get a valid phone number before assigning sales follow-up.";
  } else if (followUpStatus === "overdue") {
    recommendedAction = "Call today and update the follow-up outcome.";
  } else if (followUpStatus === "due") {
    recommendedAction = "Call today using the latest demand notes.";
  } else if (priority === "high") {
    recommendedAction = "Prioritize this lead for sales follow-up and confirm requirements.";
  } else if (priority === "medium") {
    recommendedAction = "Send a follow-up message and collect missing decision details.";
  } else {
    recommendedAction = "Keep in a low-touch nurture list unless new interest appears.";
  }

  return {
    priority,
    potentialScore,
    priorityReason: reasons.length ? reasons.join(", ") : "limited demand signals",
    recommendedAction,
    missingFields,
    followUpStatus,
  };
}

export function buildBusinessInsights(records: Array<DemandAnalysisInput & DemandAnalysis>) {
  const openRecords = records.filter((record) => !["closed", "completed"].includes(record.status));
  const highPriority = openRecords.filter((record) => record.priority === "high");
  const missingPhone = openRecords.filter((record) => record.missingFields.includes("phone"));
  const overdue = openRecords.filter((record) => record.followUpStatus === "overdue");
  const dueToday = openRecords.filter((record) => record.followUpStatus === "due");

  return [
    {
      type: "sales",
      severity: highPriority.length > 0 ? "urgent" : "info",
      title: "ဝယ်လိုအား အလားအလာကောင်းသည့် Leads များ",
      message:
        highPriority.length > 0
          ? `ဝယ်လိုအားမြင့်မားပြီး အလားအလာကောင်းသော Leads (${highPriority.length}) ခုအား ဦးစားပေး ကိုင်တွယ်ရန် လိုအပ်နေပါသည်။`
          : "လတ်တလော ဉီးစားပေးကိုင်တွယ်ရန် လိုအပ်သော ဝယ်လိုအားမြင့် Leads များ မတွေ့ရပါ။",
      recommendedAction:
        highPriority.length > 0
          ? "အမြန်ဆုံး အရောင်းပိတ်နိုင်ရန် အလားအလာအကောင်းဆုံး Leads များကို အရောင်းဝန်ထမ်းများထံ ယနေ့ ချက်ချင်း တာဝန်ပေးအပ်လိုက်ပါ။"
          : "နောက်ဆက်တွဲ Leads အသစ်များကို စောင့်ကြည့်ပြီး ပုံမှန် Leads များကို ဆက်လက်လုပ်ဆောင်ပါ။",
      action: highPriority.length > 0 ? "High-Priority Leads ကြည့်ရန်" : "Leads စာရင်းကြည့်ရန်",
      actionType: "view_high_priority" as const,
    },
    {
      type: "marketing",
      severity: missingPhone.length > 0 ? "warning" : "info",
      title: "ဖုန်းနံပါတ် စုဆောင်းမှု အရည်အသွေး",
      message:
        missingPhone.length > 0
          ? `ပွင့်နေဆဲ Leads စုစုပေါင်းထဲမှ (${missingPhone.length}) ခုတွင် ဆက်သွယ်ရန် ဖုန်းနံပါတ် မပါရှိသေးပါ။`
          : "လတ်တလော Leads များအားလုံးတွင် ဆက်သွယ်ရန် ဖုန်းနံပါတ်များ ပြည့်စုံစွာ ပါရှိပါသည်။",
      recommendedAction:
        missingPhone.length > 0
          ? "ဖုန်းခေါ်ဆို၍ အရောင်းမလိုက်မီ ဖုန်းနံပါတ် စုံစမ်းမေးမြန်းမှုများ၌ ဖုန်းစုဆောင်းမှုကို မြှင့်တင်ပါ။"
          : "လက်ရှိ Leads စုဆောင်းမှုပုံစံအတိုင်း ဆက်လက်ဆောင်ရွက်ပါ။",
      action: missingPhone.length > 0 ? "ဖုန်းမပါသော Leads စစ်ဆေးရန်" : "Leads စစ်ဆေးရန်",
      actionType: "view_missing_phone" as const,
    },
    {
      type: "sales",
      severity: overdue.length > 0 ? "urgent" : dueToday.length > 0 ? "warning" : "info",
      title: "Follow-up နောက်ဆက်တွဲ ဆက်သွယ်မှု",
      message:
        overdue.length > 0
          ? `သတ်မှတ်ရက်ကျော်လွန်နေသော CS Follow-up (${overdue.length}) ခု ရှိနေပါသည်။`
          : dueToday.length > 0
            ? `ယနေ့ ဆက်သွယ်ရန် သတ်မှတ်ထားသော CS Follow-up (${dueToday.length}) ခု ရှိနေပါသည်။`
            : "အရေးတကြီး လုပ်ဆောင်ရန်လိုအပ်သော follow-up ဆက်သွယ်မှုများ မရှိသေးပါ။",
      recommendedAction:
        overdue.length > 0 || dueToday.length > 0
          ? "သတ်မှတ်ရက်ကျော်လွန်နေသော အဆက်အသွယ်များကို အရင်ဆုံး ဖုန်းခေါ်ဆိုပြီး status ကို အပ်ဒိတ်လုပ်ပါ။"
          : "နောက်ဆက်တွဲ လုပ်ဆောင်ရန်မရှိသေးသည့် Leads များအတွက် follow-up ရက်စွဲများ သတ်မှတ်ပေးပါ။",
      action: overdue.length > 0 ? "သက်တမ်းကျော် Follow-up ကြည့်ရန်" : dueToday.length > 0 ? "ယနေ့ Follow-up ကြည့်ရန်" : "Follow-up Calendar ကြည့်ရန်",
      actionType: overdue.length > 0 ? "view_overdue" as const : "view_due_today" as const,
    },
  ];
}
