import { useState, useRef, useCallback } from "react";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  navy:     "#0F1E3C",
  navyMid:  "#1E3A5F",
  gold:     "#C9A84C",
  goldDark: "#A8842A",
  white:    "#FFFFFF",
  bg:       "#F8FAFC",
  border:   "#E2E8F0",
  border2:  "#CBD5E1",
  text:     "#0F172A",
  textMid:  "#334155",
  textMute: "#64748B",
  green:    "#10B981",
  red:      "#EF4444",
};

// ─── Data ─────────────────────────────────────────────────────────────────────
const JOB_TYPES = [
  { id:"auto",      label:"Auto",      icon:"🚗", desc:"Cars, trucks & SUVs" },
  { id:"marine",    label:"Marine",    icon:"⛵", desc:"Boats & watercraft"   },
  { id:"rv",        label:"RV",        icon:"🚐", desc:"Motorhomes & trailers"},
  { id:"furniture", label:"Furniture", icon:"🛋️", desc:"Home & commercial"   },
];

const VEHICLE_OPTIONS = {
  auto:      ["Dodge / Ram","Ford","Chevrolet / GMC","Toyota","Honda","Jeep","Other"],
  marine:    ["Bass boat","Pontoon","Ski boat","Cabin cruiser","Jet ski","Other"],
  rv:        ["Class A motorhome","Class B / van","Class C motorhome","Travel trailer","5th wheel","Other"],
  furniture: null,
};

const AREA_OPTIONS = {
  auto:      ["Driver seat","Passenger seat","Rear seats","Door panels","Center console","Headliner"],
  marine:    ["Captain's chairs","Passenger seats","Bow cushions","Stern cushions","Engine cover / sundeck","Helm wrap"],
  rv:        ["Cab seats","Dinette","Sofa / couch","Bedroom cushions","Door panels"],
  furniture: ["Seat cushions","Back cushions","Arms","Full reupholster"],
};

const MATERIAL_OPTIONS = {
  auto:      ["Match original","Premium vinyl","Leather look","No preference"],
  marine:    ["Marine vinyl","Sunbrella","Match existing","No preference"],
  rv:        ["RV vinyl","Sunbrella","Match existing","No preference"],
  furniture: ["Standard vinyl","Premium vinyl","Sunbrella","No preference"],
};

const RATE_CARD = `RATE CARD — calculate all line items using these exact rates:
• Upholstery labor: $85/hr
• Auto interior repair labor: $135/hr
• Vinyl (all types — furniture / RV / marine): $28/yd
• Sunbrella outdoor fabric: $30/yd
• Captain chair labor: $850 flat (material is charged separately)
• Cushion (welted, boxed, or zipper closure): 1.5–2 hrs each
• Material waste buffer: 10–15% for solids, 20% for pattern matching
• Complex curved / pleated multi-panel work: ~1 hr/yd of material
• Large flat panels (sundeck, engine cover): approx 5 yds / 5 hrs per 2 pieces
• Welt / accent strips: add 1–1.5 yds on top of main material estimate
• Auto R&I bottom seat cover: $135 (Dodge/Ram), $150 (all other vehicles)
• Auto R&I top seat cover: $150 flat
• Auto single panel insert replacement: $225 wholesale / $235 retail
• Leather edge refinish: $135 starting
• Headliner replacement: $575 maximum — never exceed $575 for a headliner job regardless of vehicle size or complexity`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt$(n) {
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve({ base64: e.target.result.split(",")[1], contentType: file.type || "image/jpeg" });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ step }) {
  const steps = ["Job Type", "Details", "Photos", "Get Estimate"];
  return (
    <div style={{ padding: "20px 20px 0" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        {steps.map((label, i) => {
          const n = i + 1;
          const done = step > n, active = step === n;
          return (
            <div key={n} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 11, fontWeight: 700,
                  background: done ? C.green : active ? C.navy : C.border,
                  color: done || active ? C.white : C.textMute,
                  border: active ? `2px solid ${C.gold}` : "2px solid transparent",
                  transition: "all 0.2s",
                }}>
                  {done ? "✓" : n}
                </div>
                <span style={{ fontSize: 9, fontWeight: 600, color: active ? C.navy : C.textMute, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                  {label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div style={{ flex: 1, height: 2, background: done ? C.green : C.border, margin: "0 4px", marginBottom: 18, transition: "background 0.2s" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep]           = useState(1);
  const [jobType, setJobType]     = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [areas, setAreas]         = useState([]);
  const [material, setMaterial]   = useState("");
  const [notes, setNotes]         = useState("");
  const [photos, setPhotos]       = useState([]);
  const [phone, setPhone]         = useState("");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [status, setStatus]       = useState("idle");
  const [result, setResult]       = useState(null);
  const [errMsg, setErrMsg]       = useState("");
  const [dragging, setDragging]   = useState(false);
  const fileRef = useRef();

  const toggleArea = a => setAreas(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);

  const addFiles = useCallback(async (files) => {
    const toAdd = [];
    for (const f of Array.from(files)) {
      if (photos.length + toAdd.length >= 5) break;
      if (!f.type.startsWith("image/")) continue;
      const preview = URL.createObjectURL(f);
      const { base64, contentType } = await readFileAsBase64(f);
      toAdd.push({ preview, base64, contentType });
    }
    setPhotos(prev => [...prev, ...toAdd]);
  }, [photos.length]);

  const onFilePick = e => { addFiles(e.target.files); e.target.value = ""; };
  const onDrop = e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); };

  const handlePhone = e => {
    const d = e.target.value.replace(/\D/g, "").slice(0, 10);
    setPhoneDigits(d);
    if (d.length === 0) setPhone("");
    else if (d.length <= 3) setPhone(d);
    else if (d.length <= 6) setPhone(`(${d.slice(0,3)}) ${d.slice(3)}`);
    else setPhone(`(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`);
  };

  const getEstimate = async () => {
    if (phoneDigits.length < 10) { setErrMsg("Please enter a valid 10-digit phone number."); return; }
    setStatus("loading"); setErrMsg(""); setResult(null);
    try {
      const imageContents = photos.map(p => ({
        type: "image",
        source: { type: "base64", media_type: p.contentType, data: p.base64 },
      }));

      const prompt = `You are an expert upholstery estimator for Mingo's Upholstery in West Haven, Utah — a professional shop specializing in marine, RV, auto, and furniture upholstery.

${RATE_CARD}

CUSTOMER REQUEST:
Job type: ${jobType}${vehicleType ? ` (${vehicleType})` : ""}
Areas needing work: ${areas.length ? areas.join(", ") : "Not specified"}
Material preference: ${material || "No preference"}
Additional notes: ${notes || "None"}
Photos submitted: ${photos.length}

Using the photos and details above, generate a preliminary estimate. Use the rate card to build specific line items. Provide a low-high range that reflects reasonable scope uncertainty.

Respond with JSON only — no markdown:
{
  "summary": "2-3 sentences describing the work based on what you observe",
  "lineItems": [
    {"description": "description", "qty": 1, "unit": "hrs/yds/flat", "unitPrice": 85, "total": 85}
  ],
  "subtotal": 0,
  "rangeLow": 0,
  "rangeHigh": 0,
  "notes": "caveats, assumptions, or things to confirm at inspection"
}`;

      const response = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1200,
          messages: [{ role: "user", content: [...imageContents, { type: "text", text: prompt }] }],
        }),
      });

      const data = await response.json();
      const text = data.content?.find(b => b.type === "text")?.text || "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

      // Hard cap: headliner jobs never exceed $575 on the customer-facing estimate
      const HEADLINER_CAP = 575;
      if (areas.includes("Headliner")) {
        // Cap any line item whose description mentions headliner
        if (parsed.lineItems) {
          parsed.lineItems = parsed.lineItems.map(item =>
            /headliner/i.test(item.description || "")
              ? { ...item, total: Math.min(item.total || 0, HEADLINER_CAP) }
              : item
          );
          parsed.subtotal = parsed.lineItems.reduce((s, x) => s + (x.total || 0), 0);
        }
        // Cap the displayed price range
        parsed.rangeLow  = Math.min(parsed.rangeLow  || 0, HEADLINER_CAP);
        parsed.rangeHigh = Math.min(parsed.rangeHigh || 0, HEADLINER_CAP);
      }

      setResult(parsed);
      setStatus("done");
      setStep(5);

      // Fire-and-forget: save lead + send SMS notification
      fetch("/api/submit-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneDigits, jobType, vehicleType, areas, material, notes, estimateData: parsed }),
      }).catch(() => {});

    } catch (err) {
      setErrMsg("Something went wrong generating your estimate. Please try again.");
      setStatus("error");
    }
  };

  // ─── Shared style helpers ─────────────────────────────────────────────────
  const pill = (active, color = C.navy) => ({
    padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
    border: `1.5px solid ${active ? color : C.border2}`,
    background: active ? (color === C.navy ? "#EEF2FF" : color === C.green ? "#ECFDF5" : "#FFFBEB") : "transparent",
    color: active ? (color === C.navy ? C.navy : color === C.green ? C.green : C.goldDark) : C.textMid,
    transition: "all 0.15s",
  });

  const btnPrimary = (disabled = false) => ({
    flex: 1, padding: "13px 24px", borderRadius: 9, border: "none", cursor: disabled ? "default" : "pointer",
    fontSize: 15, fontWeight: 700, background: disabled ? C.border2 : `linear-gradient(135deg,${C.navy},${C.navyMid})`,
    color: disabled ? C.textMute : C.white, transition: "opacity 0.15s",
  });

  const btnSecondary = {
    padding: "13px 20px", borderRadius: 9, border: `1px solid ${C.border2}`, cursor: "pointer",
    fontSize: 14, fontWeight: 600, background: "transparent", color: C.textMid,
  };

  const label = { fontSize: 13, fontWeight: 700, color: C.textMid, marginBottom: 7, display: "block" };
  const inputStyle = {
    width: "100%", padding: "11px 13px", borderRadius: 8, border: `1px solid ${C.border2}`,
    fontSize: 14, color: C.text, outline: "none", boxSizing: "border-box", background: C.white,
  };

  // ─── Step 1: Job type ─────────────────────────────────────────────────────
  if (step === 1) return (
    <div style={{ minHeight: "100vh", background: C.bg, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ padding: "32px 20px 24px", textAlign: "center", background: `linear-gradient(150deg,${C.navy} 0%,${C.navyMid} 100%)` }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
          Free Estimate
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: C.white, fontFamily: "Georgia,serif", lineHeight: 1.2, marginBottom: 10 }}>
          What are we working on?
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
          Select a category to get started.
        </p>
      </div>
      <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {JOB_TYPES.map(jt => (
          <button key={jt.id} onClick={() => { setJobType(jt.id); setVehicleType(""); setAreas([]); setMaterial(""); setStep(2); }}
            style={{ padding: "20px 12px", textAlign: "center", cursor: "pointer", borderRadius: 14, border: `2px solid ${C.border}`, background: C.white, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", transition: "all 0.15s" }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>{jt.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 3 }}>{jt.label}</div>
            <div style={{ fontSize: 11, color: C.textMute }}>{jt.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );

  // ─── Step 2: Details ──────────────────────────────────────────────────────
  if (step === 2) {
    const vehicles = VEHICLE_OPTIONS[jobType];
    return (
      <div style={{ minHeight: "100vh", background: C.bg, maxWidth: 480, margin: "0 auto" }}>
        <ProgressBar step={2} />
        <div style={{ padding: "20px" }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: C.navy, fontFamily: "Georgia,serif", marginBottom: 4 }}>Tell us about your project</h2>
          <p style={{ fontSize: 13, color: C.textMute, marginBottom: 22 }}>More detail = more accurate estimate.</p>

          {vehicles && (
            <div style={{ marginBottom: 20 }}>
              <label style={label}>{jobType === "auto" ? "Vehicle make" : "Type"}</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {vehicles.map(v => (
                  <button key={v} onClick={() => setVehicleType(v)} style={pill(vehicleType === v)}>{v}</button>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={label}>
              Areas needing work <span style={{ fontWeight: 400, color: C.textMute }}>(select all that apply)</span>
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {(AREA_OPTIONS[jobType] || []).map(a => (
                <button key={a} onClick={() => toggleArea(a)} style={pill(areas.includes(a), C.green)}>{a}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={label}>
              Material preference <span style={{ fontWeight: 400, color: C.textMute }}>(optional)</span>
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {(MATERIAL_OPTIONS[jobType] || []).map(m => (
                <button key={m} onClick={() => setMaterial(material === m ? "" : m)} style={pill(material === m, C.gold)}>{m}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={label}>Anything else? <span style={{ fontWeight: 400, color: C.textMute }}>(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Color preferences, existing damage, special requests..."
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setStep(1)} style={btnSecondary}>Back</button>
            <button onClick={() => setStep(3)} disabled={areas.length === 0} style={btnPrimary(areas.length === 0)}>
              Continue →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step 3: Photos ───────────────────────────────────────────────────────
  if (step === 3) return (
    <div style={{ minHeight: "100vh", background: C.bg, maxWidth: 480, margin: "0 auto" }}>
      <ProgressBar step={3} />
      <div style={{ padding: "20px" }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: C.navy, fontFamily: "Georgia,serif", marginBottom: 4 }}>Add photos</h2>
        <p style={{ fontSize: 13, color: C.textMute, marginBottom: 20 }}>
          Photos help us give you a more accurate estimate. Up to 5 — closer is better.
        </p>

        <div
          onDragEnter={e => { e.preventDefault(); setDragging(true); }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => photos.length < 5 && fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? C.navy : C.border2}`, borderRadius: 12,
            padding: "30px 20px", textAlign: "center", cursor: photos.length < 5 ? "pointer" : "default",
            background: dragging ? "#EEF2FF" : C.bg, transition: "all 0.15s", marginBottom: 14,
          }}>
          <input ref={fileRef} type="file" multiple accept="image/*" style={{ display: "none" }} onChange={onFilePick} />
          <div style={{ fontSize: 30, marginBottom: 8 }}>📷</div>
          <p style={{ fontSize: 13, fontWeight: 600, color: photos.length < 5 ? C.navy : C.textMute, marginBottom: 3 }}>
            {photos.length === 0 ? "Tap to add photos" : photos.length < 5 ? "Add more photos" : "5 photos added"}
          </p>
          <p style={{ fontSize: 11, color: C.textMute }}>{photos.length} / 5</p>
        </div>

        {photos.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
            {photos.map((p, i) => (
              <div key={i} style={{ position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "1", background: C.bg }}>
                <img src={p.preview} alt={`Photo ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                  style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.65)", border: "none", color: C.white, borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: 12, color: C.textMute, marginBottom: 24, lineHeight: 1.5 }}>
          No photos? No problem — you can still get a ballpark estimate from your description.
        </p>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setStep(2)} style={btnSecondary}>Back</button>
          <button onClick={() => setStep(4)} style={btnPrimary()}>Continue →</button>
        </div>
      </div>
    </div>
  );

  // ─── Step 4: Phone gate ───────────────────────────────────────────────────
  if (step === 4) return (
    <div style={{ minHeight: "100vh", background: C.bg, maxWidth: 480, margin: "0 auto" }}>
      <ProgressBar step={4} />
      <div style={{ padding: "24px 20px 0", textAlign: "center" }}>
        <div style={{
          width: 60, height: 60, borderRadius: "50%",
          background: `linear-gradient(135deg,${C.navy},${C.navyMid})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 26, margin: "8px auto 20px",
        }}>🔒</div>
        <h2 style={{ fontSize: 21, fontWeight: 800, color: C.navy, fontFamily: "Georgia,serif", marginBottom: 10 }}>
          Almost there
        </h2>
        <p style={{ fontSize: 13, color: C.textMute, lineHeight: 1.6, marginBottom: 24, maxWidth: 300, margin: "0 auto 24px" }}>
          Enter your phone number to unlock your free estimate. We may follow up if you have questions.
        </p>

        <div style={{ maxWidth: 280, margin: "0 auto 10px" }}>
          <input type="tel" value={phone} onChange={handlePhone} placeholder="(555) 555-5555"
            style={{ ...inputStyle, fontSize: 20, textAlign: "center", padding: "14px", letterSpacing: "0.06em" }} />
        </div>
        {errMsg && <p style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{errMsg}</p>}
        <p style={{ fontSize: 11, color: C.textMute, marginBottom: 28, lineHeight: 1.5 }}>
          We won't spam. Your number is used to deliver your estimate only.
        </p>
      </div>

      <div style={{ padding: "0 20px 28px", display: "flex", gap: 10 }}>
        <button onClick={() => setStep(3)} style={btnSecondary}>Back</button>
        <button onClick={getEstimate} disabled={status === "loading"} style={btnPrimary(status === "loading")}>
          {status === "loading" ? "Analyzing photos…" : "Get My Estimate ✨"}
        </button>
      </div>
    </div>
  );

  // ─── Step 5: Results ──────────────────────────────────────────────────────
  if (step === 5 && result) return (
    <div style={{ minHeight: "100vh", background: C.bg, maxWidth: 480, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ padding: "28px 20px 24px", background: `linear-gradient(150deg,${C.navy} 0%,${C.navyMid} 100%)`, textAlign: "center" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
          Preliminary Estimate
        </p>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: C.white, fontFamily: "Georgia,serif", marginBottom: 18 }}>
          Your Estimate
        </h2>
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 42, fontWeight: 900, color: C.white, letterSpacing: "-1px" }}>
            {fmt$(result.rangeLow)} – {fmt$(result.rangeHigh)}
          </span>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Estimated range based on photos & description</p>
      </div>

      <div style={{ padding: "20px" }}>
        {/* Summary */}
        <p style={{ fontSize: 14, color: C.textMid, lineHeight: 1.65, marginBottom: 20 }}>{result.summary}</p>

        {/* Line items */}
        <div style={{ background: C.white, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}`, marginBottom: 16 }}>
          <div style={{ padding: "10px 14px", background: C.bg, borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.textMute, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Estimate Breakdown
            </span>
          </div>
          {result.lineItems?.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "11px 14px", borderBottom: `1px solid ${C.border}`, gap: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, color: C.text, fontWeight: 500, marginBottom: 2 }}>{item.description}</p>
                <p style={{ fontSize: 11, color: C.textMute }}>{item.qty} {item.unit} @ {fmt$(item.unitPrice)}</p>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>{fmt$(item.total)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.textMid }}>Subtotal</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: C.navy }}>{fmt$(result.subtotal)}</span>
          </div>
        </div>

        {/* Notes */}
        {result.notes && (
          <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: "#92400E", lineHeight: 1.6 }}>📝 {result.notes}</p>
          </div>
        )}

        {/* Disclaimer */}
        <div style={{ background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 8, padding: "12px 14px", marginBottom: 24 }}>
          <p style={{ fontSize: 12, color: "#0369A1", lineHeight: 1.6 }}>
            <strong>Preliminary estimate only.</strong> Final pricing is confirmed after an in-person inspection.
            Prices may vary based on actual material needs, condition, and scope of work. Tax not included.
          </p>
        </div>

        {/* CTA */}
        <div style={{ textAlign: "center", paddingBottom: 32 }}>
          <p style={{ fontSize: 13, color: C.textMute, marginBottom: 14 }}>Ready to move forward? Give us a call.</p>
          <a href="tel:+13854062408"
            style={{ display: "inline-block", padding: "14px 32px", borderRadius: 10, background: `linear-gradient(135deg,${C.navy},${C.navyMid})`, color: C.white, fontSize: 16, fontWeight: 700, textDecoration: "none", marginBottom: 8 }}>
            Call Mingo's Upholstery
          </a>
          <p style={{ fontSize: 11, color: C.textMute, marginTop: 6 }}>(385) 406-2408 · West Haven, Utah</p>
        </div>
      </div>
    </div>
  );

  return null;
}
