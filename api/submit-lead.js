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

  return res.status(200).json({ ok: true, errors });
}
