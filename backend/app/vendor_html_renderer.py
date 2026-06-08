from datetime import datetime
from html import escape
from typing import Any, Dict, Iterable


def _section_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value]
    return []


def _resolve_template_theme(template: str | None, options: dict[str, Any] | None = None) -> dict[str, str]:
    themes = {
        "executive": {
            "accent": "#3b82f6",
            "card": "#eff6ff",
            "muted": "#f3f4f6",
            "border": "#dbe3ef",
        },
        "modern": {
            "accent": "#14b8a6",
            "card": "#d9f7ef",
            "muted": "#f0fdf4",
            "border": "#c7f0e3",
        },
        "classic": {
            "accent": "#a16207",
            "card": "#fef3c7",
            "muted": "#f8f0e3",
            "border": "#f3e0b5",
        },
        "minimal": {
            "accent": "#111827",
            "card": "#f3f4f6",
            "muted": "#f8fafc",
            "border": "#e5e7eb",
        },
    }

    if isinstance(options, dict):
        theme_option = options.get("theme")
        if isinstance(theme_option, dict):
            return {
                "accent": theme_option.get("accent")
                or theme_option.get("primaryDark")
                or theme_option.get("primary")
                or "#3b82f6",
                "card": theme_option.get("card")
                or theme_option.get("secondary")
                or theme_option.get("background")
                or "#eff6ff",
                "muted": theme_option.get("muted")
                or theme_option.get("surface")
                or "#f3f4f6",
                "border": theme_option.get("border")
                or theme_option.get("outline")
                or "#dbe3ef",
            }

    return themes.get(template, themes["executive"])


def _render_analysis_html(vendor_response: Dict[str, Any], timestamp: str, theme: dict[str, str]) -> str:
    accent = theme.get("accent", "#3b82f6")
    card = theme.get("card", "#eff6ff")
    muted = theme.get("muted", "#f3f4f6")
    border = theme.get("border", "#dbe3ef")

    executive_summary = escape(str(vendor_response.get("executive_summary", "")))
    requirement_mapping = vendor_response.get("requirement_mapping", [])
    pricing_breakdown = vendor_response.get("pricing_breakdown", [])
    value_justification = escape(str(vendor_response.get("value_justification", "")))
    timeline = escape(str(vendor_response.get("timeline", "")))
    risk_mitigation = _section_list(vendor_response.get("risk_mitigation", []))
    stage_errors = _section_list(vendor_response.get("stage_errors", []))

    req_rows = ""
    for req in requirement_mapping if isinstance(requirement_mapping, list) else []:
        status = str(req.get("status", ""))
        status_color = {"MATCH": "#22c55e", "PARTIAL": "#eab308", "GAP": "#ef4444"}.get(status, "#999")
        req_rows += f"""
        <tr>
            <td>{escape(str(req.get('requirement', '')))}</td>
            <td>{escape(str(req.get('vendor_capability', '')))}</td>
            <td style="color: {status_color}; font-weight: bold;">{escape(status)}</td>
            <td style="text-align: center;">{escape(str(req.get('value_score', 0)))}</td>
            <td>{escape(str(req.get('rationale', '')))}</td>
        </tr>
        """

    price_rows = ""
    for price_item in pricing_breakdown if isinstance(pricing_breakdown, list) else []:
        amount = price_item.get("amount", "")
        price_rows += f"""
        <tr>
            <td>{escape(str(price_item.get('label', '')))}</td>
            <td style="text-align: right;">${escape(str(amount))}</td>
            <td>{escape(str(price_item.get('reason', '')))}</td>
        </tr>
        """

    risk_items = "".join(f"<li>{escape(item)}</li>" for item in risk_mitigation)
    errors_html = ""
    if stage_errors:
        errors_html = f"""
        <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 12px; margin: 16px 0; font-size: 13px;">
            <strong style="color: #991b1b;">Generation Warnings:</strong>
            <ul style="margin: 8px 0 0 0; padding-left: 20px;">{''.join(f'<li>{escape(error)}</li>' for error in stage_errors)}</ul>
        </div>
        """

    return f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vendor Proposal</title>
        <style>
            @page {{ size: A4; margin: 18mm; }}
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1f2937; line-height: 1.6; background: #fff; padding: 40px; }}
            @media print {{ body {{ padding: 20px; }} }}
            .header {{ border-bottom: 3px solid {accent}; padding-bottom: 16px; margin-bottom: 32px; }}
            h1 {{ font-size: 28px; font-weight: bold; color: #1f2937; margin-bottom: 8px; }}
            .timestamp {{ font-size: 12px; color: #6b7280; }}
            h2 {{ font-size: 18px; font-weight: 600; color: #1f2937; margin-top: 28px; margin-bottom: 12px; border-left: 4px solid {accent}; padding-left: 12px; }}
            p {{ margin-bottom: 12px; font-size: 14px; }}
            table {{ width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }}
            th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid {border}; }}
            th {{ background-color: {muted}; font-weight: 600; color: #1f2937; }}
            tr:nth-child(even) {{ background-color: #f9fafb; }}
            ul, ol {{ margin-left: 24px; margin-bottom: 12px; font-size: 14px; }}
            li {{ margin-bottom: 6px; }}
            .section {{ page-break-inside: avoid; margin-bottom: 24px; }}
            .meta-card {{ border: 1px solid {border}; border-radius: 12px; padding: 14px; background: {card}; margin-bottom: 16px; }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Vendor Proposal</h1>
            <div class="timestamp">Generated: {timestamp}</div>
        </div>
        {errors_html}
        <div class="section"><h2>Executive Summary</h2><p>{executive_summary}</p></div>
        <div class="section">
            <h2>Requirement Mapping</h2>
            <table><thead><tr><th>Requirement</th><th>Vendor Capability</th><th>Status</th><th>Score</th><th>Rationale</th></tr></thead><tbody>{req_rows}</tbody></table>
        </div>
        <div class="section">
            <h2>Pricing Breakdown</h2>
            <table><thead><tr><th>Item</th><th>Amount</th><th>Reason</th></tr></thead><tbody>{price_rows}</tbody></table>
        </div>
        <div class="section"><h2>Value Justification</h2><p>{value_justification}</p></div>
        <div class="section"><h2>Timeline</h2><p>{timeline}</p></div>
        <div class="section"><h2>Risk Mitigation</h2><ul>{risk_items}</ul></div>
    </body>
    </html>
    """


def _render_proposal_html(vendor_response: Dict[str, Any], timestamp: str, theme: dict[str, str]) -> str:
    accent = theme.get("accent", "#3b82f6")
    card = theme.get("card", "#eff6ff")
    muted = theme.get("muted", "#f3f4f6")
    border = theme.get("border", "#dbe3ef")

    proposal_sections = vendor_response.get("sections") if isinstance(vendor_response.get("sections"), dict) else None
    proposal_title = str(vendor_response.get("title") or vendor_response.get("proposal_title") or "Vendor Proposal")
    vendor_name = str(vendor_response.get("vendorName") or vendor_response.get("vendor_name") or "Vendor")
    contract_title = str(vendor_response.get("contractTitle") or vendor_response.get("contract_title") or "Proposal")
    total_price = str(vendor_response.get("totalPrice") or vendor_response.get("total_price") or "TBD")
    timeline = str(vendor_response.get("timeline") or vendor_response.get("timeline_summary") or "TBD")
    executive_summary = escape(str(vendor_response.get("executiveSummary") or vendor_response.get("executive_summary") or ""))
    section_labels = {
        "vendor_information": "Vendor Information",
        "company_profile": "Company Profile",
        "project_understanding": "Project Understanding",
        "proposed_solution": "Proposed Solution",
        "deliverables": "Deliverables",
        "project_timeline": "Project Timeline",
        "cost_proposal": "Cost Proposal",
        "team_details": "Team Details",
        "past_experience": "Past Experience",
        "risk_management": "Risk Management",
        "support_maintenance": "Support & Maintenance",
        "graphs_visualizations": "Graphs / Visualizations",
        "terms_conditions": "Terms & Conditions",
        "document_uploads": "Document Uploads",
        "final_declaration": "Final Declaration",
    }

    sections_html = ""
    for index, (key, label) in enumerate(section_labels.items(), start=1):
        body = escape(str(proposal_sections.get(key, "") if proposal_sections else "")).replace("\n", "<br>")
        if not body.strip():
            body = "<em>Section content not provided in the uploaded proposal.</em>"
        sections_html += f"""
        <article class="proposal-section">
            <div class="section-heading">
                <div class="section-index">{index:02d}</div>
                <div>
                    <h2>{escape(label)}</h2>
                    <div class="section-meta">Aligned to {escape(contract_title)}</div>
                </div>
            </div>
            <div class="section-body">{body}</div>
            <div class="section-note"><strong>Source fidelity:</strong> This section preserves the uploaded proposal structure and is intended to mirror the source document as closely as possible.</div>
        </article>
        """

    return f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{escape(proposal_title)}</title>
        <style>
            @page {{ size: A4; margin: 18mm; }}
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1f2937; line-height: 1.6; background: #fff; padding: 40px; }}
            @media print {{ body {{ padding: 20px; }} }}
            .header {{ border-bottom: 3px solid {accent}; padding-bottom: 16px; margin-bottom: 32px; }}
            h1 {{ font-size: 28px; font-weight: bold; color: #1f2937; margin-bottom: 8px; }}
            .timestamp {{ font-size: 12px; color: #6b7280; }}
            h2 {{ font-size: 18px; font-weight: 600; color: #1f2937; margin-top: 28px; margin-bottom: 12px; border-left: 4px solid {accent}; padding-left: 12px; }}
            p {{ margin-bottom: 12px; font-size: 14px; }}
            ul, ol {{ margin-left: 24px; margin-bottom: 12px; font-size: 14px; }}
            li {{ margin-bottom: 6px; }}
            .proposal-cover {{ page-break-after: always; min-height: 90vh; }}
            .proposal-meta-grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin: 24px 0; }}
            .meta-card {{ border: 1px solid {border}; border-radius: 16px; padding: 16px; background: {card}; }}
            .proposal-section {{ page-break-after: always; min-height: 235mm; border: 1px solid {border}; border-radius: 20px; padding: 24px; margin-bottom: 0; }}
            .section-heading {{ display: flex; gap: 16px; align-items: flex-start; margin-bottom: 18px; }}
            .section-index {{ width: 44px; height: 44px; border-radius: 999px; background: {accent}; color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }}
            .section-body {{ white-space: pre-wrap; font-size: 14px; }}
            .section-note {{ margin-top: 18px; padding: 14px 16px; background: {card}; border-left: 4px solid {accent}; border-radius: 10px; font-size: 13px; }}
        </style>
    </head>
    <body>
        <div class="proposal-cover">
            <div class="header">
                <h1>{escape(proposal_title)}</h1>
                <div class="timestamp">Generated: {timestamp}</div>
            </div>
            <div class="section"><h2>Proposal Overview</h2><p><strong>Vendor:</strong> {escape(vendor_name)}</p><p><strong>Contract:</strong> {escape(contract_title)}</p></div>
            <div class="proposal-meta-grid">
                <div class="meta-card"><strong>Executive Summary</strong><p>{executive_summary or "This proposal is aligned to the uploaded source document and rendered with PDFShift."}</p></div>
                <div class="meta-card"><strong>Timeline</strong><p>{escape(timeline)}</p></div>
            </div>
            <div class="proposal-meta-grid">
                <div class="meta-card"><strong>Commercial Summary</strong><p>{escape(str(vendor_response.get('executiveSummary') or vendor_response.get('executive_summary') or proposal_title))}</p></div>
                <div class="meta-card"><strong>Price</strong><p>{escape(total_price)}</p></div>
            </div>
        </div>
        <div class="section"><h2>Table of Contents</h2><p>This PDF is rendered directly from the uploaded proposal sections and is intended to keep the source structure intact while expanding the document for review and submission.</p><ol>{''.join(f'<li>{escape(label)}</li>' for label in section_labels.values())}</ol></div>
        {sections_html}
    </body>
    </html>
    """


def render_vendor_response_to_html(vendor_response: Dict[str, Any], options: Dict[str, Any] | None = None) -> str:
    """Render a vendor response or proposal payload to HTML for PDFShift."""

    template_name = None
    if isinstance(options, dict):
        template_name = options.get("template")
    if not template_name and isinstance(vendor_response.get("options"), dict):
        template_name = vendor_response["options"].get("template")

    theme = _resolve_template_theme(str(template_name).lower() if template_name else None, options)
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    if isinstance(vendor_response.get("sections"), dict):
        return _render_proposal_html(vendor_response, timestamp, theme)

    return _render_analysis_html(vendor_response, timestamp, theme)
