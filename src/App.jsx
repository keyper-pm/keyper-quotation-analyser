import { useState, useRef } from "react";

const SYSTEM_PROMPT = `You are a professional property management AI assistant specialising in Dubai real estate maintenance analysis.

When given a maintenance quotation (as text, extracted from PDF/image, or typed), you must produce TWO sections of output with NO questions asked, NO clarifications sought.

RULES FOR ANALYSIS

Responsibility Classification:
- Tenant is responsible for: minor repairs under AED 500, damage caused by misuse/negligence, consumables (light bulbs, batteries, filters), cosmetic damage caused by tenant
- Landlord is responsible for: structural issues, major appliance failures, wear & tear over time, electrical/plumbing infrastructure, AC systems, anything above AED 500 that is not tenant-caused damage

Wear & Tear:
- Mark Yes if the deterioration is consistent with normal use over time
- Mark No if caused by negligence, misuse, or accident

Maintenance Level:
- Minor: Small repairs, cosmetic fixes, consumables, single trade items under AED 2000
- Major: Structural, system-level (AC, plumbing, electrical), multi-trade, or over AED 2000

Median Market Price:
- Provide a realistic AED median market price for each line item based on typical Dubai contractor rates
- If quoted price is more than 20% above median, price_flag = Overpriced
- If within 20% range, price_flag = Fair
- If below median, price_flag = Competitive

Respond ONLY in valid JSON with this exact structure, no markdown fences, no preamble:
{
  "property_address": "extracted or inferred address, or Not specified",
  "quote_reference": "reference number if found, or N/A",
  "contractor": "contractor name if found, or N/A",
  "total_quoted": 0,
  "items": [
    {
      "number": 1,
      "scope": "clear description of work",
      "quoted_price": 0,
      "median_market_price": 0,
      "price_flag": "Fair",
      "issue_identified": "what problem exists",
      "root_cause": "technical reason for the issue",
      "why_required": "impact if not repaired",
      "work_type": "Plumbing / Electrical / Civil / Carpentry / AC / Painting / General",
      "maintenance_level": "Minor",
      "wear_and_tear": "Yes",
      "responsibility": "Landlord"
    }
  ],
  "overall_summary": "2-3 sentence professional summary of the quotation"
}`;

export default function App() {
  const [inputText] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("landlord");
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedRM, setCopiedRM] = useState(false);
  const fileRef = useRef();

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (f) setFile(f);
  };

  const fileToBase64 = (f) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(",")[1]);
      r.onerror = () => rej(new Error("Read failed"));
      r.readAsDataURL(f);
    });

  const analyse = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      let messages;
      const base64 = await fileToBase64(file);
      const isImage = file.type.startsWith("image/");
      const isPDF = file.type === "application/pdf";
      if (isImage) {
        messages = [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: file.type, data: base64 } },
          { type: "text", text: "Analyse this maintenance quotation." }
        ]}];
      } else if (isPDF) {
        messages = [{ role: "user", content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: "Analyse this maintenance quotation." }
        ]}];
      } else {
        throw new Error("Only PDF and image files are supported.");
      }
      const response = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 4000, system: SYSTEM_PROMPT, messages })
      });
      const data = await response.json();
      const text = data.content?.map(b => b.text || "").join("").trim();
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setResult(parsed);
    } catch (err) {
      setError(err.message || "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyHtmlViaDiv = (htmlContent, setter) => {
    // Create a visible-but-offscreen contenteditable div, insert HTML, select all, copy
    const div = document.createElement("div");
    div.contentEditable = "true";
    div.style.cssText = "position:fixed;top:0;left:0;width:2000px;opacity:0.01;overflow:hidden;pointer-events:none;";
    div.innerHTML = htmlContent;
    document.body.appendChild(div);
    const range = document.createRange();
    range.selectNodeContents(div);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    try { document.execCommand("copy"); } catch (e) {}
    sel.removeAllRanges();
    document.body.removeChild(div);
    setter(true);
    setTimeout(() => setter(false), 2500);
  };

  const th = `border:1px solid #000000;padding:6px 8px;font-family:Calibri,Arial,sans-serif;font-size:10pt;text-align:left;font-weight:bold;background:#ffffff;color:#000000;`;
  const td = `border:1px solid #000000;padding:6px 8px;font-family:Calibri,Arial,sans-serif;font-size:10pt;vertical-align:top;color:#000000;background:#ffffff;`;
  const HEADS = ["#","Scope of Work","Quoted Price (AED)","Median Market Price (AED)","Issue Identified","Root Cause Analysis","Why Work is Required","Work Type","Maintenance Level","Wear & Tear","Responsibility"];

  const getLandlordEmailHtml = (r) => {
    const headerRow = HEADS.map(h => `<th style="${th}">${h}</th>`).join("");
    const bodyRows = r.items.map(item => `<tr>
      <td style="${td}">${item.number}</td>
      <td style="${td}">${item.scope}</td>
      <td style="${td}">AED ${item.quoted_price?.toLocaleString()}</td>
      <td style="${td}">AED ${item.median_market_price?.toLocaleString()}</td>
      <td style="${td}">${item.issue_identified}</td>
      <td style="${td}">${item.root_cause}</td>
      <td style="${td}">${item.why_required}</td>
      <td style="${td}">${item.work_type}</td>
      <td style="${td}">${item.maintenance_level}</td>
      <td style="${td}">${item.wear_and_tear}</td>
      <td style="${td}">${item.responsibility}</td>
    </tr>`).join("");
    return `
      <p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:0 0 12px 0;">Dear Landlord,</p>
      <p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:0 0 16px 0;">We have received the attached maintenance quotation following the recent inspection at the above property. Please find below a detailed breakdown of the proposed scope of work for your review.</p>
      <table style="border-collapse:collapse;width:100%;">
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:16px 0 12px 0;">Based on the inspection findings, the quotation mainly covers the identified maintenance issues affecting the property's functionality and condition. The works are largely essential and preventive in nature and are required to ensure proper operation and prevent further deterioration. Delaying the repairs may result in additional damage and higher future repair costs. The quoted pricing has been benchmarked against current Dubai market rates.</p>
      <p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:0 0 12px 0;">Kindly review and confirm your approval to proceed accordingly.</p>
      <p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:0;">Kind regards,<br/><strong>Property Management Team</strong></p>`;
  };

  const getRMHtml = (r) => r.items.map((item, i) => `
    <p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:0 0 4px 0;"><strong>${i + 1}. Scope:</strong> ${item.scope}</p>
    <p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:0 0 4px 0;"><strong>Root Cause:</strong> ${item.root_cause}</p>
    <p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:0 0 4px 0;"><strong>Why Required:</strong> ${item.why_required}</p>
    <p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:0 0 16px 0;"><strong>Responsibility:</strong> ${item.responsibility}</p>`
  ).join("");

  const flagColor = (f) => ({ Overpriced: "#ef4444", Fair: "#22c55e", Competitive: "#3b82f6" }[f] || "#9ca3af");
  const flagBg = (f) => ({ Overpriced: "#2d1010", Fair: "#0d2010", Competitive: "#0d1525" }[f] || "#1a1a2e");

  const TH = ({ children }) => (
    <th style={{ padding: "9px 12px", textAlign: "left", color: "#7a7a9a", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, border: "1px solid #2a2a40", whiteSpace: "nowrap", background: "#111120" }}>
      {children}
    </th>
  );
  const TD = ({ children, style = {} }) => (
    <td style={{ padding: "10px 12px", border: "1px solid #1e1e30", color: "#c4c4d4", fontSize: 13, lineHeight: 1.4, verticalAlign: "top", ...style }}>
      {children}
    </td>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d14", color: "#e2e2e8", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#13131f", borderBottom: "1px solid #1e1e30", padding: "18px 28px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg,#b8924a,#d4aa6a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏗</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#d4aa6a" }}>Maintenance Quotation Analyser</div>
          <div style={{ fontSize: 11, color: "#4a4a6a", marginTop: 2 }}>Keyper · Dubai Property Management</div>
        </div>
      </div>

      <div style={{ maxWidth: 1060, margin: "0 auto", padding: "28px 20px" }}>

        {/* INPUT */}
        {!result && (
          <div style={{ background: "#13131f", border: "1px solid #1e1e30", borderRadius: 14, padding: 26 }}>
            <div style={{ fontSize: 11, color: "#4a4a6a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Upload or Paste Quotation</div>
            <div
              onClick={() => fileRef.current.click()}
              style={{ border: `2px dashed ${file ? "#22c55e" : "#2a2a40"}`, borderRadius: 10, padding: "22px 16px", textAlign: "center", cursor: "pointer", background: file ? "#0a1f0d" : "#0d0d14", marginBottom: 14, transition: "all 0.2s" }}
            >
              <input ref={fileRef} type="file" accept=".pdf,image/*" onChange={handleFile} style={{ display: "none" }} />
              <div style={{ fontSize: 24, marginBottom: 5 }}>{file ? "✅" : "📄"}</div>
              <div style={{ color: file ? "#22c55e" : "#4a4a6a", fontSize: 13 }}>{file ? file.name : "Click to upload PDF or Image"}</div>
            </div>

            <button
              onClick={analyse}
              disabled={loading || !file}
              style={{ marginTop: 14, width: "100%", background: (loading || !file) ? "#1a1a2e" : "linear-gradient(135deg,#b8924a,#d4aa6a)", color: (loading || !file) ? "#3a3a5a" : "#0d0d14", border: "none", borderRadius: 10, padding: "13px 0", fontSize: 14, fontWeight: 700, cursor: (loading || !file) ? "not-allowed" : "pointer" }}
            >
              {loading ? "⏳ Analysing..." : "🔍 Analyse Quotation"}
            </button>
            {error && <div style={{ marginTop: 12, background: "#1e0a0a", border: "1px solid #ef4444", borderRadius: 8, padding: "10px 14px", color: "#ef4444", fontSize: 13 }}>⚠️ {error}</div>}
          </div>
        )}

        {/* RESULTS */}
        {result && (
          <>
            {/* Meta bar */}
            <div style={{ background: "#13131f", border: "1px solid #1e1e30", borderRadius: 12, padding: "16px 22px", display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 18, alignItems: "center" }}>
              {[["Property", result.property_address], ["Contractor", result.contractor], ["Ref", result.quote_reference]].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 10, color: "#4a4a6a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 14, color: "#d4aa6a", fontWeight: 600 }}>{val}</div>
                </div>
              ))}
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "#4a4a6a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Total Quoted</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#d4aa6a" }}>AED {result.total_quoted?.toLocaleString()}</div>
              </div>
              <button onClick={() => { setResult(null); setFile(null); }}
                style={{ background: "transparent", border: "1px solid #2a2a40", borderRadius: 8, padding: "7px 14px", color: "#6a6a8a", cursor: "pointer", fontSize: 12 }}>← New</button>
            </div>

            {/* Summary */}
            <div style={{ background: "#0d1520", border: "1px solid #1a304a", borderRadius: 10, padding: "13px 18px", marginBottom: 20, color: "#7a9abc", fontSize: 13, lineHeight: 1.6, fontStyle: "italic" }}>
              📋 {result.overall_summary}
            </div>

            {/* Full breakdown table */}
            <div style={{ background: "#13131f", border: "1px solid #1e1e30", borderRadius: 12, overflow: "hidden", marginBottom: 22 }}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid #1e1e30", fontSize: 11, color: "#4a4a6a", textTransform: "uppercase", letterSpacing: 1 }}>
                Breakdown — {result.items.length} items
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["#","Scope of Work","Quoted (AED)","Market Median","Price","Issue","Root Cause","Why Required","Type","Level","W&T","Resp."].map(h => <TH key={h}>{h}</TH>)}
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((item, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "#0f0f1a" }}>
                        <TD style={{ color: "#d4aa6a", fontWeight: 700 }}>{item.number}</TD>
                        <TD style={{ maxWidth: 160 }}>{item.scope}</TD>
                        <TD style={{ fontWeight: 600, color: "#e2e2e8", whiteSpace: "nowrap" }}>AED {item.quoted_price?.toLocaleString()}</TD>
                        <TD style={{ color: "#8a8aaa", whiteSpace: "nowrap" }}>AED {item.median_market_price?.toLocaleString()}</TD>
                        <TD>
                          <span style={{ background: flagBg(item.price_flag), color: flagColor(item.price_flag), borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                            {item.price_flag}
                          </span>
                        </TD>
                        <TD style={{ maxWidth: 140 }}>{item.issue_identified}</TD>
                        <TD style={{ maxWidth: 140 }}>{item.root_cause}</TD>
                        <TD style={{ maxWidth: 140 }}>{item.why_required}</TD>
                        <TD style={{ whiteSpace: "nowrap", color: "#8888aa" }}>{item.work_type}</TD>
                        <TD style={{ color: item.maintenance_level === "Major" ? "#f59e0b" : "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>{item.maintenance_level}</TD>
                        <TD style={{ color: "#8888aa" }}>{item.wear_and_tear}</TD>
                        <TD style={{ color: item.responsibility === "Landlord" ? "#22c55e" : "#ef4444", fontWeight: 700, whiteSpace: "nowrap" }}>{item.responsibility}</TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 2, background: "#0d0d14", borderRadius: 10, padding: 4, width: "fit-content", marginBottom: 14 }}>
              {[["landlord","📧 Landlord Email"],["rm","📋 RM Summary"]].map(([key, label]) => (
                <button key={key} onClick={() => setActiveTab(key)}
                  style={{ background: activeTab === key ? "linear-gradient(135deg,#b8924a,#d4aa6a)" : "transparent", color: activeTab === key ? "#0d0d14" : "#6a6a8a", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Landlord Email */}
            {activeTab === "landlord" && (
              <div style={{ background: "#13131f", border: "1px solid #1e1e30", borderRadius: 12 }}>
                <div style={{ padding: "13px 20px", borderBottom: "1px solid #1e1e30", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 11, color: "#4a4a6a", textTransform: "uppercase", letterSpacing: 1 }}>Landlord Email Draft</div>
                  <button
                    onClick={() => copyHtmlViaDiv(getLandlordEmailHtml(result), setCopiedEmail)}
                    style={{ background: copiedEmail ? "#0d2010" : "transparent", border: `1px solid ${copiedEmail ? "#22c55e" : "#2a2a40"}`, borderRadius: 8, padding: "7px 14px", color: copiedEmail ? "#22c55e" : "#d4aa6a", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                    {copiedEmail ? "✅ Copied!" : "📋 Copy Email"}
                  </button>
                </div>
                <div style={{ padding: 24 }}>
                  <div style={{ marginBottom: 18, background: "#0d0d14", border: "1px solid #1e1e30", borderRadius: 8, padding: "9px 14px" }}>
                    <span style={{ fontSize: 11, color: "#4a4a6a" }}>SUBJECT: </span>
                    <span style={{ color: "#e2e2e8", fontSize: 14, fontWeight: 600 }}>Maintenance Quotation – {result.property_address}</span>
                  </div>
                  <p style={{ color: "#c8c8d8", fontSize: 14, lineHeight: 1.7, marginBottom: 14 }}>Dear Landlord,</p>
                  <p style={{ color: "#c8c8d8", fontSize: 14, lineHeight: 1.7, marginBottom: 20 }}>
                    We have received the attached maintenance quotation following the recent inspection at the above property. Please find below a detailed breakdown of the proposed scope of work for your review.
                  </p>
                  <div style={{ overflowX: "auto", marginBottom: 20 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr>
                          {["#","Scope of Work","Quoted Price (AED)","Median Market Price (AED)","Issue Identified","Root Cause Analysis","Why Work is Required","Work Type","Maintenance Level","Wear & Tear","Responsibility"].map(h => (
                            <th key={h} style={{ padding: "9px 12px", textAlign: "left", background: "#1a1a2e", color: "#9a9ab8", fontWeight: 600, fontSize: 11, border: "1px solid #2a2a40", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.items.map((item, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? "#13131f" : "#0f0f1a" }}>
                            <td style={{ padding: "9px 12px", border: "1px solid #1e1e30", color: "#d4aa6a", fontWeight: 700 }}>{item.number}</td>
                            <td style={{ padding: "9px 12px", border: "1px solid #1e1e30", color: "#e2e2e8", minWidth: 150 }}>{item.scope}</td>
                            <td style={{ padding: "9px 12px", border: "1px solid #1e1e30", color: "#e2e2e8", fontWeight: 600, whiteSpace: "nowrap" }}>AED {item.quoted_price?.toLocaleString()}</td>
                            <td style={{ padding: "9px 12px", border: "1px solid #1e1e30", color: "#9a9ab8", whiteSpace: "nowrap" }}>AED {item.median_market_price?.toLocaleString()}</td>
                            <td style={{ padding: "9px 12px", border: "1px solid #1e1e30", color: "#b0b0c8", minWidth: 130 }}>{item.issue_identified}</td>
                            <td style={{ padding: "9px 12px", border: "1px solid #1e1e30", color: "#b0b0c8", minWidth: 130 }}>{item.root_cause}</td>
                            <td style={{ padding: "9px 12px", border: "1px solid #1e1e30", color: "#b0b0c8", minWidth: 130 }}>{item.why_required}</td>
                            <td style={{ padding: "9px 12px", border: "1px solid #1e1e30", color: "#8888aa", whiteSpace: "nowrap" }}>{item.work_type}</td>
                            <td style={{ padding: "9px 12px", border: "1px solid #1e1e30", color: item.maintenance_level === "Major" ? "#f59e0b" : "#6b7280", fontWeight: 600 }}>{item.maintenance_level}</td>
                            <td style={{ padding: "9px 12px", border: "1px solid #1e1e30", color: "#8888aa" }}>{item.wear_and_tear}</td>
                            <td style={{ padding: "9px 12px", border: "1px solid #1e1e30", color: item.responsibility === "Landlord" ? "#22c55e" : "#ef4444", fontWeight: 700 }}>{item.responsibility}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ color: "#c8c8d8", fontSize: 14, lineHeight: 1.7, marginBottom: 14 }}>
                    Based on the inspection findings, the quotation mainly covers the identified maintenance issues affecting the property's functionality and condition. The works are largely essential and preventive in nature and are required to ensure proper operation and prevent further deterioration. Delaying the repairs may result in additional damage and higher future repair costs. The quoted pricing has been benchmarked against current Dubai market rates.
                  </p>
                  <p style={{ color: "#c8c8d8", fontSize: 14, lineHeight: 1.7, marginBottom: 18 }}>Kindly review and confirm your approval to proceed accordingly.</p>
                  <p style={{ color: "#c8c8d8", fontSize: 14, lineHeight: 1.7, margin: 0 }}>Kind regards,<br /><strong style={{ color: "#d4aa6a" }}>Property Management Team</strong></p>
                </div>
              </div>
            )}

            {/* RM Summary */}
            {activeTab === "rm" && (
              <div style={{ background: "#13131f", border: "1px solid #1e1e30", borderRadius: 12 }}>
                <div style={{ padding: "13px 20px", borderBottom: "1px solid #1e1e30", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 11, color: "#4a4a6a", textTransform: "uppercase", letterSpacing: 1 }}>RM Internal Summary</div>
                  <button
                    onClick={() => copyHtmlViaDiv(getRMHtml(result), setCopiedRM)}
                    style={{ background: copiedRM ? "#0d2010" : "transparent", border: `1px solid ${copiedRM ? "#22c55e" : "#2a2a40"}`, borderRadius: 8, padding: "7px 14px", color: copiedRM ? "#22c55e" : "#d4aa6a", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                    {copiedRM ? "✅ Copied!" : "📋 Copy Summary"}
                  </button>
                </div>
                <div style={{ padding: 24 }}>
                  {result.items.map((item, i) => (
                    <div key={i} style={{ borderLeft: "3px solid #d4aa6a", paddingLeft: 18, marginBottom: 24 }}>
                      <div style={{ fontWeight: 700, color: "#d4aa6a", fontSize: 14, marginBottom: 10 }}>{i + 1}. {item.scope}</div>
                      <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
                        <tbody>
                          {[["Root Cause", item.root_cause, "#c4c4d4"],["Why Required", item.why_required, "#c4c4d4"],["Work Type", item.work_type, "#8888aa"],["Level", item.maintenance_level, item.maintenance_level === "Major" ? "#f59e0b" : "#6b7280"],["Wear & Tear", item.wear_and_tear, "#8888aa"],["Responsibility", item.responsibility, item.responsibility === "Landlord" ? "#22c55e" : "#ef4444"]].map(([label, val, color]) => (
                            <tr key={label}>
                              <td style={{ padding: "4px 12px 4px 0", color: "#4a4a6a", width: 130, verticalAlign: "top", fontWeight: 500 }}>{label}</td>
                              <td style={{ padding: "4px 0", color, lineHeight: 1.5, fontWeight: label === "Responsibility" ? 700 : 400 }}>{val}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
