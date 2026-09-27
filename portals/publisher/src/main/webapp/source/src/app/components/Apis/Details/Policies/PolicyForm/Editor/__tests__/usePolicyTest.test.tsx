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

import { renderHook, act, waitFor } from '@testing-library/react';
import usePolicyTest, { mapPolicyTestError } from '../hooks/usePolicyTest';

const mockTestOperationPolicy = jest.fn();

jest.mock('AppData/api.js', () => (
    jest.fn().mockImplementation(() => ({
        testOperationPolicy: mockTestOperationPolicy,
    }))
));

describe('usePolicyTest - request building', () => {
    beforeEach(() => {
        mockTestOperationPolicy.mockReset();
    });

    it('builds the request body per the sandbox contract (fixed flow/captureSnapshots)', async () => {
        mockTestOperationPolicy.mockResolvedValue({ body: { errors: [], warnings: [], execution: { status: 'COMPLETED' } } });
        const { result } = renderHook(() => usePolicyTest());

        act(() => {
            result.current.run({
                policyDefinition: '<log/>',
                attributeValues: { foo: 'bar' },
                sampleRequest: {
                    method: 'POST', path: '/orders/1', headers: { 'Content-Type': 'application/json' }, body: '{}', contentType: 'application/json',
                },
                mocks: [],
                extraProperties: { 'api.ut.userName': 'admin' },
                gatewayEnvironment: 'Default',
            });
        });

        await waitFor(() => expect(result.current.isRunning).toBe(false));

        expect(mockTestOperationPolicy).toHaveBeenCalledTimes(1);
        const body = mockTestOperationPolicy.mock.calls[0][0];
        expect(body).toEqual({
            policyDefinition: '<log/>',
            attributeValues: { foo: 'bar' },
            flow: 'request',
            sampleRequest: {
                method: 'POST', path: '/orders/1', headers: { 'Content-Type': 'application/json' }, body: '{}', contentType: 'application/json',
            },
            mocks: [],
            extraProperties: { 'api.ut.userName': 'admin' },
            gatewayEnvironment: 'Default',
            captureSnapshots: false,
        });
        expect(result.current.response?.execution?.status).toBe('COMPLETED');
        expect(result.current.error).toBeNull();
    });

    it('omits an empty/whitespace-only mock method instead of sending it as-is', async () => {
        mockTestOperationPolicy.mockResolvedValue({ body: { errors: [], warnings: [], execution: { status: 'COMPLETED' } } });
        const { result } = renderHook(() => usePolicyTest());

        act(() => {
            result.current.run({
                policyDefinition: '<log/>',
                attributeValues: {},
                sampleRequest: {
                    method: 'POST', path: '/orders/1', headers: {}, body: '', contentType: 'application/json',
                },
                mocks: [
                    {
                        id: 'm1', urlPattern: 'https://idp.example.com/*', matchType: 'GLOB', method: '', status: 200, headers: {}, body: '', contentType: 'application/json',
                    },
                    {
                        id: 'm2', urlPattern: 'https://other.example.com/*', matchType: 'GLOB', method: '   ', status: 200, headers: {}, body: '', contentType: 'application/json',
                    },
                    {
                        id: 'm3', urlPattern: 'https://third.example.com/*', matchType: 'GLOB', method: 'POST', status: 200, headers: {}, body: '', contentType: 'application/json',
                    },
                ],
                extraProperties: {},
                gatewayEnvironment: 'Default',
            });
        });

        await waitFor(() => expect(result.current.isRunning).toBe(false));

        const body = mockTestOperationPolicy.mock.calls[0][0];
        expect(body.mocks).toEqual([
            {
                id: 'm1', urlPattern: 'https://idp.example.com/*', matchType: 'GLOB', status: 200, headers: {}, body: '', contentType: 'application/json',
            },
            {
                id: 'm2', urlPattern: 'https://other.example.com/*', matchType: 'GLOB', status: 200, headers: {}, body: '', contentType: 'application/json',
            },
            {
                id: 'm3', urlPattern: 'https://third.example.com/*', matchType: 'GLOB', method: 'POST', status: 200, headers: {}, body: '', contentType: 'application/json',
            },
        ]);
        expect(body.mocks[0]).not.toHaveProperty('method');
        expect(body.mocks[1]).not.toHaveProperty('method');
    });

    it('ignores a stale (superseded) response after cancel()', async () => {
        let resolveFirst: (value: any) => void = () => {};
        mockTestOperationPolicy.mockImplementationOnce(() => new Promise((resolve) => {
            resolveFirst = resolve;
        }));
        const { result } = renderHook(() => usePolicyTest());

        act(() => {
            result.current.run({
                policyDefinition: '<log/>',
                attributeValues: {},
                sampleRequest: {
                    method: 'GET', path: '/', headers: {}, body: '', contentType: 'application/json',
                },
                mocks: [],
                extraProperties: {},
            });
        });
        act(() => {
            result.current.cancel();
        });
        act(() => {
            resolveFirst({ body: { errors: [], warnings: [], execution: { status: 'COMPLETED' } } });
        });

        await waitFor(() => expect(result.current.isRunning).toBe(false));
        expect(result.current.response).toBeNull();
    });
});

describe('mapPolicyTestError', () => {
    it('maps OPERATION_NOT_AVAILABLE', () => {
        expect(mapPolicyTestError(new Error('OPERATION_NOT_AVAILABLE')).kind).toBe('NOT_AVAILABLE');
    });

    it('maps HTTP 404 to DISABLED', () => {
        expect(mapPolicyTestError({ status: 404 }).kind).toBe('DISABLED');
    });

    it('maps HTTP 502 to GATEWAY_UNREACHABLE, using the response body message', () => {
        const mapped = mapPolicyTestError({ status: 502, response: { body: { message: 'gateway down' } } });
        expect(mapped.kind).toBe('GATEWAY_UNREACHABLE');
        expect(mapped.message).toBe('gateway down');
    });

    it('maps HTTP 429 to BUSY', () => {
        expect(mapPolicyTestError({ status: 429 }).kind).toBe('BUSY');
    });

    it('maps HTTP 413 to PAYLOAD_TOO_LARGE', () => {
        expect(mapPolicyTestError({ status: 413 }).kind).toBe('PAYLOAD_TOO_LARGE');
    });

    it('falls back to UNKNOWN for anything else', () => {
        expect(mapPolicyTestError({ status: 500 }).kind).toBe('UNKNOWN');
    });
});
