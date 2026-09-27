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

import React, { FC } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import * as monaco from 'monaco-editor';
import { Editor, loader } from '@monaco-editor/react';
import { FormattedMessage } from 'react-intl';
import type { SampleRequest } from './types';

loader.config({ monaco });

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

interface SampleRequestEditorProps {
    value: SampleRequest;
    onChange: (value: SampleRequest) => void;
    /** Pendência #2 (UX polish): when true and the body is still empty, switching the method to
     * POST/PUT/PATCH prefills `{}` + `application/json` so a first run doesn't silently send an
     * empty body. Gated by the caller to only the very first open of a fresh (non-persisted) draft. */
    autoPrefillBody?: boolean;
}

/**
 * Picks a Monaco language id for the body editor based on the sample request's content type, so
 * JSON/XML bodies get basic syntax highlighting.
 * @param {string} contentType The current `Content-Type` value
 * @returns {string} A Monaco language id
 */
function bodyLanguage(contentType: string): string {
    if (contentType.includes('json')) return 'json';
    if (contentType.includes('xml')) return 'xml';
    return 'plaintext';
}

/**
 * The "sample request" the sandbox will run the policy against: HTTP method, request path
 * (including query string), a headers key/value table, content type and a small Monaco body
 * editor whose language follows the content type.
 * @param {SampleRequestEditorProps} props Component props
 * @returns {TSX} The sample request editor
 */
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

const SampleRequestEditor: FC<SampleRequestEditorProps> = ({ value, onChange, autoPrefillBody }) => {
    const headerEntries = Object.entries(value.headers || {});

    const handleMethodChange = (newMethod: string) => {
        if (autoPrefillBody && BODY_METHODS.has(newMethod) && !value.body.trim()) {
            onChange({
                ...value, method: newMethod, body: '{}', contentType: 'application/json',
            });
            return;
        }
        onChange({ ...value, method: newMethod });
    };

    const updateHeaderKey = (index: number, newKey: string) => {
        const entries = [...headerEntries];
        entries[index] = [newKey, entries[index][1]];
        onChange({ ...value, headers: Object.fromEntries(entries) });
    };
    const updateHeaderValue = (index: number, newValue: string) => {
        const entries = [...headerEntries];
        entries[index] = [entries[index][0], newValue];
        onChange({ ...value, headers: Object.fromEntries(entries) });
    };
    const removeHeader = (index: number) => {
        const entries = headerEntries.filter((_, i) => i !== index);
        onChange({ ...value, headers: Object.fromEntries(entries) });
    };
    const addHeader = () => {
        onChange({ ...value, headers: { ...value.headers, '': '' } });
    };

    return (
        <Box data-testid='test-panel-sample-request-editor'>
            <Grid container spacing={2}>
                <Grid item xs={3} sm={2}>
                    <TextField
                        select
                        fullWidth
                        size='small'
                        label={(
                            <FormattedMessage
                                id='Apis.Details.Policies.PolicyForm.Editor.Test.SampleRequestEditor.method'
                                defaultMessage='Method'
                            />
                        )}
                        value={value.method}
                        onChange={(e) => handleMethodChange(e.target.value)}
                        data-testid='test-panel-sample-request-method'
                    >
                        {HTTP_METHODS.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                    </TextField>
                </Grid>
                <Grid item xs={9} sm={6}>
                    <TextField
                        fullWidth
                        size='small'
                        label={(
                            <FormattedMessage
                                id='Apis.Details.Policies.PolicyForm.Editor.Test.SampleRequestEditor.path'
                                defaultMessage='Path'
                            />
                        )}
                        placeholder='/orders/1?x=y'
                        value={value.path}
                        onChange={(e) => onChange({ ...value, path: e.target.value })}
                        data-testid='test-panel-sample-request-path'
                    />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <TextField
                        fullWidth
                        size='small'
                        label={(
                            <FormattedMessage
                                id='Apis.Details.Policies.PolicyForm.Editor.Test.SampleRequestEditor.contentType'
                                defaultMessage='Content type'
                            />
                        )}
                        value={value.contentType}
                        onChange={(e) => onChange({ ...value, contentType: e.target.value })}
                        data-testid='test-panel-sample-request-content-type'
                    />
                </Grid>
            </Grid>

            <Typography variant='subtitle2' sx={{ mt: 2, mb: 1 }}>
                <FormattedMessage
                    id='Apis.Details.Policies.PolicyForm.Editor.Test.SampleRequestEditor.headers'
                    defaultMessage='Headers'
                />
            </Typography>
            {headerEntries.map(([key, headerValue], index) => (
                // eslint-disable-next-line react/no-array-index-key
                <Grid container spacing={1} key={index} alignItems='center' sx={{ mb: 1 }}>
                    <Grid item xs={5}>
                        <TextField
                            fullWidth
                            size='small'
                            placeholder='Header name'
                            value={key}
                            onChange={(e) => updateHeaderKey(index, e.target.value)}
                            data-testid={`test-panel-header-key-${index}`}
                        />
                    </Grid>
                    <Grid item xs={6}>
                        <TextField
                            fullWidth
                            size='small'
                            placeholder='Value'
                            value={headerValue}
                            onChange={(e) => updateHeaderValue(index, e.target.value)}
                            data-testid={`test-panel-header-value-${index}`}
                        />
                    </Grid>
                    <Grid item xs={1}>
                        <IconButton
                            size='small'
                            onClick={() => removeHeader(index)}
                            aria-label={`remove-header-${index}`}
                        >
                            <DeleteIcon fontSize='small' />
                        </IconButton>
                    </Grid>
                </Grid>
            ))}
            <Button size='small' startIcon={<AddIcon />} onClick={addHeader} data-testid='test-panel-add-header'>
                <FormattedMessage
                    id='Apis.Details.Policies.PolicyForm.Editor.Test.SampleRequestEditor.addHeader'
                    defaultMessage='Add header'
                />
            </Button>

            <Typography variant='subtitle2' sx={{ mt: 2, mb: 1 }}>
                <FormattedMessage
                    id='Apis.Details.Policies.PolicyForm.Editor.Test.SampleRequestEditor.body'
                    defaultMessage='Body'
                />
            </Typography>
            <Paper variant='outlined' sx={{ height: 160 }}>
                <Editor
                    height='100%'
                    language={bodyLanguage(value.contentType || '')}
                    value={value.body}
                    onChange={(newValue) => onChange({ ...value, body: newValue || '' })}
                    theme='light'
                    options={{
                        minimap: { enabled: false },
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        tabSize: 2,
                    }}
                />
            </Paper>
        </Box>
    );
};

export default SampleRequestEditor;
