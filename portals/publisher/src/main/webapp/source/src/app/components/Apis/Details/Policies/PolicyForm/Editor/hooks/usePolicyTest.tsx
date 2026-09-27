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

import { useCallback, useRef, useState } from 'react';
import API from 'AppData/api.js';
import type {
    MockDefinition, PolicyTestResponse, SampleRequest,
} from '../test/types';

export type PolicyTestErrorKind =
    | 'NOT_AVAILABLE'
    | 'DISABLED'
    | 'GATEWAY_UNREACHABLE'
    | 'BUSY'
    | 'PAYLOAD_TOO_LARGE'
    | 'UNKNOWN';

export interface PolicyTestError {
    kind: PolicyTestErrorKind;
    message: string;
}

export interface PolicyTestRunInput {
    policyDefinition: string;
    attributeValues: Record<string, any>;
    sampleRequest: SampleRequest;
    mocks: MockDefinition[];
    extraProperties: Record<string, string>;
    gatewayEnvironment?: string;
}

export interface UsePolicyTestResult {
    run: (input: PolicyTestRunInput) => void;
    cancel: () => void;
    isRunning: boolean;
    response: PolicyTestResponse | null;
    error: PolicyTestError | null;
    reset: () => void;
}

/**
 * Reads a message out of a swagger-client/axios-style error's response body, falling back to
 * `error.message`/a generic string. The Gateway (via the CP proxy) sends JSON bodies like
 * `{"code":429,"message":"..."}` for 429/413/502 - see `sandbox-contract.md`.
 * @param {any} error The rejected error
 * @param {string} fallback Message to use when nothing better is found
 * @returns {string} Best-effort human readable message
 */
function extractMessage(error: any, fallback: string): string {
    const body = error?.response?.body;
    if (body && typeof body === 'object' && typeof body.message === 'string') {
        return body.message;
    }
    if (typeof body === 'string' && body.trim() !== '') {
        return body;
    }
    if (typeof error?.message === 'string' && error.message !== '') {
        return error.message;
    }
    return fallback;
}

/**
 * Maps a rejected `API.testOperationPolicy` promise into a `PolicyTestError`, per the error
 * handling contract described in the Fase 5 plan section: `OPERATION_NOT_AVAILABLE` -> backend
 * doesn't support testing yet, HTTP 404 -> disabled (sandbox flag off on the CP or Gateway),
 * 502 -> gateway unreachable, 429 -> busy/retry later, 413 -> payload too large.
 * @param {any} error The rejected error from the API call
 * @returns {PolicyTestError} The mapped, user-facing error
 */
export function mapPolicyTestError(error: any): PolicyTestError {
    if (error?.message === 'OPERATION_NOT_AVAILABLE') {
        return {
            kind: 'NOT_AVAILABLE',
            message: "Backend doesn't support testing yet",
        };
    }
    const status = error?.status || error?.response?.status;
    switch (status) {
        case 404:
            return {
                kind: 'DISABLED',
                message: extractMessage(error, 'Policy testing is disabled on the server'),
            };
        case 502:
            return {
                kind: 'GATEWAY_UNREACHABLE',
                message: extractMessage(error, 'The selected Gateway environment is unreachable'),
            };
        case 429:
            return {
                kind: 'BUSY',
                message: extractMessage(error, 'The sandbox is busy running other tests, please retry later'),
            };
        case 413:
            return {
                kind: 'PAYLOAD_TOO_LARGE',
                message: extractMessage(error, 'The request or response payload is too large to test'),
            };
        default:
            return {
                kind: 'UNKNOWN',
                message: extractMessage(error, 'Something went wrong while running the test'),
            };
    }
}

/**
 * Strips a blank/whitespace-only `method` from each mock before it goes on the wire. The
 * MocksEditor always initializes `method` to `''` (meaning "any method"), but the Gateway's mock
 * matcher historically treated an empty string as a concrete method to match against - which
 * never matches a real request method, so the mock (and its rewrite) was silently skipped. The
 * Gateway now normalizes blank methods too, but omitting the field here keeps the wire contract
 * unambiguous and matches what a hand-written REGEX/GLOB-only mock would send.
 * @param {MockDefinition[] | undefined} mocks The raw mocks from the editor state
 * @returns {MockDefinition[]} The same mocks with empty/whitespace-only `method` fields removed
 */
function normalizeMocks(mocks: MockDefinition[] | undefined): MockDefinition[] {
    return (mocks || []).map((mock) => {
        if (typeof mock.method === 'string' && mock.method.trim() === '') {
            const { method, ...rest } = mock;
            return rest as MockDefinition;
        }
        return mock;
    });
}

/**
 * Drives `POST /operation-policies/test` for the Fase 5 Test panel: builds the request body per
 * the sandbox contract (fixed `flow: 'request'`, `captureSnapshots: false` - snapshots are a
 * nice-to-have not exposed in the UI yet), tracks a loading state, and maps errors with
 * {@link mapPolicyTestError}. Since the generated swagger-client operation used by `data/api.js`
 * does not expose an `AbortController`, in-flight/late responses from a superseded run are simply
 * ignored via a monotonically increasing request id (the same pattern `usePolicyRender` uses).
 * @returns {UsePolicyTestResult} `run`/`cancel`/`reset` plus the current response/error/loading state
 */
export function usePolicyTest(): UsePolicyTestResult {
    const [isRunning, setIsRunning] = useState(false);
    const [response, setResponse] = useState<PolicyTestResponse | null>(null);
    const [error, setError] = useState<PolicyTestError | null>(null);
    const requestIdRef = useRef(0);

    const run = useCallback((input: PolicyTestRunInput) => {
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        setIsRunning(true);
        setError(null);

        const body = {
            policyDefinition: input.policyDefinition,
            attributeValues: input.attributeValues || {},
            flow: 'request' as const,
            sampleRequest: input.sampleRequest,
            mocks: normalizeMocks(input.mocks),
            extraProperties: input.extraProperties || {},
            gatewayEnvironment: input.gatewayEnvironment,
            captureSnapshots: false,
        };

        const api = new API();
        api.testOperationPolicy(body)
            .then((result: any) => {
                if (requestIdRef.current !== requestId) return;
                setResponse((result?.body || null) as PolicyTestResponse | null);
            })
            .catch((err: any) => {
                if (requestIdRef.current !== requestId) return;
                setResponse(null);
                setError(mapPolicyTestError(err));
            })
            .finally(() => {
                if (requestIdRef.current === requestId) {
                    setIsRunning(false);
                }
            });
    }, []);

    const cancel = useCallback(() => {
        // Bumping the request id makes any in-flight promise's callbacks no-ops when they settle.
        requestIdRef.current += 1;
        setIsRunning(false);
    }, []);

    const reset = useCallback(() => {
        requestIdRef.current += 1;
        setIsRunning(false);
        setResponse(null);
        setError(null);
    }, []);

    return {
        run, cancel, isRunning, response, error, reset,
    };
}

export default usePolicyTest;
