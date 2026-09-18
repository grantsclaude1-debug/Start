#!/usr/bin/env python3
"""Dependency-free structural checks for this specification package."""
from pathlib import Path
import re, sys

ROOT = Path(__file__).resolve().parent
mds = sorted(ROOT.glob("*.md"))
errors = []

def slug(s):
    s = re.sub(r"<[^>]+>", "", s).strip().lower()
    s = re.sub(r"[^\w\- ]", "", s)
    return re.sub(r"[ _]+", "-", s)

def anchors(path):
    out, seen = set(), {}
    for line in path.read_text().splitlines():
        m = re.match(r"^#{1,6}\s+(.+?)\s*$", line)
        if m:
            base = slug(m.group(1)); n = seen.get(base, 0); seen[base] = n + 1
            out.add(base if n == 0 else f"{base}-{n}")
    return out

# Relative links and anchors.
link_re = re.compile(r"(?<!!)\[[^]]*\]\(([^)]+)\)")
for p in mds:
    for target in link_re.findall(p.read_text()):
        target = target.strip()
        if re.match(r"^[a-z]+://", target) or target.startswith(("mailto:", "#")):
            if target.startswith("#") and target[1:] not in anchors(p): errors.append(f"{p.name}: missing anchor {target}")
            continue
        filepart, _, anchor = target.partition("#")
        q = (p.parent / filepart).resolve()
        if not q.exists(): errors.append(f"{p.name}: missing link target {target}")
        elif anchor and q.suffix.lower() == ".md" and anchor not in anchors(q): errors.append(f"{p.name}: missing anchor {target}")

all_text = "\n".join(p.read_text() for p in mds)
# Required topic presence.
required = {
 "status conventions":"CONFIRMED", "non-goals":"Explicit non-goals", "modules":"Module boundaries",
 "roles":"System roles", "data model":"Entity and Data Model", "holds":"ReservationHold state machine",
 "order lifecycle":"Order state machine", "tickets/check-in":"Ticket and CheckIn state machines",
 "payments":"PaymentAttempt", "ledger":"Ledger and reconciliation", "refunds":"## Refund",
 "disputes":"## Dispute", "gift cards":"GiftCard and StoredValueEntry", "memberships":"MembershipContract",
 "events":"Event catalog", "security/PCI/privacy":"Security, PCI, and privacy", "API":"API surface",
 "tests":"Test strategy", "migration":"Migration and parallel run", "roadmap":"Phased roadmap",
 "invariants":"Cross-Document Invariants", "unknowns":"Highest-risk unknowns", "owner questions":"Owner-question register",
 "plain-language reporting":"Report experience", "offline operations":"Offline Venue Operations Architecture",
 "temporary private gate":"Temporary Private-Build Passcode Gate",
 "future authentication/Resend":"Later authentication phase", "Yellow Dog adapter":"Yellow Dog inventory adapter",
 "Yellow Dog capabilities":"YellowDogCapabilities", "Yellow Dog rate limit":"2 requests/second per user",
 "Splash Radio adapter":"Splash Radio Venue-Audio Adapter"
}
for topic, needle in required.items():
    if needle not in all_text: errors.append(f"missing topic: {topic}")

# Every product requirement row must have exactly one evidence label; OQ rows must be UNVERIFIED.
prd = (ROOT / "product-requirements.md").read_text().splitlines()
for n, line in enumerate(prd, 1):
    if re.match(r"\| (PR|QR|NG)-\d{3} ", line):
        labels = sum(line.count(x) for x in ("CONFIRMED", "INFERRED", "UNVERIFIED"))
        if labels != 1: errors.append(f"product-requirements.md:{n}: label count {labels}")
        if "OQ-" in line and "UNVERIFIED" not in line: errors.append(f"product-requirements.md:{n}: OQ assumption not UNVERIFIED")

# OQ references must resolve; every register ID must be referenced outside the register.
reg = (ROOT / "unknowns-and-owner-questions.md").read_text()
id_list = re.findall(r"^\| (OQ-\d{3}) \|", reg, re.M)
ids = set(id_list)
for x in sorted(ids):
    if id_list.count(x) != 1: errors.append(f"duplicate owner question {x}")
refs = set(re.findall(r"OQ-\d{3}", all_text))
for x in sorted(refs - ids): errors.append(f"undefined owner question {x}")
for x in sorted(ids):
    if all_text.replace(reg, "").count(x) == 0: errors.append(f"unreferenced owner question {x}")

# Canonical names/statuses and event references.
canonical = ["Tenant","Venue","ReservationHold","Order","Ticket","CheckIn","Payment","PaymentAttempt","Refund","Dispute","GiftCard","StoredValueEntry","MembershipContract","Journal","OutboxEvent","ExportJob","OfflineCommand","OfflineCapacityBudget","OfflineStockBudget","IntegrationConnection","GateConfig","GateSession","GateAttempt","InventoryItem","YellowDogCapabilitySnapshot","InventorySaleCommand","VenueAudioConnection","AudioSchedule","AudioCommand"]
for x in canonical:
    if x not in all_text: errors.append(f"missing canonical entity {x}")
catalog = (ROOT / "interfaces-and-security.md").read_text()
defined_events = set(re.findall(r"`([a-z_]+(?:\.[a-z_]+)+\.v\d+)`", catalog))
for p in mds:
    for ev in set(re.findall(r"`([a-z_]+(?:\.[a-z_]+)+\.v\d+)`", p.read_text())):
        if ev not in defined_events: errors.append(f"{p.name}: event absent from catalog: {ev}")

# Duplicate requirement IDs and invariant numbering.
req_ids = re.findall(r"^\| ((?:PR|QR|NG)-\d{3}) \|", (ROOT / "product-requirements.md").read_text(), re.M)
for x in sorted(set(req_ids)):
    if req_ids.count(x) != 1: errors.append(f"duplicate requirement ID {x}")
inv_nums = [int(x) for x in re.findall(r"^(\d+)\. \*\*", (ROOT / "invariants.md").read_text(), re.M)]
if inv_nums != list(range(1, len(inv_nums) + 1)): errors.append("invariant numbering is not consecutive")

# Sensitive/proprietary/account-specific content scan (validator itself excluded).
banned = ["Dig n Zone", "Dig In Cafe", "$0.99", "3.50%", "11.75%", "grantsclaude1", "client_secret", "api_key="]
for p in mds:
    for term in banned:
        if term.lower() in p.read_text().lower(): errors.append(f"{p.name}: prohibited/private term: {term}")

print(f"inventory: {len(mds)} markdown files + validate.py")
for p in mds: print(f"  {p.relative_to(ROOT)}")
print(f"links/anchors: checked {sum(len(link_re.findall(p.read_text())) for p in mds)}")
print(f"topics: {len(required)} required topics present")
print(f"owner questions: {len(ids)} defined; OQ requirement labels checked")
print(f"canonical entities: {len(canonical)} present; canonical event references checked")
print(f"IDs: {len(req_ids)} unique requirements; {len(inv_nums)} consecutive invariants")
print(f"content scan: {len(banned)} prohibited/private patterns")
if errors:
    print("FAIL")
    for e in errors: print(" -", e)
    sys.exit(1)
print("PASS")
