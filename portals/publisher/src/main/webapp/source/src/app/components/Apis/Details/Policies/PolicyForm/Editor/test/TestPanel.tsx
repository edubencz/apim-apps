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

import React, {
    FC, useEffect, useMemo, useRef, useState, KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { FormattedMessage, useIntl } from 'react-intl';
import AttributeValuesForm from './AttributeValuesForm';
import SampleRequestEditor from './SampleRequestEditor';
import MocksEditor from './MocksEditor';
import TestResults from './TestResults';
import usePolicyTest from '../hooks/usePolicyTest';
import usePolicySandboxEnvironments from '../hooks/usePolicySandboxEnvironments';
import type {
    MockDefinition, PersistedTestInputs, PolicyTestResponse, SampleRequest,
} from './types';
import type { FlowNode } from '../types';
import type { PolicyAttribute } from '../../Types';

const DEFAULT_SAMPLE_REQUEST: SampleRequest = {
    method: 'GET',
    path: '/',
    headers: {},
    body: '',
    contentType: 'application/json',
};

interface TestPanelProps {
    policyDefinition: string;
    policyAttributes: PolicyAttribute[];
    detectedVariables: string[];
    flowNodes: FlowNode[];
    attributeValues: Record<string, any>;
    /** Unique key for sessionStorage persistence of the last test inputs for this policy draft */
    storageKey: string;
    onResult?: (response: PolicyTestResponse | null) => void;
    onSelectNode?: (nodeId: string) => void;
    onRevealLine?: (line: number) => void;
    /** Issue 3 (UX polish): fired the instant "Run test" is clicked, before the response comes
     * back - `PolicyEditorWorkspace` injects this (via `React.cloneElement`) to expand a
     * collapsed bottom panel immediately instead of waiting for the run to finish. */
    onRunStart?: () => void;
    /** Issue 3 (UX polish): `PolicyEditorWorkspace` injects this (via `React.cloneElement`) to
     * ask the panel to render only its own sticky toolbar - env selector, Run/Cancel button,
     * last-run status chip - which doubles as the "slim bar" collapsed view. The inputs/results
     * content below is `display: none`, not merely visually clipped, so it never intercepts
     * clicks meant for whatever sits above/below the collapsed panel. */
    collapsed?: boolean;
    /** Bumped by `PolicyEditorWorkspace` (via `React.cloneElement`) whenever the editor content
     * is replaced wholesale - applying a template, inserting a mediator, the "Unwrap root
     * <sequence>" quick-fix, or the explicit "Clear results" button. Any change in value (not the
     * initial one) fully discards the last run: response/error/isRunning and the stale flag. */
    resetSignal?: number;
    /** Reports whenever the last test result becomes stale (the editor content changed since that
     * run) or fresh again, so the caller can hide the diagram's trace overlay while still keeping
     * the results panel (with a warning banner) visible. */
    onStaleChange?: (stale: boolean) => void;
}

function loadPersisted(storageKey: string): PersistedTestInputs | null {
    try {
        const raw = window.sessionStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function savePersisted(storageKey: string, data: PersistedTestInputs) {
    try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(data));
    } catch (e) {
        // sessionStorage may be unavailable (private mode / quota) - persistence is best effort.
    }
}

const STATUS_CHIP_COLOR: Record<string, 'success' | 'info' | 'error' | 'warning' | 'default'> = {
    COMPLETED: 'success',
    RESPONDED: 'info',
    FAULT: 'error',
    DROPPED: 'warning',
    TIMEOUT: 'warning',
    ERROR: 'error',
};

/** Tab index for the narrow-screen "Inputs | Results" split - see Issue 1 in the UX polish pass. */
const INNER_TAB_INPUTS = 0;
const INNER_TAB_RESULTS = 1;

/**
 * The Fase 5 "Test" tab content: attribute values, sample request, mocks, extra (Synapse)
 * properties, a gateway environment select and a Run/Cancel button (Ctrl+Enter shortcut), wired
 * to {@link usePolicyTest}. Inputs are persisted to `sessionStorage` (best effort) so reopening
 * the workspace for the same policy draft keeps them.
 *
 * Issue 1 (UX polish, 2026-09-26): results used to render below the Run button inside the
 * (possibly scrolled) inputs column, so they were invisible without scrolling. The panel is now
 * split into a sticky top toolbar (env selector / Run-Cancel / last-run status chip - always
 * visible, never scrolls away) and a content area with two panes: "Inputs" and "Results". On
 * screens wide enough (`md` and up) both panes show side by side; on narrower screens they become
 * two inner tabs that auto-switch to "Results" as soon as a run finishes (success or failure), so
 * the status banner is visible without any scrolling either way.
 * @param {TestPanelProps} props Component props
 * @returns {TSX} The test panel
 */
const TestPanel: FC<TestPanelProps> = ({
    policyDefinition, policyAttributes, detectedVariables, flowNodes, attributeValues: specAttributeValues,
    storageKey, onResult, onSelectNode, onRevealLine, onRunStart, collapsed, resetSignal, onStaleChange,
}) => {
    const intl = useIntl();
    const theme = useTheme();
    const isWide = useMediaQuery(theme.breakpoints.up('md'));
    const persisted = useMemo(() => loadPersisted(storageKey), [storageKey]);
    // Pendência #2: only auto-prefill the sample body on a genuinely fresh draft, never overriding
    // a value the user (or a previous session) already set.
    const autoPrefillBody = !persisted;
    const [attributeValues, setAttributeValues] = useState<Record<string, any>>(
        persisted?.attributeValues || specAttributeValues || {},
    );
    const [sampleRequest, setSampleRequest] = useState<SampleRequest>(
        persisted?.sampleRequest || DEFAULT_SAMPLE_REQUEST,
    );
    const [mocks, setMocks] = useState<MockDefinition[]>(persisted?.mocks || []);
    const [extraProperties, setExtraProperties] = useState<Record<string, string>>(
        persisted?.extraProperties || {},
    );
    const [gatewayEnvironment, setGatewayEnvironment] = useState<string | undefined>(
        persisted?.gatewayEnvironment,
    );
    const [innerTab, setInnerTab] = useState<number>(INNER_TAB_INPUTS);

    const {
        enabled: sandboxEnabled, environments, loading: environmentsLoading, isSupported: environmentsSupported,
    } = usePolicySandboxEnvironments();
    const {
        run, cancel, reset, isRunning, response, error,
    } = usePolicyTest();

    // Content-revision guard: bumped every time `policyDefinition` (the live editor content)
    // actually changes - including on every keystroke - so a run's result can be compared against
    // the content it was produced from. `runRevisionRef` captures that revision the moment "Run
    // test" fires; once they diverge, the last result is STALE (the code changed since that run)
    // rather than wrong, so it stays visible with a warning instead of being wiped.
    const [contentRevision, setContentRevision] = useState(0);
    const prevPolicyDefinitionRef = useRef(policyDefinition);
    useEffect(() => {
        if (policyDefinition !== prevPolicyDefinitionRef.current) {
            prevPolicyDefinitionRef.current = policyDefinition;
            setContentRevision((r) => r + 1);
        }
    }, [policyDefinition]);
    const runRevisionRef = useRef<number | null>(null);
    const isStale = Boolean(response) && runRevisionRef.current !== null
        && runRevisionRef.current !== contentRevision;

    useEffect(() => {
        if (onStaleChange) onStaleChange(isStale);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isStale]);

    // Bumped by `PolicyEditorWorkspace` on template apply / mediator insert / unwrap / the
    // explicit "Clear results" button - a full reset, not just a stale flag: the last run is
    // discarded entirely (also discards any in-flight request via `reset()`'s request-id bump).
    const prevResetSignalRef = useRef(resetSignal);
    useEffect(() => {
        if (resetSignal !== undefined && resetSignal !== prevResetSignalRef.current) {
            prevResetSignalRef.current = resetSignal;
            reset();
            runRevisionRef.current = null;
            setInnerTab(INNER_TAB_INPUTS);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetSignal]);

    useEffect(() => {
        if (!gatewayEnvironment && environments.length > 0) {
            setGatewayEnvironment(environments[0].name);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [environments]);

    useEffect(() => {
        savePersisted(storageKey, {
            attributeValues, sampleRequest, mocks, extraProperties, gatewayEnvironment,
        });
    }, [storageKey, attributeValues, sampleRequest, mocks, extraProperties, gatewayEnvironment]);

    useEffect(() => {
        if (onResult) onResult(response);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [response]);

    // Issue 1: as soon as a run settles (a response OR an error came back), auto-switch the
    // narrow-screen tabs to "Results" so the status banner is visible without scrolling. Does
    // nothing on wide screens, where both panes are already shown side by side.
    useEffect(() => {
        if (response || error) {
            setInnerTab(INNER_TAB_RESULTS);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [response, error]);

    const handleAttributeChange = (name: string, value: any) => {
        setAttributeValues((prev) => ({ ...prev, [name]: value }));
    };

    const handleRun = () => {
        if (isRunning) return;
        if (onRunStart) onRunStart();
        // Capture the content revision this run is *about to* test - once the response settles,
        // comparing this against the (possibly since-advanced) `contentRevision` is what drives
        // `isStale`. Re-running always re-captures it, clearing any previous stale flag.
        runRevisionRef.current = contentRevision;
        run({
            policyDefinition,
            attributeValues,
            sampleRequest,
            mocks,
            extraProperties,
            gatewayEnvironment,
        });
    };

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            handleRun();
        }
    };

    const extraPropertyEntries = Object.entries(extraProperties);
    const updateExtraPropertyKey = (index: number, newKey: string) => {
        const entries = [...extraPropertyEntries];
        entries[index] = [newKey, entries[index][1]];
        setExtraProperties(Object.fromEntries(entries));
    };
    const updateExtraPropertyValue = (index: number, newValue: string) => {
        const entries = [...extraPropertyEntries];
        entries[index] = [entries[index][0], newValue];
        setExtraProperties(Object.fromEntries(entries));
    };
    const addExtraProperty = () => setExtraProperties({ ...extraProperties, '': '' });
    const removeExtraProperty = (index: number) => {
        setExtraProperties(Object.fromEntries(extraPropertyEntries.filter((_, i) => i !== index)));
    };

    const lastRunStatus = response?.execution?.status;
    const lastRunStatusLabel = isRunning
        ? intl.formatMessage({
            id: 'Apis.Details.Policies.PolicyForm.Editor.Test.TestPanel.status.running',
            defaultMessage: 'Running...',
        })
        : lastRunStatus || (error
            ? intl.formatMessage({
                id: 'Apis.Details.Policies.PolicyForm.Editor.Test.TestPanel.status.error',
                defaultMessage: 'Error',
            })
            : intl.formatMessage({
                id: 'Apis.Details.Policies.PolicyForm.Editor.Test.TestPanel.status.noRuns',
                defaultMessage: 'No runs yet',
            }));
    const lastRunStatusColor = isRunning || isStale
        ? 'default'
        : (lastRunStatus && STATUS_CHIP_COLOR[lastRunStatus]) || (error ? 'error' : 'default');

    const inputsPane = (
        <Box
            sx={{
                flex: isWide ? '0 0 45%' : '1 1 auto', minWidth: 0, height: '100%', overflowY: 'auto', p: 2,
            }}
            data-testid='test-panel-inputs-pane'
            hidden={!isWide && innerTab !== INNER_TAB_INPUTS}
        >
            {environmentsSupported && !environmentsLoading && !sandboxEnabled && (
                <Alert severity='info' sx={{ mb: 2 }} data-testid='test-panel-sandbox-disabled'>
                    <FormattedMessage
                        id='Apis.Details.Policies.PolicyForm.Editor.Test.TestPanel.sandbox.disabled'
                        defaultMessage={'No sandbox-capable Gateway environment is available. Ask an '
                            + 'administrator to configure the policy sandbox (apim.policy_sandbox) on at '
                            + 'least one environment.'}
                    />
                </Alert>
            )}

            <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant='overline' sx={{ letterSpacing: 0.6, color: 'text.secondary' }}>
                        <FormattedMessage
                            id='Apis.Details.Policies.PolicyForm.Editor.Test.TestPanel.section.attributes'
                            defaultMessage='Attribute values'
                        />
                    </Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <AttributeValuesForm
                        policyAttributes={policyAttributes}
                        extraVariables={detectedVariables}
                        attributeValues={attributeValues}
                        onChange={handleAttributeChange}
                    />
                </AccordionDetails>
            </Accordion>

            <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant='overline' sx={{ letterSpacing: 0.6, color: 'text.secondary' }}>
                        <FormattedMessage
                            id='Apis.Details.Policies.PolicyForm.Editor.Test.TestPanel.section.sampleRequest'
                            defaultMessage='Sample request'
                        />
                    </Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <SampleRequestEditor
                    value={sampleRequest}
                    onChange={setSampleRequest}
                    autoPrefillBody={autoPrefillBody}
                />
                </AccordionDetails>
            </Accordion>

            <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant='overline' sx={{ letterSpacing: 0.6, color: 'text.secondary' }}>
                        <FormattedMessage
                            id='Apis.Details.Policies.PolicyForm.Editor.Test.TestPanel.section.mocks'
                            defaultMessage='Mocks'
                        />
                    </Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <MocksEditor
                        value={mocks}
                        onChange={setMocks}
                        flowNodes={flowNodes}
                        attributeValues={attributeValues}
                    />
                </AccordionDetails>
            </Accordion>

            <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant='overline' sx={{ letterSpacing: 0.6, color: 'text.secondary' }}>
                        <FormattedMessage
                            id='Apis.Details.Policies.PolicyForm.Editor.Test.TestPanel.section.advanced'
                            defaultMessage='Advanced: extra properties'
                        />
                    </Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mb: 1 }}>
                        <FormattedMessage
                            id='Apis.Details.Policies.PolicyForm.Editor.Test.TestPanel.extraProperties.hint'
                            defaultMessage={'Synapse (default scope) properties to set before the policy runs, '
                                + "e.g. api.ut.userName - useful to simulate auth context the sandbox doesn't have."}
                        />
                    </Typography>
                    {extraPropertyEntries.map(([key, value], index) => (
                        <Grid container spacing={1} key={key} alignItems='center' sx={{ mb: 1 }}>
                            <Grid item xs={5}>
                                <TextField
                                    fullWidth
                                    size='small'
                                    placeholder='Property name'
                                    value={key}
                                    onChange={(e) => updateExtraPropertyKey(index, e.target.value)}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField
                                    fullWidth
                                    size='small'
                                    placeholder='Value'
                                    value={value}
                                    onChange={(e) => updateExtraPropertyValue(index, e.target.value)}
                                />
                            </Grid>
                            <Grid item xs={1}>
                                <Button size='small' onClick={() => removeExtraProperty(index)}>×</Button>
                            </Grid>
                        </Grid>
                    ))}
                    <Button size='small' onClick={addExtraProperty}>
                        <FormattedMessage
                            id='Apis.Details.Policies.PolicyForm.Editor.Test.TestPanel.extraProperties.add'
                            defaultMessage='Add property'
                        />
                    </Button>
                </AccordionDetails>
            </Accordion>
        </Box>
    );

    const resultsPane = (
        <Box
            sx={{
                flex: isWide ? '1 1 55%' : '1 1 auto',
                minWidth: 0,
                height: '100%',
                overflowY: 'auto',
                p: 2,
                borderLeft: isWide ? 1 : 0,
                borderColor: 'divider',
            }}
            data-testid='test-panel-results-pane'
            hidden={!isWide && innerTab !== INNER_TAB_RESULTS}
        >
            <TestResults
                response={response}
                testError={error}
                isRunning={isRunning}
                isStale={isStale}
                onSelectNode={onSelectNode}
                onRevealLine={onRevealLine}
            />
        </Box>
    );

    return (
        <Box
            sx={{
                display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
            }}
            onKeyDown={handleKeyDown}
            data-testid='test-panel'
        >
            {/* Issue 1: sticky toolbar - Run/Cancel, env selector and the last-run status chip stay
                visible at all times, regardless of how the inputs/results panes are scrolled. */}
            <Box
                sx={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    bgcolor: 'background.paper',
                    borderBottom: 1,
                    borderColor: 'divider',
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 2,
                    p: 1.5,
                }}
                data-testid='test-panel-toolbar'
            >
                {environments.length > 1 && (
                    <TextField
                        select
                        size='small'
                        label={intl.formatMessage({
                            id: 'Apis.Details.Policies.PolicyForm.Editor.Test.TestPanel.gatewayEnvironment',
                            defaultMessage: 'Gateway environment',
                        })}
                        value={gatewayEnvironment || ''}
                        onChange={(e) => setGatewayEnvironment(e.target.value)}
                        sx={{ minWidth: 220 }}
                        data-testid='test-panel-gateway-environment'
                    >
                        {environments.map((env) => (
                            <MenuItem key={env.name} value={env.name}>{env.displayName}</MenuItem>
                        ))}
                    </TextField>
                )}
                <Button
                    variant='contained'
                    color='primary'
                    startIcon={<PlayArrowIcon />}
                    onClick={handleRun}
                    disabled={isRunning}
                    data-testid='test-panel-run-btn'
                >
                    <FormattedMessage
                        id='Apis.Details.Policies.PolicyForm.Editor.Test.TestPanel.run'
                        defaultMessage='Run test'
                    />
                </Button>
                {isRunning && (
                    <Button
                        variant='outlined'
                        startIcon={<StopIcon />}
                        onClick={cancel}
                        data-testid='test-panel-cancel-btn'
                    >
                        <FormattedMessage
                            id='Apis.Details.Policies.PolicyForm.Editor.Test.TestPanel.cancel'
                            defaultMessage='Cancel'
                        />
                    </Button>
                )}
                {isRunning && <CircularProgress size={20} />}
                <Chip
                    size='small'
                    color={lastRunStatusColor}
                    label={lastRunStatusLabel}
                    data-testid='test-panel-last-run-status'
                    sx={{ ml: isWide ? 'auto' : 0 }}
                />
                {!isWide && (
                    <Tabs
                        value={innerTab}
                        onChange={(_e, v) => setInnerTab(v)}
                        sx={{ minHeight: 32, width: '100%' }}
                        data-testid='test-panel-inner-tabs'
                    >
                        <Tab
                            value={INNER_TAB_INPUTS}
                            label={intl.formatMessage({
                                id: 'Apis.Details.Policies.PolicyForm.Editor.Test.TestPanel.tab.inputs',
                                defaultMessage: 'Inputs',
                            })}
                            data-testid='test-panel-inner-tab-inputs'
                        />
                        <Tab
                            value={INNER_TAB_RESULTS}
                            label={intl.formatMessage({
                                id: 'Apis.Details.Policies.PolicyForm.Editor.Test.TestPanel.tab.results',
                                defaultMessage: 'Results',
                            })}
                            data-testid='test-panel-inner-tab-results'
                        />
                    </Tabs>
                )}
            </Box>

            {/* Issue 3: `display: none` (not just a clipped-height ancestor) when the panel is
                collapsed - genuinely out of layout/hit-testing, so it never intercepts clicks
                meant for the sticky toolbar above or anything below the panel. */}
            <Box
                sx={{
                    flex: 1,
                    minHeight: 0,
                    display: collapsed ? 'none' : 'flex',
                    flexDirection: isWide ? 'row' : 'column',
                    overflow: 'hidden',
                }}
                data-testid='test-panel-content'
            >
                {inputsPane}
                {resultsPane}
            </Box>
        </Box>
    );
};

export default TestPanel;
