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
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import fs from 'fs';
import path from 'path';
import TestResults from '../test/TestResults';
import type { PolicyTestResponse } from '../test/types';

// Monaco does not run in jsdom - only its react wrapper is used for a couple of read-only
// viewers here, so a lightweight stub is enough (same approach other Editor tests avoid needing
// since they don't render Monaco; this is the first Fase 5 test to do so).
jest.mock('@monaco-editor/react', () => ({
    __esModule: true,
    Editor: ({ value }: { value?: string }) => <div data-testid='monaco-stub'>{value}</div>,
    loader: { config: jest.fn() },
}));
jest.mock('monaco-editor', () => ({}), { virtual: true });

const FIXTURES_DIR = path.join(__dirname, '..', '__fixtures__', 'test-responses');

function readFixture(name: string): PolicyTestResponse {
    return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8'));
}

function renderWithIntl(ui: React.ReactElement) {
    return render(<IntlProvider locale='en'>{ui}</IntlProvider>);
}

describe('TestResults', () => {
    it('renders a green COMPLETED status banner with duration', () => {
        const response = readFixture('completed.json');
        renderWithIntl(<TestResults response={response} testError={null} isRunning={false} />);
        expect(screen.getByTestId('test-results-status-COMPLETED')).toHaveTextContent('COMPLETED');
        expect(screen.getByTestId('test-results-status-COMPLETED')).toHaveTextContent('132 ms');
    });

    it('renders a blue RESPONDED banner naming the last trace node', () => {
        const response = readFixture('responded.json');
        renderWithIntl(<TestResults response={response} testError={null} isRunning={false} />);
        expect(screen.getByTestId('test-results-status-RESPONDED')).toHaveTextContent('12/else/3');
    });

    it('renders a red FAULT banner with the fault code, message and node', () => {
        const response = readFixture('fault-401.json');
        renderWithIntl(<TestResults response={response} testError={null} isRunning={false} />);
        const banner = screen.getByTestId('test-results-status-FAULT');
        expect(banner).toHaveTextContent('101504');
        expect(banner).toHaveTextContent('401');
        expect(banner).toHaveTextContent('10');
    });

    it('shows a mocked badge and the mock id in the outbound calls tab', () => {
        const response = readFixture('fault-401.json');
        renderWithIntl(<TestResults response={response} testError={null} isRunning={false} />);
        fireEvent.click(screen.getByText('Outbound calls'));
        expect(screen.getByText('m1')).toBeInTheDocument();
    });

    it('reveals the trace node line when a trace row is clicked', () => {
        const response = readFixture('responded.json');
        const onSelectNode = jest.fn();
        renderWithIntl(
            <TestResults response={response} testError={null} isRunning={false} onSelectNode={onSelectNode} />,
        );
        fireEvent.click(screen.getByText('Trace'));
        fireEvent.click(screen.getByTestId('test-results-trace-row-4'));
        expect(onSelectNode).toHaveBeenCalledWith('12/else/3');
    });

    it('short-circuits to render errors when there is no execution, and reveals the error line on click', () => {
        const response = readFixture('render-errors.json');
        const onRevealLine = jest.fn();
        renderWithIntl(
            <TestResults response={response} testError={null} isRunning={false} onRevealLine={onRevealLine} />,
        );
        expect(screen.queryByText('Client response')).not.toBeInTheDocument();
        const errorAlert = screen.getByTestId('test-results-render-error-0');
        expect(errorAlert).toHaveTextContent('Line 5');
        fireEvent.click(errorAlert);
        expect(onRevealLine).toHaveBeenCalledWith(5);
    });

    it('shows the mapped error message when the test call itself failed', () => {
        renderWithIntl(
            <TestResults
                response={null}
                testError={{ kind: 'GATEWAY_UNREACHABLE', message: 'gateway down' }}
                isRunning={false}
            />,
        );
        expect(screen.getByText('gateway down')).toBeInTheDocument();
    });

    it('shows a compact empty state (item 3, UX polish) when there is no response, error or '
        + 'running state, instead of a big blank area', () => {
        renderWithIntl(
            <TestResults response={null} testError={null} isRunning={false} />,
        );
        expect(screen.getByTestId('test-results-empty-state')).toBeInTheDocument();
        expect(screen.getByText('Run the test to see the client response, trace and logs')).toBeInTheDocument();
    });
});
