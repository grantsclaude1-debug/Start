# Splash Radio Venue-Audio Adapter

[Back to index](README.md) · [Integration architecture](operations-integrations-and-reporting.md#integration-architecture) · [Offline operations](offline-operations.md) · [Owner questions](unknowns-and-owner-questions.md)

## Evidence and boundary

| Status | Fact or decision |
|---|---|
| CONFIRMED | The owner requires a Splash Radio integration, but no login or private contract is available. |
| CONFIRMED | The strongest public match is Splash Radio, LLC at `splashradio.net`, which publicly describes a managed in-venue radio service for amusement/entertainment venues: programmed music, branded/DJ voiceovers, scheduled promotional or safety messages, and a commercial player connected to venue internet/audio equipment. |
| CONFIRMED | Public pages describe online control and multi-location support, but no public REST API, webhook contract, authentication scheme, rate limits, player protocol, or supported automation commands were evidenced in the reviewed official material. |
| CONFIRMED | Public licensing language is ambiguous for admission-charging venues: general commercial licensing claims coexist with language indicating that admission-fee entertainment venues may need direct licensing. |
| INFERRED | Build a vendor-neutral `VenueAudioAdapter` seam, mock/manual workflow, device-health projection, and audit model now; keep the production adapter disabled until vendor identity, contract, licensing, credentials, and supported control surface are confirmed. |
| UNVERIFIED | The launch venue actually uses Splash Radio, LLC rather than a similarly named service; confirm under OQ-027 before production connection. |

Official public sources reviewed 2026-09-18:

- <https://www.splashradio.net/>
- <https://www.splashradio.net/water-park-radio/>
- <https://www.splashradio.net/industries/>
- <https://www.splashradio.net/about-us/>
- <https://www.splashradio.net/faqs/>

This specification does not copy audio, playlists, voiceovers, branding, private schedules, credentials, or vendor protocols.

## Domain ownership

The adapter does not own ticketing, safety decisions, emergency communication, building audio, or music rights. It maps approved venue-audio intent to a contracted vendor capability and records evidence.

Canonical records:

```text
VenueAudioConnection(id, tenant_id, venue_id, provider_kind, mode,
  status, capability_snapshot, auth_secret_ref?, contract_ref?,
  licensing_status, last_health_at, version)

AudioZone(id, connection_id, local_zone_key, external_zone_ref?,
  display_name, hardware_endpoint_ref?, status)

AudioContentRef(id, connection_id, external_content_ref?, kind,
  title, content_hash?, rights_metadata, approval_status)

AudioSchedule(id, zone_id, local_schedule_key, external_schedule_ref?,
  timezone, entries, revision, sync_status, effective_interval)

AudioCommand(id, connection_id, zone_id, type, payload,
  business_idempotency_key, requested_by, status, external_ref?, result)

AudioHealthSnapshot(id, connection_id, zone_id?, player_ref?,
  observed_at, connectivity, playback_state, content_revision?, detail_code)

AudioDeliveryEvent(id, connection_id, external_event_id?, event_type,
  occurred_at, received_at, payload_hash, normalized_data)
```

Emergency announcements remain in the venue’s approved life-safety process. The audio adapter may play ordinary safety reminders only when the owner has approved the exact content and the vendor contract supports it; it must never imply fire-alarm, evacuation, or emergency-alert certification.

## Adapter contract

```ts
type Capability =
  | "READ_HEALTH"
  | "READ_NOW_PLAYING"
  | "LIST_ZONES"
  | "LIST_CONTENT"
  | "PUSH_CONTENT_METADATA"
  | "READ_SCHEDULE"
  | "WRITE_SCHEDULE"
  | "PLAY"
  | "PAUSE"
  | "SKIP"
  | "SET_CHANNEL"
  | "SET_VOLUME"
  | "PLAY_ANNOUNCEMENT"
  | "RECEIVE_EVENTS";

type AuthConfig =
  | { kind: "NONE_MANUAL" }
  | { kind: "API_KEY"; secretRef: string }
  | { kind: "OAUTH2_CLIENT"; secretRef: string; tokenUrl: string; scopes: string[] }
  | { kind: "MUTUAL_TLS"; certificateRef: string }
  | { kind: "VENDOR_AGENT"; agentRef: string };

interface VenueAudioAdapter {
  discoverCapabilities(ctx: AdapterContext): Promise<CapabilitySnapshot>;
  health(ctx: AdapterContext): Promise<AudioHealthSnapshot[]>;
  listZones(ctx: AdapterContext, cursor?: string): Promise<Page<AudioZone>>;
  listContent(ctx: AdapterContext, cursor?: string): Promise<Page<AudioContentRef>>;
  readSchedule(ctx: AdapterContext, zone: string): Promise<AudioSchedule>;
  syncSchedule(ctx: AdapterContext, desired: AudioSchedule, key: string): Promise<CommandResult>;
  execute(ctx: AdapterContext, command: AudioCommand): Promise<CommandResult>;
  parseWebhook?(rawBody: Uint8Array, headers: Headers): Promise<VerifiedAudioEvent>;
  reconcile(ctx: AdapterContext, checkpoint?: string): Promise<ReconcileResult>;
}
```

Every method unavailable in the negotiated `CapabilitySnapshot` returns `UNSUPPORTED_CAPABILITY`; it never guesses an endpoint or simulates success. `ManualVenueAudioAdapter` supports configuration, runbook tasks, operator acknowledgement, and health notes only; it performs no network control.

## Configuration schema

```yaml
providerKind: splash_radio_llc | other_venue_audio | manual
mode: disabled | manual | api | vendor_agent
venueId: <opaque venue id>
timezone: <IANA zone>
auth: <AuthConfig using secret references only>
capabilityAllowlist: []
zones:
  - localKey: lobby
    externalRef: null
    hardwareEndpointRef: null
licensing:
  status: unknown | pending_review | approved | expired | blocked
  territory: null
  admissionVenueCovered: null
  contractRef: null
controls:
  allowRemotePlayback: false
  allowAnnouncement: false
  maxVolumePercent: null
  changeApproval: owner
health:
  pollSeconds: null
  staleAfterSeconds: null
webhook:
  enabled: false
  secretRef: null
```

Production startup fails closed when `mode != disabled|manual` and identity, contract/licensing approval, authentication, capabilities, zone mappings, or health policy are unresolved.

## Commands, events, and errors

Supported canonical command types are `SYNC_SCHEDULE`, `SET_CHANNEL`, `PLAY`, `PAUSE`, `SKIP`, `SET_VOLUME`, and `PLAY_ANNOUNCEMENT`. Enable each independently. High-impact `PLAY_ANNOUNCEMENT` and volume changes require Owner/VenueManager approval and an immutable content/version reference.

Canonical events:

```text
audio.connection.health_changed.v1
audio.player.status_changed.v1
audio.schedule.sync_requested.v1
audio.schedule.synced.v1
audio.schedule.sync_failed.v1
audio.command.requested.v1
audio.command.succeeded.v1
audio.command.failed.v1
audio.licensing.status_changed.v1
```

Stable errors:

```text
AUDIO_PROVIDER_UNCONFIRMED
AUDIO_CONTRACT_REQUIRED
AUDIO_LICENSING_BLOCKED
AUDIO_AUTH_FAILED
AUDIO_UNSUPPORTED_CAPABILITY
AUDIO_MAPPING_MISSING
AUDIO_RATE_LIMITED
AUDIO_DEPENDENCY_UNAVAILABLE
AUDIO_PLAYER_OFFLINE
AUDIO_COMMAND_CONFLICT
AUDIO_RESPONSE_INVALID
```

Commands require a business idempotency key. Persist command intent before external mutation, reuse the same vendor idempotency facility when documented, and otherwise retrieve/reconcile before retrying an ambiguous timeout. Rate limits and `Retry-After` are provider contract data under OQ-027; until known, use one serialized worker per connection with conservative backoff and no repeated high-impact command after an unknown result.

## Schedule and content synchronization

- Store venue intent independently from vendor representation: zone, IANA timezone, local wall time, recurrence, effective dates, priority, approved content reference, and revision.
- Compile a provider request only through a versioned mapping. Preserve the exact request hash, provider response/reference, and last verified schedule snapshot.
- Treat vendor-managed music programming as external content metadata; do not copy or ingest audio.
- Resolve daylight-saving gaps/overlaps explicitly. A schedule update is atomic by local revision; partial vendor application opens an exception.
- Safety/promotion voiceovers require approved text/audio reference, purpose, validity window, rights/consent metadata, and owner/manager audit.
- No ticket sale, check-in, payment, or emergency operation may wait synchronously on audio schedule/content sync.

## Health, hardware, and degraded operation

The adapter projects connectivity; it does not promise playback. A player may be `ONLINE_PLAYING`, `ONLINE_SILENT`, `OFFLINE_CACHED`, `OFFLINE_UNKNOWN`, or `FAULTED` only when the provider/device contract supports those observations.

Public descriptions indicate a commercial player connected to venue internet and the sound system, but hardware model, local cache, ports, remote-control protocol, boot behavior, UPS draw, and failover are **UNVERIFIED (OQ-027)**. Record hardware serial/model/network zone only after contract approval; never scan or probe an unknown device.

During WAN or power disruption:

- Ticketing/check-in continuity does not depend on Splash Radio.
- Existing player playback may continue only if the contracted player supports caching and remains powered; the platform reports `OFFLINE_UNKNOWN` unless verified telemetry exists.
- Queue no remote commands whose late execution could be unsafe or surprising. Expire `PLAY_ANNOUNCEMENT`, `SET_VOLUME`, `SKIP`, and channel changes at a short approved deadline.
- Do not substitute this adapter for emergency paging. Venue staff use the approved life-safety/manual announcement process.
- Put player/network/audio equipment on UPS only after measured load and venue approval; shedding background audio must not reduce life-safety power reserve.

## Security, privacy, licensing, and audit

- Secrets live only in the secret manager. Events/logs contain secret references, not values.
- Allow-list vendor hosts and validate TLS. Webhooks remain disabled until the vendor documents signing and replay controls.
- Send no customer, ticket, payment, waiver, staff, or audience-profile data. The minimum schedule/health contract contains venue/zone/content identifiers only.
- Audit capability changes, connection enable/disable, schedule versions, content approvals, commands, results, operator, reason, correlation ID, licensing status, and manual acknowledgements.
- Production enablement requires written confirmation that public-performance rights cover the admission-charging venue, territory, music, voiceovers, and all intended zones. The software stores evidence/status; it does not determine rights.

## Test doubles and acceptance tests

Provide `FakeVenueAudioAdapter` with deterministic capabilities, paginated zones/content, health transitions, delayed/duplicate/out-of-order events, rate limits, ambiguous timeouts, partial schedule application, offline player, and licensing rejection.

1. **AT-AUDIO-001:** With provider identity or contract unconfirmed, enabling API/vendor-agent mode fails with `AUDIO_PROVIDER_UNCONFIRMED` or `AUDIO_CONTRACT_REQUIRED`; manual mode performs no external call.
2. **AT-AUDIO-002:** An unadvertised command returns `AUDIO_UNSUPPORTED_CAPABILITY` before network activity.
3. **AT-AUDIO-003:** Duplicate identical command keys create one durable effect; same key/different payload returns conflict.
4. **AT-AUDIO-004:** Ambiguous timeout is reconciled before retry; a high-impact command is never blindly repeated.
5. **AT-AUDIO-005:** Schedule round-trip preserves zone, timezone intent, recurrence, effective dates, priority, and revision; partial application opens an exception.
6. **AT-AUDIO-006:** Webhook events fail closed until signing is configured; valid duplicates produce one normalized event effect.
7. **AT-AUDIO-007:** Licensing status other than `approved` blocks content/schedule/announcement mutation.
8. **AT-AUDIO-008:** Customer/payment/waiver fields are rejected from adapter payloads and absent from logs.
9. **AT-AUDIO-009:** WAN loss never blocks ticket sale/check-in; stale health becomes visible and expiring control commands do not execute after recovery.
10. **AT-AUDIO-010:** A total player/venue power loss is reported honestly; no “playing” state is inferred without telemetry.
11. **AT-AUDIO-011:** Vendor rate limits pause the serialized worker, honor documented retry timing, and surface backlog/age.
12. **AT-AUDIO-012:** Audit evidence links every configuration, schedule, content approval, command, result, and manual action without storing secrets or audio.

Production exit gate: OQ-027 resolved, licensing approved, exact capabilities/auth/rate limits/hardware verified against the contract, test double suite passes, one non-production vendor-certified end-to-end test passes under separate authorization, rollback/manual runbook approved, and the adapter remains noncritical to ticketing and life safety.
