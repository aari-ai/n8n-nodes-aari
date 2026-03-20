"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Aari = void 0;
const crypto_1 = require("crypto");
const n8n_workflow_1 = require("n8n-workflow");
// ---------------------------------------------------------------------------
// Fail-closed types — same list as OpenClaw plugin
// ---------------------------------------------------------------------------
const FAIL_CLOSED_TYPES = new Set([
    "db.delete", "db.drop", "db.schema", "db.execute",
    "payment.charge", "payment.refund",
    "keys.delete", "keys.rotate",
    "filesystem.rm", "filesystem.write",
    "code.execute",
    "unknown.action",
]);
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function localDecision(actionType) {
    return {
        action_id: (0, crypto_1.randomUUID)(),
        decision: FAIL_CLOSED_TYPES.has(actionType) ? "BLOCK" : "ALLOW",
        aari_score: 0,
        policy_hits: [],
        message: "AARI server unreachable — fail-closed decision applied locally",
        degraded: true,
    };
}
async function callGate(server, headers, payload, timeoutMs, actionType) {
    try {
        const res = await fetch(`${server}/gate`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
            if (res.status === 429) {
                // Plan limit exceeded — same handling as OpenClaw
                return {
                    action_id: (0, crypto_1.randomUUID)(),
                    decision: "BLOCK",
                    aari_score: 100,
                    policy_hits: ["PLAN_LIMIT_EXCEEDED"],
                    message: "AARI plan limit exceeded",
                };
            }
            return localDecision(actionType);
        }
        return (await res.json());
    }
    catch {
        return localDecision(actionType);
    }
}
async function callComplete(server, headers, actionId, outcome, error, timeoutMs = 5000) {
    const body = { outcome, ...(error ? { error: error.slice(0, 2000) } : {}) };
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            await fetch(`${server}/actions/${actionId}/complete`, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(timeoutMs),
            });
            return;
        }
        catch {
            if (attempt === 2) {
                // 3rd attempt failed — swallow silently, never block the workflow
            }
        }
    }
}
// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------
class Aari {
    constructor() {
        this.description = {
            displayName: "AARI",
            name: "aari",
            icon: "file:aari.svg",
            group: ["transform"],
            version: 1,
            subtitle: '={{$parameter["operation"]}}',
            description: "AARI Execution Firewall — risk-score and gate actions before they run",
            defaults: { name: "AARI" },
            inputs: ["main"],
            // Gate has 2 outputs: [0] Allowed, [1] Blocked
            // Complete has 1 output
            outputs: ["main", "main"],
            outputNames: ["Allowed / Warn", "Blocked"],
            credentials: [
                {
                    name: "aariApi",
                    required: true,
                },
            ],
            properties: [
                // -----------------------------------------------------------------------
                // Operation selector
                // -----------------------------------------------------------------------
                {
                    displayName: "Operation",
                    name: "operation",
                    type: "options",
                    noDataExpression: true,
                    options: [
                        {
                            name: "Gate",
                            value: "gate",
                            description: "Check an action before it runs. Outputs to Allowed or Blocked based on risk score.",
                            action: "Gate an action",
                        },
                        {
                            name: "Complete",
                            value: "complete",
                            description: "Report the outcome of an action after it ran. Completes the AARI audit trail.",
                            action: "Complete an action",
                        },
                    ],
                    default: "gate",
                },
                // -----------------------------------------------------------------------
                // Gate parameters
                // -----------------------------------------------------------------------
                {
                    displayName: "Action Type",
                    name: "actionType",
                    type: "string",
                    default: "workflow.side_effect",
                    placeholder: "e.g. db.delete, email.send, http.post",
                    description: "AARI action type. Use specific types for accurate risk scoring (e.g. db.delete scores higher than workflow.side_effect).",
                    required: true,
                    displayOptions: { show: { operation: ["gate"] } },
                },
                {
                    displayName: "Resource",
                    name: "resource",
                    type: "string",
                    default: "",
                    placeholder: "e.g. postgres:prod:users, https://api.example.com, /etc/config",
                    description: "The resource being acted on. Used for path-based risk modifiers.",
                    required: true,
                    displayOptions: { show: { operation: ["gate"] } },
                },
                {
                    displayName: "Mode",
                    name: "mode",
                    type: "options",
                    options: [
                        {
                            name: "Enforced — Block High-Risk Actions",
                            value: "enforced",
                        },
                        {
                            name: "Advisory — Score Only, Never Block",
                            value: "advisory",
                        },
                    ],
                    default: "enforced",
                    description: "Enforced: BLOCK decisions stop the workflow. Advisory: decisions are logged only.",
                    displayOptions: { show: { operation: ["gate"] } },
                },
                {
                    displayName: "Environment",
                    name: "environment",
                    type: "options",
                    options: [
                        { name: "Production (+15 risk)", value: "prod" },
                        { name: "Staging", value: "staging" },
                        { name: "Development", value: "dev" },
                    ],
                    default: "prod",
                    displayOptions: { show: { operation: ["gate"] } },
                },
                {
                    displayName: "Agent ID",
                    name: "agentId",
                    type: "string",
                    default: "n8n-agent",
                    description: "Identifies this workflow in the AARI dashboard.",
                    displayOptions: { show: { operation: ["gate"] } },
                },
                {
                    displayName: "Parameters (JSON)",
                    name: "parameters",
                    type: "json",
                    default: "{}",
                    description: "Action parameters. Include amount_cents for payment risk scoring.",
                    displayOptions: { show: { operation: ["gate"] } },
                },
                {
                    displayName: "Run ID",
                    name: "runId",
                    type: "string",
                    default: "",
                    placeholder: "Leave empty to auto-generate per workflow execution",
                    description: "Groups related actions. Set to {{ $execution.id }} to link all nodes in one workflow run.",
                    displayOptions: { show: { operation: ["gate"] } },
                },
                // -----------------------------------------------------------------------
                // Complete parameters
                // -----------------------------------------------------------------------
                {
                    displayName: "Action ID",
                    name: "actionId",
                    type: "string",
                    default: "={{ $json.aariActionId }}",
                    description: "The action_id from the AARI Gate node output.",
                    required: true,
                    displayOptions: { show: { operation: ["complete"] } },
                },
                {
                    displayName: "Outcome",
                    name: "outcome",
                    type: "options",
                    options: [
                        { name: "Success", value: "SUCCESS" },
                        { name: "Failure", value: "FAILURE" },
                        { name: "Skipped", value: "SKIPPED" },
                    ],
                    default: "SUCCESS",
                    displayOptions: { show: { operation: ["complete"] } },
                },
                {
                    displayName: "Error Message",
                    name: "errorMessage",
                    type: "string",
                    default: "",
                    description: "Error details if outcome is Failure. Truncated to 2000 chars.",
                    displayOptions: {
                        show: { operation: ["complete"], outcome: ["FAILURE"] },
                    },
                },
            ],
        };
    }
    // -------------------------------------------------------------------------
    // Execute
    // -------------------------------------------------------------------------
    async execute() {
        const items = this.getInputData();
        const operation = this.getNodeParameter("operation", 0);
        const credentials = (await this.getCredentials("aariApi"));
        const server = credentials.server.replace(/\/$/, "");
        const headers = {
            "Content-Type": "application/json",
            "X-API-Key": credentials.apiKey,
        };
        const timeoutMs = 5000;
        // Gate has 2 outputs; Complete has 1 but we still return 2 arrays (second empty)
        const allowedItems = [];
        const blockedItems = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            // -------------------------------------------------------------------
            // GATE
            // -------------------------------------------------------------------
            if (operation === "gate") {
                const actionType = this.getNodeParameter("actionType", i);
                const resource = this.getNodeParameter("resource", i);
                const mode = this.getNodeParameter("mode", i);
                const environment = this.getNodeParameter("environment", i);
                const agentId = this.getNodeParameter("agentId", i);
                const runIdParam = this.getNodeParameter("runId", i);
                const parametersRaw = this.getNodeParameter("parameters", i);
                let parameters = {};
                try {
                    parameters = typeof parametersRaw === "string"
                        ? JSON.parse(parametersRaw)
                        : parametersRaw;
                }
                catch {
                    // invalid JSON — use empty
                }
                const runId = runIdParam?.trim() || (0, crypto_1.randomUUID)();
                const gateResp = await callGate(server, headers, {
                    agent_id: agentId,
                    run_id: runId,
                    action_type: actionType,
                    resource,
                    parameters,
                    environment,
                    mode,
                }, timeoutMs, actionType);
                if (gateResp.degraded) {
                    this.logger.warn(`[AARI] Degraded mode — Redis unavailable, Postgres fallback active (action=${actionType})`);
                }
                if (gateResp.decision === "WARN") {
                    this.logger.warn(`[AARI] WARN — ${actionType} score=${gateResp.aari_score} policies=${gateResp.policy_hits.join(", ") || "none"}`);
                }
                if (gateResp.decision === "BLOCK" && mode === "enforced") {
                    // Report SKIPPED immediately — action will not run
                    callComplete(server, headers, gateResp.action_id, "SKIPPED", undefined, timeoutMs).catch(() => { });
                    const reason = gateResp.policy_hits.length
                        ? `Policy: ${gateResp.policy_hits.join(", ")}`
                        : `Risk score: ${gateResp.aari_score}/100`;
                    // Route to blocked output with full context
                    blockedItems.push({
                        json: {
                            ...item.json,
                            aariActionId: gateResp.action_id,
                            aariDecision: "BLOCK",
                            aariScore: gateResp.aari_score,
                            aariPolicyHits: gateResp.policy_hits,
                            aariMessage: gateResp.message,
                            aariBlockReason: `[AARI BLOCK] '${actionType}' on '${resource}' blocked. ${reason}.`,
                            aariDegraded: gateResp.degraded ?? false,
                        },
                        pairedItem: { item: i },
                    });
                    continue;
                }
                if (gateResp.decision === "BLOCK" && mode === "advisory") {
                    this.logger.warn(`[AARI WARN (advisory)] Would block '${actionType}' — score=${gateResp.aari_score}`);
                }
                // ALLOW or WARN or advisory BLOCK — pass through to Allowed output
                allowedItems.push({
                    json: {
                        ...item.json,
                        aariActionId: gateResp.action_id,
                        aariDecision: gateResp.decision,
                        aariScore: gateResp.aari_score,
                        aariPolicyHits: gateResp.policy_hits,
                        aariMessage: gateResp.message,
                        aariDegraded: gateResp.degraded ?? false,
                    },
                    pairedItem: { item: i },
                });
            }
            // -------------------------------------------------------------------
            // COMPLETE
            // -------------------------------------------------------------------
            else if (operation === "complete") {
                const actionId = this.getNodeParameter("actionId", i);
                const outcome = this.getNodeParameter("outcome", i);
                const errorMessage = outcome === "FAILURE"
                    ? this.getNodeParameter("errorMessage", i)
                    : undefined;
                if (!actionId?.trim()) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), "Action ID is required for Complete. Connect this node after an AARI Gate node.", { itemIndex: i });
                }
                await callComplete(server, headers, actionId, outcome, errorMessage || undefined, timeoutMs);
                allowedItems.push({
                    json: {
                        ...item.json,
                        aariCompleted: true,
                        aariOutcome: outcome,
                    },
                    pairedItem: { item: i },
                });
            }
        }
        return [allowedItems, blockedItems];
    }
}
exports.Aari = Aari;
//# sourceMappingURL=Aari.node.js.map