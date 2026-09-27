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

import { useEffect, useRef, useState } from 'react';
import API from 'AppData/api.js';
import type { RemoteMarker } from '../PolicyCodeEditor';

const DEBOUNCE_MS = 600;

// Remembered for the lifetime of the browser tab: once we learn the backend does not expose
// `/operation-policies/render` (Fase 3 not deployed yet), stop trying so every keystroke doesn't
// keep re-triggering a doomed request.
let renderEndpointUnavailable = false;

export interface UsePolicyRenderResult {
    remoteMarkers: RemoteMarker[];
    warnings: string[];
    unknownMediators: string[];
    isRendering: boolean;
    /** false once we've learned the backend doesn't support this operation yet */
    isSupported: boolean;
}

/**
 * Debounces (600ms) a call to `API.renderOperationPolicy` so the editor gets server-side
 * validation (jinjava render errors, unknown mediators) in addition to the local parse. Fails
 * silently and disables itself for the rest of the session when the backend operation isn't
 * available yet (Fase 3 not deployed), per the plan's "sem gateway" render endpoint contract.
 * @param {string} policyDefinition Current .j2 editor content
 * @param {Record<string, any>} attributeValues Current sample attribute values
 * @returns {UsePolicyRenderResult} Server-side markers/warnings and loading state
 */
export function usePolicyRender(
    policyDefinition: string,
    attributeValues: Record<string, any>,
): UsePolicyRenderResult {
    const [remoteMarkers, setRemoteMarkers] = useState<RemoteMarker[]>([]);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [unknownMediators, setUnknownMediators] = useState<string[]>([]);
    const [isRendering, setIsRendering] = useState(false);
    const [isSupported, setIsSupported] = useState(!renderEndpointUnavailable);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const requestIdRef = useRef(0);

    useEffect(() => {
        if (renderEndpointUnavailable) {
            return undefined;
        }
        if (!policyDefinition || policyDefinition.trim() === '') {
            setRemoteMarkers([]);
            setWarnings([]);
            setUnknownMediators([]);
            return undefined;
        }
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;

        timerRef.current = setTimeout(() => {
            setIsRendering(true);
            const api = new API();
            api.renderOperationPolicy(policyDefinition, attributeValues)
                .then((response: any) => {
                    if (requestIdRef.current !== requestId) return;
                    const body = response?.body || {};
                    setRemoteMarkers((body.errors || []).map((e: any) => ({
                        line: e.line, column: e.column, message: e.message, severity: e.severity,
                    })));
                    setWarnings(body.warnings || []);
                    setUnknownMediators(body.unknownMediators || []);
                })
                .catch((error: any) => {
                    if (error?.message === 'OPERATION_NOT_AVAILABLE') {
                        renderEndpointUnavailable = true;
                        setIsSupported(false);
                    }
                    // Any other transient error (network, 5xx) is intentionally swallowed here:
                    // local parsing already gives the user immediate feedback.
                })
                .finally(() => {
                    if (requestIdRef.current === requestId) {
                        setIsRendering(false);
                    }
                });
        }, DEBOUNCE_MS);

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [policyDefinition, JSON.stringify(attributeValues)]);

    return {
        remoteMarkers, warnings, unknownMediators, isRendering, isSupported,
    };
}

export default usePolicyRender;
