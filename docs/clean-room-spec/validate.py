#!/usr/bin/env python3
"""Dependency-free structural checks for the canonical clean-room package."""
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

link_re = re.compile(r"(?<!!)\[[^]]*\]\(([^)]+)\)")
for p in mds:
    for target in link_re.findall(p.read_text()):
        target = target.strip()
        if re.match(r"^[a-z]+://", target) or target.startswith("mailto:"):
            continue
        if target.startswith("#"):
            if target[1:] not in anchors(p): errors.append(f"{p.name}: missing anchor {target}")
            continue
        filepart, _, anchor = target.partition("#")
        q = (p.parent / filepart).resolve()
        if not q.exists(): errors.append(f"{p.name}: missing link target {target}")
        elif anchor and q.suffix.lower() == ".md" and anchor not in anchors(q):
            errors.append(f"{p.name}: missing anchor {target}")

all_text = "\n".join(p.read_text() for p in mds)
required = {
 "labels":"## Status labels", "provenance":"## Authoritative inputs", "non-goals":"## Explicit non-goals",
 "modules":"## Module boundaries", "roles":"## System roles", "data":"# Entity and Data Model",
 "holds":"## ReservationHold state machine", "orders":"## Order state machine", "tickets":"## Ticket and CheckIn state machines",
 "payments":"## PaymentAttempt", "refunds":"## Refund", "disputes":"## Dispute",
 "gift cards":"## GiftCard and StoredValueEntry", "memberships":"## MembershipContract", "ledger":"## Ledger and reconciliation",
 "events":"## Event catalog", "webhooks":"## Provider webhook ingress", "API":"## API surface",
 "security":"## Security, PCI, and privacy boundaries", "tests":"## Test strategy",
 "migration":"## Migration and parallel run", "roadmap":"## Phased roadmap and measurable exit criteria",
 "invariants":"# Cross-Document Invariants", "unknowns":"## Highest-risk unknowns", "questions":"## Owner-question register"
}
for topic, needle in required.items():
    if needle not in all_text: errors.append(f"missing topic: {topic}")

prd_lines = (ROOT / "product-requirements.md").read_text().splitlines()
req_ids = []
for n, line in enumerate(prd_lines, 1):
    m = re.match(r"\| ((?:PR|QR|NG)-\d{3}) ", line)
    if not m: continue
    req_ids.append(m.group(1))
    labels = sum(line.count(x) for x in ("CONFIRMED", "INFERRED", "UNVERIFIED"))
    if labels != 1: errors.append(f"product-requirements.md:{n}: label count {labels}")
    if "OQ-" in line and "UNVERIFIED" not in line:
        errors.append(f"product-requirements.md:{n}: OQ assumption not UNVERIFIED")
for x in set(req_ids):
    if req_ids.count(x) != 1: errors.append(f"duplicate requirement {x}")

reg = (ROOT / "unknowns-and-owner-questions.md").read_text()
ids = set(re.findall(r"\| (OQ-\d{3}) \|", reg))
refs = set(re.findall(r"OQ-\d{3}", all_text))
for x in sorted(refs - ids): errors.append(f"undefined owner question {x}")
for x in sorted(ids):
    if all_text.replace(reg, "").count(x) == 0: errors.append(f"unreferenced owner question {x}")

canonical = ["Tenant","Venue","Product","Session","ReservationHold","Order","Ticket","CheckIn","Payment","PaymentAttempt","Refund","Dispute","GiftCard","StoredValueEntry","MembershipContract","Journal","OutboxEvent"]
for x in canonical:
    if x not in all_text: errors.append(f"missing canonical name {x}")
catalog = (ROOT / "interfaces-and-security.md").read_text()
defined_events = set(re.findall(r"`([a-z_]+(?:\.[a-z_]+)+\.v\d+)`", catalog))
for p in mds:
    for ev in set(re.findall(r"`([a-z_]+(?:\.[a-z_]+)+\.v\d+)`", p.read_text())):
        if ev not in defined_events: errors.append(f"{p.name}: event absent from catalog: {ev}")

inv_nums = [int(x) for x in re.findall(r"^(\d+)\. \*\*", (ROOT / "invariants.md").read_text(), re.M)]
if inv_nums != list(range(1, len(inv_nums)+1)): errors.append("invariant numbering not consecutive")

banned = ["Dig n Zone", "Dig In Cafe", "$0.99", "3.50%", "11.75%", "grantsclaude1", "client_secret", "api_key=", "splashradio", "Yellow Dog", "Resend"]
for p in mds:
    for term in banned:
        if term.lower() in p.read_text().lower(): errors.append(f"{p.name}: prohibited/non-authoritative term: {term}")

print(f"inventory: {len(mds)} markdown files + validate.py")
for p in mds: print(f"  {p.name}")
print(f"links/anchors: checked {sum(len(link_re.findall(p.read_text())) for p in mds)}")
print(f"topics: {len(required)} required topics present")
print(f"owner questions: {len(ids)} defined and resolved")
print(f"requirements: {len(req_ids)} uniquely labeled rows")
print(f"canonical names: {len(canonical)}; event references checked")
print(f"invariants: {len(inv_nums)} consecutive")
print(f"content scan: {len(banned)} prohibited/private/non-authoritative patterns")
if errors:
    print("FAIL")
    for e in errors: print(" -", e)
    sys.exit(1)
print("PASS")
