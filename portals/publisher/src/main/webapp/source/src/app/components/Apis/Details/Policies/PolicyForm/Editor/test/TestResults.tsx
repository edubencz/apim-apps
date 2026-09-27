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

import React, { FC, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import PlayCircleOutlineRounded from '@mui/icons-material/PlayCircleOutlineRounded';
import * as monaco from 'monaco-editor';
import { Editor, loader } from '@monaco-editor/react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { PolicyTestError } from '../hooks/usePolicyTest';
import type { PolicyTestResponse } from './types';

loader.config({ monaco });

interface TestResultsProps {
    response: PolicyTestResponse | null;
    testError: PolicyTestError | null;
    isRunning: boolean;
    /** True when the editor content has changed since `response` was produced (see
     * `usePolicyTest`/`TestPanel`'s content-revision guard). The result is still shown (it isn't
     * wrong, just out of date), but with a warning banner instead of the diagram trace overlay. */
    isStale?: boolean;
    onSelectNode?: (nodeId: string) => void;
    onRevealLine?: (line: number) => void;
}

const STATUS_COLOR: Record<string, 'success' | 'info' | 'error' | 'warning'> = {
    COMPLETED: 'success',
    RESPONDED: 'info',
    FAULT: 'error',
    DROPPED: 'warning',
    TIMEOUT: 'warning',
    ERROR: 'error',
};

function tryPrettyPrint(body: string | undefined, contentType: string | undefined): string {
    if (!body) return '';
    if (contentType && contentType.includes('json')) {
        try {
            return JSON.stringify(JSON.parse(body), null, 2);
        } catch (e) {
            return body;
        }
    }
    return body;
}

/**
 * Renders a `name: value` key/value table with an optional client-side filter, used by the
 * Properties tab's three sub-sections (synapse/axis2/transport).
 */
const KeyValueTable: FC<{ title: string; data?: Record<string, string> }> = ({ title, data }) => {
    const [filter, setFilter] = useState('');
    const entries = Object.entries(data || {}).filter(
        ([key, value]) => !filter
            || key.toLowerCase().includes(filter.toLowerCase())
            || String(value).toLowerCase().includes(filter.toLowerCase()),
    );
    return (
        <Box sx={{ mb: 2 }}>
            <Typography variant='subtitle2'>{title}</Typography>
            {entries.length === 0 ? (
                <Typography variant='body2' color='text.secondary'>-</Typography>
            ) : (
                <Table size='small'>
                    <TableBody>
                        {entries.map(([key, value]) => (
                            <TableRow key={key}>
                                <TableCell sx={{ fontWeight: 600, width: '35%' }}>{key}</TableCell>
                                <TableCell sx={{ wordBreak: 'break-all' }}>{value}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
            {Object.keys(data || {}).length > 5 && (
                <TextField
                    size='small'
                    placeholder='Filter...'
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    sx={{ mt: 1 }}
                />
            )}
        </Box>
    );
};

/**
 * Displays the outcome of a `POST /operation-policies/test` call: a status banner, and (when an
 * `execution` was returned) tabs for the client response, final message, synapse/axis2/transport
 * properties, logs, trace, outbound (mocked) calls and the rendered XML - or, when the render
 * itself failed (no `execution`), just the render errors/warnings so the run "short-circuits"
 * without pretending anything executed.
 * @param {TestResultsProps} props Component props
 * @returns {TSX} The results panel, or null when there is nothing to show yet
 */
const TestResults: FC<TestResultsProps> = ({
    response, testError, isRunning, isStale, onSelectNode, onRevealLine,
}) => {
    const intl = useIntl();
    const [tab, setTab] = useState(0);
    const execution = response?.execution;
    const hasRenderErrors = Boolean(response && response.errors && response.errors.length > 0 && !execution);

    const clientResponseBody = useMemo(
        () => tryPrettyPrint(
            execution?.clientResponse?.body,
            execution?.clientResponse?.headers?.['Content-Type'],
        ),
        [execution],
    );
    const finalMessageBody = useMemo(
        () => tryPrettyPrint(execution?.finalMessage?.payload, execution?.finalMessage?.contentType),
        [execution],
    );

    if (isRunning) {
        return (
            <Box sx={{ p: 2 }} data-testid='test-results-running'>
                <Typography variant='body2'>
                    <FormattedMessage
                        id='Apis.Details.Policies.PolicyForm.Editor.Test.TestResults.running'
                        defaultMessage='Running the policy on the sandbox...'
                    />
                </Typography>
            </Box>
        );
    }

    if (testError) {
        return (
            <Box sx={{ p: 2 }} data-testid='test-results-error'>
                <Alert severity='error'>{testError.message}</Alert>
            </Box>
        );
    }

    if (!response) {
        // Issue 3 (UX polish): a compact, centered empty state instead of a big blank area, so a
        // freshly opened Test tab doesn't look broken before the first run.
        return (
            <Box
                sx={{
                    height: '100%',
                    minHeight: 160,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                    color: 'text.secondary',
                    textAlign: 'center',
                    px: 3,
                }}
                data-testid='test-results-empty-state'
            >
                <PlayCircleOutlineRounded sx={{ width: 32, height: 32, opacity: 0.4 }} />
                <Typography variant='body2'>
                    <FormattedMessage
                        id='Apis.Details.Policies.PolicyForm.Editor.Test.TestResults.empty'
                        defaultMessage='Run the test to see the client response, trace and logs'
                    />
                </Typography>
            </Box>
        );
    }

    const statusLabel = execution?.status;
    const durationMs = execution?.durationMs;
    const viewInDiagramNodeId = execution?.fault?.nodeId
        || (execution?.trace && execution.trace.length > 0 ? execution.trace[execution.trace.length - 1].nodeId : undefined);

    return (
        <Box data-testid='test-results'>
            {isStale && (
                <Alert severity='warning' sx={{ mb: 1 }} data-testid='test-results-stale-banner'>
                    <FormattedMessage
                        id='Apis.Details.Policies.PolicyForm.Editor.Test.TestResults.stale.banner'
                        defaultMessage='Outdated - the code changed since this run. Run the test again.'
                    />
                </Alert>
            )}
            {statusLabel && (
                <Alert
                    severity={STATUS_COLOR[statusLabel] || 'info'}
                    sx={{ mb: 1 }}
                    data-testid={`test-results-status-${statusLabel}`}
                    action={onSelectNode && viewInDiagramNodeId ? (
                        <Button
                            size='small'
                            color='inherit'
                            onClick={() => onSelectNode(viewInDiagramNodeId)}
                            data-testid='test-results-view-in-diagram'
                        >
                            <FormattedMessage
                                id='Apis.Details.Policies.PolicyForm.Editor.Test.TestResults.viewInDiagram'
                                defaultMessage='View in diagram'
                            />
                        </Button>
                    ) : undefined}
                >
                    {statusLabel === 'RESPONDED' && execution?.trace && execution.trace.length > 0 && (
                        <FormattedMessage
                            id='Apis.Details.Policies.PolicyForm.Editor.Test.TestResults.status.responded'
                            defaultMessage='Policy responded early at node {nodeId}'
                            values={{ nodeId: execution.trace[execution.trace.length - 1].nodeId }}
                        />
                    )}
                    {statusLabel === 'FAULT' && (
                        <FormattedMessage
                            id='Apis.Details.Policies.PolicyForm.Editor.Test.TestResults.status.fault'
                            defaultMessage='Fault {code}: {message} (node {nodeId})'
                            values={{
                                code: execution?.fault?.code || '',
                                message: execution?.fault?.message || '',
                                nodeId: execution?.fault?.nodeId || '?',
                            }}
                        />
                    )}
                    {(statusLabel === 'COMPLETED' || statusLabel === 'DROPPED'
                        || statusLabel === 'TIMEOUT' || statusLabel === 'ERROR') && (
                        <FormattedMessage
                            id='Apis.Details.Policies.PolicyForm.Editor.Test.TestResults.status.generic'
                            defaultMessage='Status: {status}'
                            values={{ status: statusLabel }}
                        />
                    )}
                    {typeof durationMs === 'number' && ` (${durationMs} ms)`}
                </Alert>
            )}

            {hasRenderErrors && (
                <Alert severity='error' sx={{ mb: 1 }}>
                    <FormattedMessage
                        id='Apis.Details.Policies.PolicyForm.Editor.Test.TestResults.renderErrors'
                        defaultMessage='The policy could not be rendered - fix the errors below and try again.'
                    />
                </Alert>
            )}

            {execution && (
                <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant='scrollable' scrollButtons='auto'>
                    <Tab label={intl.formatMessage({
                        id: 'Apis.Details.Policies.PolicyForm.Editor.Test.TestResults.tab.clientResponse',
                        defaultMessage: 'Client response',
                    })}
                    />
                    <Tab label={intl.formatMessage({
                        id: 'Apis.Details.Policies.PolicyForm.Editor.Test.TestResults.tab.finalMessage',
                        defaultMessage: 'Final message',
                    })}
                    />
                    <Tab label={intl.formatMessage({
                        id: 'Apis.Details.Policies.PolicyForm.Editor.Test.TestResults.tab.properties',
                        defaultMessage: 'Properties',
                    })}
                    />
                    <Tab label={intl.formatMessage({
                        id: 'Apis.Details.Policies.PolicyForm.Editor.Test.TestResults.tab.logs',
                        defaultMessage: 'Logs',
                    })}
                    />
                    <Tab label={intl.formatMessage({
                        id: 'Apis.Details.Policies.PolicyForm.Editor.Test.TestResults.tab.trace',
                        defaultMessage: 'Trace',
                    })}
                    />
                    <Tab label={intl.formatMessage({
                        id: 'Apis.Details.Policies.PolicyForm.Editor.Test.TestResults.tab.outboundCalls',
                        defaultMessage: 'Outbound calls',
                    })}
                    />
                    <Tab label={intl.formatMessage({
                        id: 'Apis.Details.Policies.PolicyForm.Editor.Test.TestResults.tab.renderedXml',
                        defaultMessage: 'Rendered XML',
                    })}
                    />
                    <Tab label={intl.formatMessage({
                        id: 'Apis.Details.Policies.PolicyForm.Editor.Test.TestResults.tab.warnings',
                        defaultMessage: 'Warnings/Errors',
                    })}
                    />
                </Tabs>
            )}

            {execution && tab === 0 && (
                <Box sx={{ p: 2 }} data-testid='test-results-client-response'>
                    {execution.clientResponse ? (
                        <>
                            <Typography variant='body2'>
                                Status:
                                {' '}
                                {execution.clientResponse.status}
                            </Typography>
                            <KeyValueTable title='Headers' data={execution.clientResponse.headers} />
                            <Paper variant='outlined' sx={{ height: 200 }}>
                                <Editor
                                    height='100%'
                                    language='json'
                                    value={clientResponseBody}
                                    theme='light'
                                    options={{ readOnly: true, minimap: { enabled: false } }}
                                />
                            </Paper>
                        </>
                    ) : (
                        <Typography variant='body2' color='text.secondary'>
                            <FormattedMessage
                                id='Apis.Details.Policies.PolicyForm.Editor.Test.TestResults.noClientResponse'
                                defaultMessage='The policy did not produce a client response (no <respond/> reached).'
                            />
                        </Typography>
                    )}
                </Box>
            )}

            {execution && tab === 1 && (
                <Box sx={{ p: 2 }} data-testid='test-results-final-message'>
                    {execution.finalMessage ? (
                        <>
                            <Typography variant='body2'>
                                {`Content type: ${execution.finalMessage.contentType || ''} - HTTP status: `
                                    + `${execution.finalMessage.httpStatus}`}
                            </Typography>
                            <KeyValueTable title='Headers' data={execution.finalMessage.headers} />
                            <Paper variant='outlined' sx={{ height: 200 }}>
                                <Editor
                                    height='100%'
                                    language='json'
                                    value={finalMessageBody}
                                    theme='light'
                                    options={{ readOnly: true, minimap: { enabled: false } }}
                                />
                            </Paper>
                        </>
                    ) : (
                        <Typography variant='body2' color='text.secondary'>-</Typography>
                    )}
                </Box>
            )}

            {execution && tab === 2 && (
                <Box sx={{ p: 2 }} data-testid='test-results-properties'>
                    <KeyValueTable title='Synapse' data={execution.properties?.synapse} />
                    <KeyValueTable title='Axis2' data={execution.properties?.axis2} />
                    <KeyValueTable title='Transport' data={execution.properties?.transport} />
                </Box>
            )}

            {execution && tab === 3 && (
                <Box sx={{ p: 2 }} data-testid='test-results-logs'>
                    <Table size='small'>
                        <TableHead>
                            <TableRow>
                                <TableCell>Time</TableCell>
                                <TableCell>Level</TableCell>
                                <TableCell>Node</TableCell>
                                <TableCell>Message</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {(execution.logs || []).map((log, index) => (
                                <TableRow
                                    // eslint-disable-next-line react/no-array-index-key
                                    key={index}
                                    hover
                                    onClick={() => onSelectNode && log.nodeId && onSelectNode(log.nodeId)}
                                    sx={{ cursor: onSelectNode ? 'pointer' : 'default' }}
                                    data-testid={`test-results-log-row-${index}`}
                                >
                                    <TableCell>{new Date(log.ts).toLocaleTimeString()}</TableCell>
                                    <TableCell>{log.level}</TableCell>
                                    <TableCell>{log.nodeId}</TableCell>
                                    <TableCell>{log.message}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Box>
            )}

            {execution && tab === 4 && (
                <Box sx={{ p: 2 }} data-testid='test-results-trace'>
                    <Table size='small'>
                        <TableHead>
                            <TableRow>
                                <TableCell>#</TableCell>
                                <TableCell>Node</TableCell>
                                <TableCell>Mediator</TableCell>
                                <TableCell>t (ms)</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {(execution.trace || []).map((entry) => (
                                <TableRow
                                    key={`${entry.order}-${entry.nodeId}`}
                                    hover
                                    onClick={() => onSelectNode && onSelectNode(entry.nodeId)}
                                    sx={{ cursor: onSelectNode ? 'pointer' : 'default' }}
                                    data-testid={`test-results-trace-row-${entry.order}`}
                                >
                                    <TableCell>{entry.order}</TableCell>
                                    <TableCell>{entry.nodeId}</TableCell>
                                    <TableCell>{entry.tag}</TableCell>
                                    <TableCell>{entry.tMs}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Box>
            )}

            {execution && tab === 5 && (
                <Box sx={{ p: 2 }} data-testid='test-results-outbound-calls'>
                    <Table size='small'>
                        <TableHead>
                            <TableRow>
                                <TableCell>Node</TableCell>
                                <TableCell>Method</TableCell>
                                <TableCell>URL</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Mocked</TableCell>
                                <TableCell>t (ms)</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {(execution.outboundCalls || []).map((call, index) => (
                                <TableRow
                                    // eslint-disable-next-line react/no-array-index-key
                                    key={index}
                                    hover
                                    onClick={() => onSelectNode && onSelectNode(call.nodeId)}
                                    sx={{ cursor: onSelectNode ? 'pointer' : 'default' }}
                                >
                                    <TableCell>{call.nodeId}</TableCell>
                                    <TableCell>{call.method}</TableCell>
                                    <TableCell sx={{ wordBreak: 'break-all' }}>{call.url}</TableCell>
                                    <TableCell>{call.status}</TableCell>
                                    <TableCell>
                                        {call.mocked ? (
                                            <Chip size='small' color='secondary' label={call.mockId || 'mocked'} />
                                        ) : (
                                            <Chip size='small' variant='outlined' label='real' />
                                        )}
                                    </TableCell>
                                    <TableCell>{call.durationMs}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Box>
            )}

            {execution && tab === 6 && (
                <Box sx={{ p: 2, height: 260 }} data-testid='test-results-rendered-xml'>
                    <Paper variant='outlined' sx={{ height: '100%' }}>
                        <Editor
                            height='100%'
                            language='xml'
                            value={response.renderedSequence || ''}
                            theme='light'
                            options={{ readOnly: true, minimap: { enabled: false } }}
                        />
                    </Paper>
                </Box>
            )}

            {((execution && tab === 7) || hasRenderErrors) && (
                <Box sx={{ p: 2 }} data-testid='test-results-warnings-errors'>
                    {(response.errors || []).length === 0 && (response.warnings || []).length === 0
                        && (execution?.warnings || []).length === 0 && (execution?.errors || []).length === 0 && (
                        <Typography variant='body2' color='text.secondary'>
                            <FormattedMessage
                                id='Apis.Details.Policies.PolicyForm.Editor.Test.TestResults.noIssues'
                                defaultMessage='No warnings or errors.'
                            />
                        </Typography>
                    )}
                    {(response.errors || []).map((err, index) => (
                        <Alert
                            // eslint-disable-next-line react/no-array-index-key
                            key={index}
                            severity={err.severity === 'warning' ? 'warning' : 'error'}
                            sx={{ mb: 1, cursor: onRevealLine ? 'pointer' : 'default' }}
                            onClick={() => onRevealLine && onRevealLine(err.line)}
                            data-testid={`test-results-render-error-${index}`}
                        >
                            {`Line ${err.line}: ${err.message}`}
                        </Alert>
                    ))}
                    {(response.warnings || []).map((warning, index) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <Alert key={index} severity='warning' sx={{ mb: 1 }}>{warning}</Alert>
                    ))}
                    {(execution?.warnings || []).map((warning, index) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <Alert key={index} severity='warning' sx={{ mb: 1 }}>{warning}</Alert>
                    ))}
                    {(execution?.errors || []).map((message, index) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <Alert key={index} severity='error' sx={{ mb: 1 }}>{message}</Alert>
                    ))}
                </Box>
            )}
        </Box>
    );
};

export default TestResults;
