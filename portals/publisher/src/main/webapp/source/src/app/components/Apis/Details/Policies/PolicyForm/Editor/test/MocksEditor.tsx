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

import React, { FC, useState, MouseEvent as ReactMouseEvent } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { FormattedMessage } from 'react-intl';
import { extractEndpointsFromFlow, DetectedEndpoint } from './extractEndpoints';
import type { MockDefinition } from './types';
import type { FlowNode } from '../types';

let mockIdCounter = 0;
/**
 * Generates a locally-unique mock id, only used to key React lists and to populate the
 * `mocks[].id` field the sandbox request contract expects (`sandbox-contract.md`).
 * @returns {string} A new mock id, e.g. "m1"
 */
function nextMockId(): string {
    mockIdCounter += 1;
    return `m${mockIdCounter}`;
}

function emptyMock(urlPattern = ''): MockDefinition {
    return {
        id: nextMockId(),
        urlPattern,
        matchType: 'GLOB',
        method: '',
        status: 200,
        headers: {},
        body: '',
        contentType: 'application/json',
        delayMs: 0,
    };
}

interface MocksEditorProps {
    value: MockDefinition[];
    onChange: (value: MockDefinition[]) => void;
    flowNodes: FlowNode[];
    attributeValues: Record<string, any>;
}

/**
 * Editor for the sandbox request's `mocks[]` array: one card per mock with URL pattern
 * (GLOB/REGEX), optional method, response status/headers/body/content-type and an artificial
 * delay, plus an "Add mock from endpoint" helper that lists every `<call>`/`<send>` endpoint URL
 * detected in the currently parsed policy (see `extractEndpoints.ts`).
 * @param {MocksEditorProps} props Component props
 * @returns {TSX} The mocks editor
 */
const MocksEditor: FC<MocksEditorProps> = ({
    value, onChange, flowNodes, attributeValues,
}) => {
    const [endpointMenuAnchor, setEndpointMenuAnchor] = useState<HTMLElement | null>(null);
    const detectedEndpoints: DetectedEndpoint[] = extractEndpointsFromFlow(flowNodes, attributeValues);

    const updateMock = (index: number, patch: Partial<MockDefinition>) => {
        const next = [...value];
        next[index] = { ...next[index], ...patch };
        onChange(next);
    };
    const removeMock = (index: number) => {
        onChange(value.filter((_, i) => i !== index));
    };
    const addMock = (urlPattern = '') => {
        onChange([...value, emptyMock(urlPattern)]);
        setEndpointMenuAnchor(null);
    };
    const addFromEndpoint = (endpoint: DetectedEndpoint) => {
        addMock(endpoint.resolvedUrl);
    };
    const updateHeader = (mockIndex: number, key: string, newKey: string, newValue: string) => {
        const headers = { ...value[mockIndex].headers };
        if (newKey !== key) delete headers[key];
        headers[newKey] = newValue;
        updateMock(mockIndex, { headers });
    };
    const removeHeader = (mockIndex: number, key: string) => {
        const headers = { ...value[mockIndex].headers };
        delete headers[key];
        updateMock(mockIndex, { headers });
    };
    const addHeader = (mockIndex: number) => {
        updateMock(mockIndex, { headers: { ...value[mockIndex].headers, '': '' } });
    };

    return (
        <Box data-testid='test-panel-mocks-editor'>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <Button
                    size='small'
                    startIcon={<AddIcon />}
                    onClick={() => addMock()}
                    data-testid='test-panel-add-mock'
                >
                    <FormattedMessage
                        id='Apis.Details.Policies.PolicyForm.Editor.Test.MocksEditor.addMock'
                        defaultMessage='Add mock'
                    />
                </Button>
                <Button
                    size='small'
                    endIcon={<ExpandMoreIcon />}
                    disabled={detectedEndpoints.length === 0}
                    onClick={(e: ReactMouseEvent<HTMLElement>) => setEndpointMenuAnchor(e.currentTarget)}
                    data-testid='test-panel-add-mock-from-endpoint'
                >
                    <FormattedMessage
                        id='Apis.Details.Policies.PolicyForm.Editor.Test.MocksEditor.addFromEndpoint'
                        defaultMessage='Add mock from endpoint'
                    />
                </Button>
                <Menu
                    anchorEl={endpointMenuAnchor}
                    open={Boolean(endpointMenuAnchor)}
                    onClose={() => setEndpointMenuAnchor(null)}
                >
                    {detectedEndpoints.map((endpoint) => (
                        <MenuItem
                            key={`${endpoint.nodeId}-${endpoint.rawUrl}`}
                            onClick={() => addFromEndpoint(endpoint)}
                            data-testid={`test-panel-endpoint-option-${endpoint.nodeId}`}
                        >
                            <ListItemText
                                primary={endpoint.resolvedUrl}
                                secondary={`${endpoint.tag} @ ${endpoint.nodeId}`}
                            />
                        </MenuItem>
                    ))}
                </Menu>
            </Box>

            {value.length === 0 && (
                <Typography variant='body2' color='text.secondary'>
                    <FormattedMessage
                        id='Apis.Details.Policies.PolicyForm.Editor.Test.MocksEditor.empty'
                        defaultMessage='No mocks configured - outbound calls will hit their real URL.'
                    />
                </Typography>
            )}

            {value.map((mock, index) => (
                <Paper key={mock.id} variant='outlined' sx={{ p: 2, mb: 2 }} data-testid={`test-panel-mock-${index}`}>
                    {/* Row 1: URL pattern grows to fill the space, match type and method are fixed
                        width - never truncated, and wrap onto their own line on narrow layouts
                        (see the "squeezed mock row" UX fix). */}
                    <Box sx={{
                        display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2,
                    }}
                    >
                        <TextField
                            size='small'
                            label={(
                                <FormattedMessage
                                    id='Apis.Details.Policies.PolicyForm.Editor.Test.MocksEditor.urlPattern'
                                    defaultMessage='URL pattern'
                                />
                            )}
                            value={mock.urlPattern}
                            onChange={(e) => updateMock(index, { urlPattern: e.target.value })}
                            data-testid={`test-panel-mock-url-${index}`}
                            sx={{ flex: '1 1 260px', minWidth: 200 }}
                        />
                        <TextField
                            select
                            size='small'
                            label={(
                                <FormattedMessage
                                    id='Apis.Details.Policies.PolicyForm.Editor.Test.MocksEditor.matchType'
                                    defaultMessage='Match type'
                                />
                            )}
                            value={mock.matchType}
                            onChange={(e) => updateMock(index, { matchType: e.target.value as 'GLOB' | 'REGEX' })}
                            sx={{ flex: '0 0 130px' }}
                        >
                            <MenuItem value='GLOB'>GLOB</MenuItem>
                            <MenuItem value='REGEX'>REGEX</MenuItem>
                        </TextField>
                        <TextField
                            size='small'
                            label={(
                                <FormattedMessage
                                    id='Apis.Details.Policies.PolicyForm.Editor.Test.MocksEditor.method'
                                    defaultMessage='Method (any)'
                                />
                            )}
                            value={mock.method || ''}
                            onChange={(e) => updateMock(index, { method: e.target.value })}
                            sx={{ flex: '0 0 140px' }}
                        />
                    </Box>
                    {/* Row 2: status/delay/content-type + delete, each with a sane minimum width
                        so the value is always legible instead of clipping to "S..."/"D...". */}
                    <Box sx={{
                        display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center',
                    }}
                    >
                        <TextField
                            size='small'
                            type='number'
                            label={(
                                <FormattedMessage
                                    id='Apis.Details.Policies.PolicyForm.Editor.Test.MocksEditor.status'
                                    defaultMessage='Status'
                                />
                            )}
                            value={mock.status}
                            onChange={(e) => updateMock(index, { status: Number(e.target.value) })}
                            data-testid={`test-panel-mock-status-${index}`}
                            sx={{ flex: '0 0 110px', minWidth: 110 }}
                        />
                        <TextField
                            size='small'
                            type='number'
                            label={(
                                <FormattedMessage
                                    id='Apis.Details.Policies.PolicyForm.Editor.Test.MocksEditor.delayMs'
                                    defaultMessage='Delay (ms)'
                                />
                            )}
                            value={mock.delayMs}
                            onChange={(e) => updateMock(index, { delayMs: Number(e.target.value) })}
                            sx={{ flex: '0 0 120px', minWidth: 120 }}
                        />
                        <TextField
                            size='small'
                            label={(
                                <FormattedMessage
                                    id='Apis.Details.Policies.PolicyForm.Editor.Test.MocksEditor.contentType'
                                    defaultMessage='Content type'
                                />
                            )}
                            value={mock.contentType}
                            onChange={(e) => updateMock(index, { contentType: e.target.value })}
                            sx={{ flex: '1 1 200px', minWidth: 160 }}
                        />
                        <IconButton
                            size='small'
                            onClick={() => removeMock(index)}
                            aria-label={`remove-mock-${index}`}
                        >
                            <DeleteIcon fontSize='small' />
                        </IconButton>
                    </Box>
                    <Grid container spacing={2} sx={{ mt: 0 }}>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                multiline
                                minRows={2}
                                maxRows={6}
                                size='small'
                                label={(
                                    <FormattedMessage
                                        id='Apis.Details.Policies.PolicyForm.Editor.Test.MocksEditor.body'
                                        defaultMessage='Response body'
                                    />
                                )}
                                value={mock.body}
                                onChange={(e) => updateMock(index, { body: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <Typography variant='caption' color='text.secondary'>
                                <FormattedMessage
                                    id='Apis.Details.Policies.PolicyForm.Editor.Test.MocksEditor.headers'
                                    defaultMessage='Response headers'
                                />
                            </Typography>
                            {Object.entries(mock.headers).map(([key, headerValue]) => (
                                <Grid container spacing={1} key={key} alignItems='center' sx={{ mt: 0.5 }}>
                                    <Grid item xs={5}>
                                        <TextField
                                            fullWidth
                                            size='small'
                                            placeholder='Header name'
                                            value={key}
                                            onChange={(e) => updateHeader(index, key, e.target.value, headerValue)}
                                        />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <TextField
                                            fullWidth
                                            size='small'
                                            placeholder='Value'
                                            value={headerValue}
                                            onChange={(e) => updateHeader(index, key, key, e.target.value)}
                                        />
                                    </Grid>
                                    <Grid item xs={1}>
                                        <IconButton size='small' onClick={() => removeHeader(index, key)}>
                                            <DeleteIcon fontSize='small' />
                                        </IconButton>
                                    </Grid>
                                </Grid>
                            ))}
                            <Button size='small' startIcon={<AddIcon />} onClick={() => addHeader(index)}>
                                <FormattedMessage
                                    id='Apis.Details.Policies.PolicyForm.Editor.Test.MocksEditor.addHeader'
                                    defaultMessage='Add header'
                                />
                            </Button>
                        </Grid>
                    </Grid>
                </Paper>
            ))}
        </Box>
    );
};

export default MocksEditor;
