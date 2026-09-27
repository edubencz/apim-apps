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

import React from 'react';
import {
    render, screen, waitFor, fireEvent, act,
} from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import TestPanel from '../test/TestPanel';

// Monaco does not run in jsdom - stub it the same way TestResults.test.tsx does (SampleRequestEditor
// and TestResults both render a read-only/editable Monaco instance).
jest.mock('@monaco-editor/react', () => ({
    __esModule: true,
    Editor: ({ value }: { value?: string }) => <div data-testid='monaco-stub'>{value}</div>,
    loader: { config: jest.fn() },
}));
jest.mock('monaco-editor', () => ({}), { virtual: true });

const mockTestOperationPolicy = jest.fn();
const mockGetPolicySandboxEnvironments = jest.fn();

jest.mock('AppData/api.js', () => {
    const ApiMock: any = jest.fn().mockImplementation(() => ({
        testOperationPolicy: mockTestOperationPolicy,
    }));
    ApiMock.getPolicySandboxEnvironments = (...args: any[]) => mockGetPolicySandboxEnvironments(...args);
    return ApiMock;
});

/** Installs a `window.matchMedia` stub so `useMediaQuery(theme.breakpoints.up('md'))` resolves to
 * `matches` synchronously (jsdom does not implement matchMedia at all). */
function mockMatchMedia(matches: boolean) {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation((query: string) => ({
            matches,
            media: query,
            onchange: null,
            addListener: jest.fn(),
            removeListener: jest.fn(),
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            dispatchEvent: jest.fn(),
        })),
    });
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof TestPanel>> = {}) {
    const storageKey = `test-panel-storage-key-${Math.random()}`;
    const utils = render(
        <IntlProvider locale='en'>
            <TestPanel
                policyDefinition='<log/>'
                policyAttributes={[]}
                detectedVariables={[]}
                flowNodes={[]}
                attributeValues={{}}
                storageKey={storageKey}
                {...overrides}
            />
        </IntlProvider>,
    );
    const rerenderWith = (nextOverrides: Partial<React.ComponentProps<typeof TestPanel>>) => utils.rerender(
        <IntlProvider locale='en'>
            <TestPanel
                policyDefinition='<log/>'
                policyAttributes={[]}
                detectedVariables={[]}
                flowNodes={[]}
                attributeValues={{}}
                storageKey={storageKey}
                {...overrides}
                {...nextOverrides}
            />
        </IntlProvider>,
    );
    return { ...utils, rerenderWith };
}

describe('TestPanel - Issue 1 (results visibility) layout logic', () => {
    beforeEach(() => {
        mockTestOperationPolicy.mockReset();
        mockGetPolicySandboxEnvironments.mockReset();
        mockGetPolicySandboxEnvironments.mockResolvedValue({
            body: { enabled: true, environments: [{ name: 'Default', displayName: 'Default' }] },
        });
        try {
            window.sessionStorage.clear();
        } catch (e) {
            // ignore
        }
    });

    it('shows a "No runs yet" status chip before any run, on both wide and narrow screens', async () => {
        mockMatchMedia(true);
        renderPanel();
        await waitFor(() => expect(mockGetPolicySandboxEnvironments).toHaveBeenCalled());
        expect(screen.getByTestId('test-panel-last-run-status')).toHaveTextContent('No runs yet');
    });

    it('keeps the Run button inside a sticky toolbar that always renders (wide and narrow)', async () => {
        mockMatchMedia(false);
        renderPanel();
        await waitFor(() => expect(mockGetPolicySandboxEnvironments).toHaveBeenCalled());
        expect(screen.getByTestId('test-panel-toolbar')).toContainElement(screen.getByTestId('test-panel-run-btn'));
    });

    it('on wide screens, shows Inputs and Results panes side by side (neither is hidden)', async () => {
        mockMatchMedia(true);
        renderPanel();
        await waitFor(() => expect(mockGetPolicySandboxEnvironments).toHaveBeenCalled());
        expect(screen.getByTestId('test-panel-inputs-pane')).not.toHaveAttribute('hidden');
        expect(screen.getByTestId('test-panel-results-pane')).not.toHaveAttribute('hidden');
        // No inner tabs are rendered on wide screens - both panes are always visible together.
        expect(screen.queryByTestId('test-panel-inner-tabs')).not.toBeInTheDocument();
    });

    it('on narrow screens, starts on the Inputs tab and hides the Results pane', async () => {
        mockMatchMedia(false);
        renderPanel();
        await waitFor(() => expect(mockGetPolicySandboxEnvironments).toHaveBeenCalled());
        expect(screen.getByTestId('test-panel-inputs-pane')).not.toHaveAttribute('hidden');
        expect(screen.getByTestId('test-panel-results-pane')).toHaveAttribute('hidden');
    });

    it('on narrow screens, auto-switches to the Results tab as soon as a run completes', async () => {
        mockMatchMedia(false);
        mockTestOperationPolicy.mockResolvedValue({
            body: {
                errors: [], warnings: [], detectedVariables: [], unknownMediators: [],
                execution: {
                    status: 'COMPLETED', respondedEarly: false, durationMs: 42, logs: [], trace: [], outboundCalls: [],
                },
            },
        });
        renderPanel();
        await waitFor(() => expect(mockGetPolicySandboxEnvironments).toHaveBeenCalled());

        // Before running, Results is hidden and the status chip is neutral.
        expect(screen.getByTestId('test-panel-results-pane')).toHaveAttribute('hidden');

        fireEvent.click(screen.getByTestId('test-panel-run-btn'));

        await waitFor(() => expect(screen.getByTestId('test-panel-results-pane')).not.toHaveAttribute('hidden'));
        expect(screen.getByTestId('test-panel-inputs-pane')).toHaveAttribute('hidden');
        // The status banner (from TestResults) must be visible without any further scrolling/clicks.
        expect(screen.getByTestId('test-results-status-COMPLETED')).toBeInTheDocument();
        expect(screen.getByTestId('test-panel-last-run-status')).toHaveTextContent('COMPLETED');
    });

    it('on narrow screens, auto-switches to Results even when the run errors out (not only on success)', async () => {
        mockMatchMedia(false);
        mockTestOperationPolicy.mockRejectedValue({ status: 404, response: { body: { message: 'disabled' } } });
        renderPanel();
        await waitFor(() => expect(mockGetPolicySandboxEnvironments).toHaveBeenCalled());

        fireEvent.click(screen.getByTestId('test-panel-run-btn'));

        await waitFor(() => expect(screen.getByTestId('test-panel-results-pane')).not.toHaveAttribute('hidden'));
        expect(screen.getByTestId('test-results-error')).toBeInTheDocument();
        expect(screen.getByTestId('test-panel-last-run-status')).toHaveTextContent('Error');
    });

    it('persists test inputs to sessionStorage under the given storageKey (best effort)', async () => {
        mockMatchMedia(true);
        const storageKey = `test-panel-persist-${Math.random()}`;
        render(
            <IntlProvider locale='en'>
                <TestPanel
                    policyDefinition='<log/>'
                    policyAttributes={[]}
                    detectedVariables={[]}
                    flowNodes={[]}
                    attributeValues={{}}
                    storageKey={storageKey}
                />
            </IntlProvider>,
        );
        await waitFor(() => expect(mockGetPolicySandboxEnvironments).toHaveBeenCalled());
        // The gatewayEnvironment defaults to the first environment only once `environments` loads,
        // one render after the sessionStorage effect first runs - wait for that settled value.
        await waitFor(() => {
            const raw = window.sessionStorage.getItem(storageKey);
            expect(raw).not.toBeNull();
            expect(JSON.parse(raw as string)).toHaveProperty('gatewayEnvironment', 'Default');
        });
        const persisted = JSON.parse(window.sessionStorage.getItem(storageKey) as string);
        expect(persisted).toHaveProperty('sampleRequest');
    });
});

describe('TestPanel - clearing and staleness (template apply / manual edit / re-run)', () => {
    beforeEach(() => {
        mockMatchMedia(true);
        mockTestOperationPolicy.mockReset();
        mockGetPolicySandboxEnvironments.mockReset();
        mockGetPolicySandboxEnvironments.mockResolvedValue({
            body: { enabled: true, environments: [{ name: 'Default', displayName: 'Default' }] },
        });
        try {
            window.sessionStorage.clear();
        } catch (e) {
            // ignore
        }
    });

    async function runAndSettle() {
        mockTestOperationPolicy.mockResolvedValue({
            body: {
                errors: [], warnings: [], detectedVariables: [], unknownMediators: [],
                execution: {
                    status: 'COMPLETED', respondedEarly: false, durationMs: 1, logs: [], trace: [], outboundCalls: [],
                },
            },
        });
        fireEvent.click(screen.getByTestId('test-panel-run-btn'));
        await waitFor(() => expect(screen.getByTestId('test-results')).toBeInTheDocument());
    }

    it('a template apply (resetSignal bump) fully discards a previous run: response, chip and stale flag', async () => {
        const onStaleChange = jest.fn();
        const { rerenderWith } = renderPanel({ resetSignal: 0, onStaleChange });
        await waitFor(() => expect(mockGetPolicySandboxEnvironments).toHaveBeenCalled());
        await runAndSettle();
        expect(screen.getByTestId('test-panel-last-run-status')).toHaveTextContent('COMPLETED');

        // Simulate PolicyEditorWorkspace bumping `resetSignal` after a template apply.
        await act(async () => {
            rerenderWith({ resetSignal: 1, onStaleChange });
        });

        expect(screen.getByTestId('test-panel-last-run-status')).toHaveTextContent('No runs yet');
        expect(screen.getByTestId('test-results-empty-state')).toBeInTheDocument();
        expect(onStaleChange).toHaveBeenLastCalledWith(false);
    });

    it('editing the content after a run marks the result stale: banner shown, chip greyed, trace hidden', async () => {
        const onStaleChange = jest.fn();
        const { rerenderWith } = renderPanel({ onStaleChange });
        await waitFor(() => expect(mockGetPolicySandboxEnvironments).toHaveBeenCalled());
        await runAndSettle();
        onStaleChange.mockClear();

        // Manual edit: the same prop the real editor content flows through (`policyDefinition`).
        await act(async () => {
            rerenderWith({ policyDefinition: '<log/><log/>' });
        });

        expect(onStaleChange).toHaveBeenCalledWith(true);
        expect(screen.getByTestId('test-results-stale-banner')).toBeInTheDocument();
        // The result itself (status/results) is still shown, not wiped.
        expect(screen.getByTestId('test-results-status-COMPLETED')).toBeInTheDocument();
        // The status chip is greyed (MUI "default" color), not the success/COMPLETED color.
        expect(screen.getByTestId('test-panel-last-run-status').className).not.toMatch(/colorSuccess/);
    });

    it('running again after an edit clears the stale flag', async () => {
        const onStaleChange = jest.fn();
        const { rerenderWith } = renderPanel({ onStaleChange });
        await waitFor(() => expect(mockGetPolicySandboxEnvironments).toHaveBeenCalled());
        await runAndSettle();

        await act(async () => {
            rerenderWith({ policyDefinition: '<log/><log/>' });
        });
        expect(screen.getByTestId('test-results-stale-banner')).toBeInTheDocument();

        onStaleChange.mockClear();
        await runAndSettle();

        expect(screen.queryByTestId('test-results-stale-banner')).not.toBeInTheDocument();
        expect(onStaleChange).toHaveBeenLastCalledWith(false);
    });
});
