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

import { useEffect, useState } from 'react';
import API from 'AppData/api.js';
import type { SandboxEnvironment } from '../test/types';

export interface UsePolicySandboxEnvironmentsResult {
    enabled: boolean;
    environments: SandboxEnvironment[];
    loading: boolean;
    /** false once we've learned the backend doesn't support this operation yet */
    isSupported: boolean;
}

/**
 * Fetches `GET /operation-policies/test/environments` once per mount (the list is cheap/static
 * config, no need for a debounce like `usePolicyRender`). Only invoked by `TestPanel` when the
 * "Test" tab is enabled, so a missing backend operation degrades gracefully to `isSupported: false`.
 * @returns {UsePolicySandboxEnvironmentsResult} The environments list plus loading/support state
 */
export function usePolicySandboxEnvironments(): UsePolicySandboxEnvironmentsResult {
    const [enabled, setEnabled] = useState(false);
    const [environments, setEnvironments] = useState<SandboxEnvironment[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSupported, setIsSupported] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        (API as any).getPolicySandboxEnvironments()
            .then((result: any) => {
                if (cancelled) return;
                const body = result?.body || {};
                setEnabled(Boolean(body.enabled));
                setEnvironments(body.environments || []);
            })
            .catch((error: any) => {
                if (cancelled) return;
                if (error?.message === 'OPERATION_NOT_AVAILABLE') {
                    setIsSupported(false);
                }
                setEnabled(false);
                setEnvironments([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return {
        enabled, environments, loading, isSupported,
    };
}

export default usePolicySandboxEnvironments;
