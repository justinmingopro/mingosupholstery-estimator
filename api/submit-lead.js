// Map customer-facing job types to the closest Zoho item name used in the PM.
// The PM requires exact Zoho item names for CSV export compatibility.
const JOB_TYPE_TO_ZOHO = {
  "Auto":      "Interior Repair - Retail",
  "Marine":    "Marine Reupholstery - Retail",
  "RV":        "RV - Reupholstery Retail",
  "Furniture": "Furniture Reupholstery - Retail",
};

function genId() {
  return "t_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { phone, jobType, vehicleType, areas, material, notes, estimateData } = req.body;

  const supabaseUrl  = process.env.REACT_APP_SUPABASE_URL;
  const supabaseKey  = process.env.REACT_APP_SUPABASE_ANON_KEY;
  const openphoneKey = process.env.OPENPHONE_API_KEY;
  const notifyPhone  = process.env.NOTIFY_PHONE || "3854062408";

  const errors = [];

  // ── 1. Save lead to Supabase ───────────────────────────────────────────────
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/customer_leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        phone,
        job_type:            jobType      || null,
        vehicle_type:        vehicleType  || null,
        areas:               areas        || [],
        material_preference: material     || null,
        description:         notes        || null,
        estimate_data:       estimateData || null,
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      errors.push("Supabase: " + txt);
    }
  } catch (e) {
    errors.push("Supabase error: " + e.message);
  }

  // ── 2. Send SMS notification via OpenPhone ─────────────────────────────────
  if (openphoneKey) {
    try {
      // Get the phoneNumberId — use env var if set, otherwise auto-discover first number
      let phoneNumberId = process.env.OPENPHONE_PHONE_ID;
      if (!phoneNumberId) {
        const listResp = await fetch("https://api.openphone.com/v1/phone-numbers", {
          headers: { "Authorization": openphoneKey },
        });
        if (listResp.ok) {
          const listData = await listResp.json();
          phoneNumberId = listData?.data?.[0]?.id;
        }
      }

      if (phoneNumberId) {
        const toE164    = phone.startsWith("1") ? `+${phone}` : `+1${phone}`;
        const notifyE164 = notifyPhone.startsWith("1") ? `+${notifyPhone}` : `+1${notifyPhone}`;
        const range      = estimateData?.rangeLow && estimateData?.rangeHigh
          ? ` | Est: $${estimateData.rangeLow}–$${estimateData.rangeHigh}`
          : "";
        const areasText  = areas?.length ? areas.join(", ") : "unspecified";

        const msg = `New estimate lead!\nPhone: ${toE164}\nJob: ${jobType}${vehicleType ? ` (${vehicleType})` : ""}\nAreas: ${areasText}${range}`;

        const smsResp = await fetch("https://api.openphone.com/v1/messages", {
          method: "POST",
          headers: { "Authorization": openphoneKey, "Content-Type": "application/json" },
          body: JSON.stringify({ content: msg, from: phoneNumberId, to: [notifyE164] }),
        });
        if (!smsResp.ok) {
          const txt = await smsResp.text();
          errors.push("SMS: " + txt);
        }
      } else {
        errors.push("SMS: could not determine phoneNumberId");
      }
    } catch (e) {
      errors.push("SMS error: " + e.message);
    }
  }

  // ── 3. Create estimate card in PM (project_data → estimates board) ───────────
  if (supabaseUrl && supabaseKey) {
    try {
      const headers = {
        "Content-Type": "application/json",
        "apikey":        supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
      };

      // Read current project_data
      const readResp = await fetch(
        `${supabaseUrl}/rest/v1/project_data?key=eq.main&select=data`,
        { headers }
      );
      const readJson   = await readResp.json();
      const current    = readJson?.[0]?.data || { me: [], jude: [], estimates: [] };

      // Build PM-compatible line items from the customer estimator format
      const defaultItemName = JOB_TYPE_TO_ZOHO[jobType] || "Reupholstery Retail";
      const lineItems = (estimateData?.lineItems || []).map(item => ({
        id:        genId(),
        itemName:  defaultItemName,
        qty:       item.qty       || 1,
        unitPrice: item.unitPrice || 0,
        notes:     item.description || "",
      }));

      // Fallback: if no line items came through, create one summary row
      if (!lineItems.length && estimateData?.subtotal) {
        lineItems.push({
          id:        genId(),
          itemName:  defaultItemName,
          qty:       1,
          unitPrice: estimateData.subtotal,
          notes:     estimateData.summary || `${jobType} estimate from web form`,
        });
      }

      // Use the subtotal as the stored total (range shown in description)
      const estimateTotal = estimateData?.subtotal
        || estimateData?.rangeLow
        || 0;

      // Build a readable description combining all the form fields
      const parts = [
        estimateData?.summary || "",
        vehicleType                  ? `Vehicle: ${vehicleType}` : "",
        areas?.length                ? `Areas: ${areas.join(", ")}` : "",
        material                     ? `Material preference: ${material}` : "",
        notes                        ? `Notes: ${notes}` : "",
        estimateData?.notes          ? `Estimator notes: ${estimateData.notes}` : "",
        estimateData?.rangeLow != null
          ? `Price range: $${estimateData.rangeLow}–$${estimateData.rangeHigh}` : "",
      ].filter(Boolean).join("\n");

      const toE164    = phone.replace(/\D/g, "");
      const e164Phone = toE164.startsWith("1") ? `+${toE164}` : `+1${toE164}`;
      const dateLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

      const newEstimate = {
        id:             genId(),
        title:          `Web Lead — ${jobType}${vehicleType ? ` (${vehicleType})` : ""} (${dateLabel})`,
        description:    parts,
        whatToDo:       estimateData?.summary || "",
        status:         "Needs Review",
        priority:       "Medium",
        dueDate:        "",
        quoteDate:      todayStr(),
        quoteNumber:    "",
        contactName:    "",
        contactPhone:   e164Phone,
        contactEmail:   "",
        commission:     "",
        paidCommission: "",
        estimateTotal:  String(estimateTotal),
        lineItems,
        attachments:    [],
        createdAt:      Date.now(),
      };

      const updated = {
        ...current,
        estimates: [...(current.estimates || []), newEstimate],
      };

      const writeResp = await fetch(`${supabaseUrl}/rest/v1/project_data`, {
        method: "POST",
        headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ key: "main", data: updated, updated_at: new Date().toISOString() }),
      });

      if (!writeResp.ok) {
        const txt = await writeResp.text();
        errors.push("PM card: " + txt);
      }
    } catch (e) {
      errors.push("PM card error: " + e.message);
    }
  }

  return res.status(200).json({ ok: true, errors });
}
