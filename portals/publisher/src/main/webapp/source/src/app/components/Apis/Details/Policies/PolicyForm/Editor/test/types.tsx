/*
 * Copyright (c) 2026, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 * WSO2 Inc. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * Shared TypeScript shapes for the Fase 5 Test panel. These mirror
 * `dev-scripts/sandbox-contract.md` (Gateway `PolicySandboxExecuteRequest`/`Response`) and the
 * Control Plane `POST /operation-policies/test` wrapper (render fields + `execution`) exactly -
 * both sides are the single source of truth, do not rename fields without updating the contract.
 */

export type SandboxMatchType = 'GLOB' | 'REGEX';

export interface SampleRequest {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string;
    contentType: string;
}

export interface MockDefinition {
    id: string;
    urlPattern: string;
    matchType: SandboxMatchType;
    /** Optional: any method matches when absent/empty */
    method?: string;
    status: number;
    headers: Record<string, string>;
    body: string;
    contentType: string;
    delayMs: number;
}

/** Body sent to `POST /operation-policies/test` (contract: publisher v4) */
export interface PolicyTestRequestBody {
    policyDefinition: string;
    attributeValues: Record<string, any>;
    flow: 'request' | 'response' | 'fault';
    sampleRequest: SampleRequest;
    mocks: MockDefinition[];
    extraProperties: Record<string, string>;
    gatewayEnvironment?: string;
    captureSnapshots: boolean;
}

export interface RenderError {
    line: number;
    column: number;
    message: string;
    severity?: 'error' | 'warning';
}

export interface ClientResponse {
    status: number;
    headers: Record<string, string>;
    body: string;
}

export interface FinalMessage {
    payload: string;
    contentType: string;
    httpStatus: number;
    headers: Record<string, string>;
}

export interface ExecutionProperties {
    synapse: Record<string, string>;
    axis2: Record<string, string>;
    transport: Record<string, string>;
}

export interface ExecutionLogEntry {
    ts: number;
    level: string;
    nodeId: string;
    message: string;
}

export interface ExecutionTraceEntry {
    order: number;
    nodeId: string;
    tag: string;
    tMs: number;
}

export interface OutboundCall {
    nodeId: string;
    method: string;
    url: string;
    mocked: boolean;
    mockId?: string;
    status: number;
    requestBody?: string;
    durationMs: number;
}

export interface ExecutionFault {
    code: string;
    message: string;
    nodeId?: string;
}

export type ExecutionStatus = 'COMPLETED' | 'RESPONDED' | 'FAULT' | 'DROPPED' | 'TIMEOUT' | 'ERROR';

/** `PolicySandboxExecuteResponse`, forwarded verbatim by the CP as `execution` */
export interface PolicySandboxExecution {
    status: ExecutionStatus;
    respondedEarly: boolean;
    durationMs: number;
    clientResponse?: ClientResponse;
    finalMessage?: FinalMessage;
    properties?: ExecutionProperties;
    logs: ExecutionLogEntry[];
    trace: ExecutionTraceEntry[];
    outboundCalls: OutboundCall[];
    fault?: ExecutionFault;
    warnings?: string[];
    errors?: string[];
}

/** Full response of `POST /operation-policies/test`: render fields + `execution` */
export interface PolicyTestResponse {
    renderedSequence?: string;
    normalized?: boolean;
    errors: RenderError[];
    warnings: string[];
    detectedVariables: string[];
    unknownMediators: string[];
    execution?: PolicySandboxExecution;
}

export interface SandboxEnvironment {
    name: string;
    displayName: string;
}

/** `GET /operation-policies/test/environments` response */
export interface SandboxEnvironmentsResponse {
    enabled: boolean;
    environments: SandboxEnvironment[];
}

/** sessionStorage-persisted shape of everything a user fills in the Test panel for one policy draft */
export interface PersistedTestInputs {
    attributeValues: Record<string, any>;
    sampleRequest: SampleRequest;
    mocks: MockDefinition[];
    extraProperties: Record<string, string>;
    gatewayEnvironment?: string;
}
