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
import PolicyEditorWorkspace from '../PolicyEditorWorkspace';

// Monaco does not run in jsdom - stub it the same way TestPanel.test.tsx does.
jest.mock('@monaco-editor/react', () => ({
    __esModule: true,
    Editor: ({ value }: { value?: string }) => <div data-testid='monaco-stub'>{value}</div>,
    loader: { config: jest.fn() },
}));
jest.mock('monaco-editor', () => ({}), { virtual: true });

jest.mock('AppData/api.js', () => {
    const ApiMock: any = jest.fn().mockImplementation(() => ({
        renderOperationPolicy: jest.fn().mockResolvedValue({ body: {} }),
    }));
    return ApiMock;
});

function renderWorkspace(overrides: Partial<React.ComponentProps<typeof PolicyEditorWorkspace>> = {}) {
    const onClose = jest.fn();
    const onSavePolicy = jest.fn();
    const utils = render(
        <IntlProvider locale='en'>
            <PolicyEditorWorkspace
                open
                onClose={onClose}
                value=''
                onChange={jest.fn()}
                onSavePolicy={onSavePolicy}
                {...overrides}
            />
        </IntlProvider>,
    );
    return { ...utils, onClose, onSavePolicy };
}

describe('PolicyEditorWorkspace - header Save/Back actions', () => {
    it('renders both the "Save policy" and "Back to form" buttons when onSavePolicy is provided', () => {
        renderWorkspace();
        expect(screen.getByTestId('policy-editor-save-policy-btn')).toBeInTheDocument();
        expect(screen.getByTestId('policy-editor-back-to-form-btn')).toBeInTheDocument();
    });

    it('does not render the bare close icon button', () => {
        renderWorkspace();
        expect(screen.queryByLabelText(/^close-policy-editor-workspace$/i)).not.toBeNull();
        // The close action is now the "Back to form" button itself, not a separate icon-only X.
        expect(screen.queryByTestId('policy-editor-back-to-form-btn')).toHaveTextContent('Back to form');
    });

    it('omits the "Save policy" button when onSavePolicy is not provided (e.g. view mode)', () => {
        renderWorkspace({ onSavePolicy: undefined });
        expect(screen.queryByTestId('policy-editor-save-policy-btn')).toBeNull();
        expect(screen.getByTestId('policy-editor-back-to-form-btn')).toBeInTheDocument();
    });

    it('calls onClose when "Back to form" is clicked, keeping the content (no save call)', () => {
        const { onClose, onSavePolicy } = renderWorkspace();
        fireEvent.click(screen.getByTestId('policy-editor-back-to-form-btn'));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onSavePolicy).not.toHaveBeenCalled();
    });

    it('calls onSavePolicy when "Save policy" is clicked', () => {
        const { onSavePolicy, onClose } = renderWorkspace();
        fireEvent.click(screen.getByTestId('policy-editor-save-policy-btn'));
        expect(onSavePolicy).toHaveBeenCalledTimes(1);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('shows a loading spinner and disables the Save button while saving', () => {
        renderWorkspace({ saving: true });
        const saveBtn = screen.getByTestId('policy-editor-save-policy-btn');
        expect(saveBtn).toBeDisabled();
    });
});
