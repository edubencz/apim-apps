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
    forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, MouseEvent as ReactMouseEvent,
} from 'react';
import Dialog from '@mui/material/Dialog';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemText from '@mui/material/ListItemText';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import SaveIcon from '@mui/icons-material/Save';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import BuildCircleOutlinedIcon from '@mui/icons-material/BuildCircleOutlined';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import ClearIcon from '@mui/icons-material/Clear';
import { FormattedMessage, useIntl } from 'react-intl';
import PolicyCodeEditor, { PolicyCodeEditorHandle } from './PolicyCodeEditor';
import FlowDiagram, { TraceEntry } from './diagram/FlowDiagram';
import MediatorPalette from './MediatorPalette';
import { STARTER_TEMPLATES } from './templates/starterTemplates';
import { MediatorSnippet } from './snippets/mediatorSnippets';
import { parseSynapseXml } from './parsing/parseSynapseXml';
import { usePolicyRender } from './hooks/usePolicyRender';
import { unwrapSequenceRoot } from './utils/unwrapSequenceRoot';
import {
    getDefaultBottomHeight, getMaxBottomHeight, getRunExpandBottomHeight, loadPersistedBottomCollapsed,
    loadPersistedBottomHeight, savePersistedBottomCollapsed, savePersistedBottomHeight,
} from './utils/bottomPanelHeight';
import type { FlowNode } from './types';

interface PolicyEditorWorkspaceProps {
    open: boolean;
    onClose: () => void;
    value: string;
    onChange: (value: string) => void;
    /** Names of the attributes already defined on this policy spec, e.g. from PolicyAttributes */
    attributeNames?: string[];
    attributeValues?: Record<string, any>;
    /** Wired to the PolicyCreateForm reducer's ADD_POLICY_ATTRIBUTE-style action */
    onAddAttribute?: (name: string) => void;
    /** Fase 5: the real Test panel content, rendered under a live (non-disabled) "Test" tab.
     * When omitted, the tab stays disabled (backend testing not available/enabled). */
    testPanel?: React.ReactNode;
    /** Tooltip shown on the disabled "Test" tab when `testPanel` is not provided, e.g. explaining
     * that the feature is disabled on the server. */
    testDisabledReason?: string;
    /** Fase 5 overlay props, threaded through for when the test panel starts producing traces */
    trace?: TraceEntry[];
    endedAtNodeId?: string;
    /** nodeId where a fault was raised - highlighted distinctly from `endedAtNodeId` */
    faultNodeId?: string;
    /** Fase 5: clears the trace/endedAtNodeId overlay (shown next to the diagram controls) */
    onClearResults?: () => void;
    /** Optional subtitle context shown under the "Policy Editor" title, e.g. the policy's name */
    policyName?: string;
    policyVersion?: string;
    /** When provided, shows a primary "Save policy" button in the header that saves the policy
     * directly from the editor via the same path as the form's Save button (create mode only -
     * omitted in view/duplicate-read-only contexts). */
    onSavePolicy?: () => void;
    /** Mirrors the form's `saving` state so the header Save button shows a spinner too. */
    saving?: boolean;
}

export interface PolicyEditorWorkspaceHandle {
    /** Selects `nodeId` on the diagram and reveals its source line in the editor, used by the
     * Fase 5 Test panel's Logs/Trace/Outbound-calls tabs. No-op if the node cannot be found. */
    revealNode: (nodeId: string) => void;
    /** Reveals a raw editor line (e.g. a render error), without touching diagram selection. */
    revealLine: (line: number) => void;
}

const MIN_LEFT_PERCENT = 20;
const MAX_LEFT_PERCENT = 80;
const MIN_BOTTOM_HEIGHT = 0;

/**
 * Recursively finds a `FlowNode` by its `nodeId` (see `Editor/CONTRACT.md`) across the whole
 * parsed tree, including branches (`then`/`else`/`case[i]`/...).
 * @param {FlowNode[]} nodes Nodes to search (top-level or a branch's nodes)
 * @param {string} nodeId The nodeId to find
 * @returns {FlowNode | null} The matching node, or null
 */
function findNodeById(nodes: FlowNode[], nodeId: string): FlowNode | null {
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.nodeId === nodeId) return node;
        if (node.branches) {
            for (let b = 0; b < node.branches.length; b++) {
                const found = findNodeById(node.branches[b].nodes, nodeId);
                if (found) return found;
            }
        }
    }
    return null;
}

/**
 * Full-screen editing workspace: a Monaco `.j2` editor on the left and a live SVG flow diagram on
 * the right (resizable via a draggable divider), with a toolbar for starter templates, the
 * mediator snippet palette and the root-`<sequence>` quick fix, a row of variable chips
 * ("add as attribute" / "unused attribute"), and a collapsed bottom slot reserved for the Fase 5
 * Test panel.
 * @param {PolicyEditorWorkspaceProps} props Component props
 * @returns {TSX} The rendered workspace dialog
 */
const PolicyEditorWorkspace = forwardRef((
    {
        open, onClose, value, onChange, attributeNames, attributeValues, onAddAttribute, testPanel,
        testDisabledReason, trace, endedAtNodeId, faultNodeId, onClearResults, policyName, policyVersion,
        onSavePolicy, saving,
    }: PolicyEditorWorkspaceProps,
    ref: React.Ref<PolicyEditorWorkspaceHandle>,
) => {
    const intl = useIntl();
    const editorHandleRef = useRef<PolicyCodeEditorHandle>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    // Issue 3 (UX polish): default to an even 50/50 split (was 55/45) so the diagram gets more
    // breathing room out of the box; the right (diagram) pane also gets a 380px min-width below.
    const [leftPercent, setLeftPercent] = useState(50);
    const [templatesAnchor, setTemplatesAnchor] = useState<HTMLElement | null>(null);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [bottomTab, setBottomTab] = useState(0);
    const [bottomHeight, setBottomHeight] = useState(
        () => loadPersistedBottomHeight() ?? getDefaultBottomHeight(),
    );
    // Issue 3: the Test panel now starts COLLAPSED (a slim bar) by default so the diagram/editor
    // above isn't squeezed to ~3 visible nodes - it expands only when the user asks for it
    // (the collapse toggle button) or triggers a test Run, and remembers that choice.
    const [bottomCollapsed, setBottomCollapsed] = useState(() => loadPersistedBottomCollapsed());
    const containerRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);
    const bottomDraggingRef = useRef(false);
    const lastBottomHeightRef = useRef(bottomHeight);

    const parseResult = useMemo(() => parseSynapseXml(value || ''), [value]);
    const render = usePolicyRender(value || '', attributeValues || {});

    // Design spec: never blank the canvas while the user is mid-edit with a syntax error - keep
    // showing the last known-valid diagram, dimmed, with a small banner pointing at the new error.
    const lastValidNodesRef = useRef<FlowNode[]>(parseResult.errors.length === 0 ? parseResult.nodes : []);
    useEffect(() => {
        if (parseResult.errors.length === 0) {
            lastValidNodesRef.current = parseResult.nodes;
        }
    }, [parseResult]);
    const hasErrors = parseResult.errors.length > 0;
    const diagramNodes = hasErrors && lastValidNodesRef.current.length > 0
        ? lastValidNodesRef.current
        : parseResult.nodes;
    const staleBanner = hasErrors && lastValidNodesRef.current.length > 0
        ? { line: parseResult.errors[0].line }
        : undefined;

    useImperativeHandle(ref, () => ({
        revealNode: (nodeId: string) => {
            const node = findNodeById(parseResult.nodes, nodeId);
            if (!node) return;
            setSelectedNodeId(node.nodeId);
            setBottomCollapsed(false);
            editorHandleRef.current?.revealLine(node.line);
        },
        revealLine: (line: number) => {
            setBottomCollapsed(false);
            editorHandleRef.current?.revealLine(line);
        },
    }), [parseResult.nodes]);

    const knownAttributeNames = useMemo(() => new Set(attributeNames || []), [attributeNames]);
    const missingAttributeChips = parseResult.detectedVariables.filter((v) => !knownAttributeNames.has(v));
    const unusedAttributeChips = (attributeNames || []).filter(
        (name) => !parseResult.detectedVariables.includes(name),
    );

    const handleNodeClick = (node: FlowNode) => {
        setSelectedNodeId(node.nodeId);
        editorHandleRef.current?.revealLine(node.line);
    };

    const handleCursorLineChange = (line: number) => {
        const findByLine = (nodes: FlowNode[]): FlowNode | null => {
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                if (node.line === line) return node;
                if (node.branches) {
                    for (let b = 0; b < node.branches.length; b++) {
                        const found = findByLine(node.branches[b].nodes);
                        if (found) return found;
                    }
                }
            }
            return null;
        };
        const match = findByLine(parseResult.nodes);
        setSelectedNodeId(match ? match.nodeId : null);
    };

    // Bumped on every action that replaces/mutates the editor content wholesale - applying a
    // template, inserting a mediator, the "Unwrap root <sequence>" quick-fix, and the explicit
    // "Clear results" button - so a stale/late test result never lingers on top of content it no
    // longer describes. Threaded into `testPanel` below (via `React.cloneElement`, same as
    // `onRunStart`/`collapsed`) so `TestPanel` fully discards its last run (response/error/isRunning
    // and any in-flight request) whenever it changes.
    const [resetSignal, setResetSignal] = useState(0);
    const triggerClearResults = () => {
        setResetSignal((prev) => prev + 1);
        if (onClearResults) onClearResults();
    };

    const applyTemplate = (content: string) => {
        if (value && value.trim() !== '') {
            // eslint-disable-next-line no-alert
            const confirmed = window.confirm(intl.formatMessage({
                id: 'Apis.Details.Policies.PolicyForm.Editor.PolicyEditorWorkspace.template.confirm',
                defaultMessage: 'This will replace the current editor content. Continue?',
            }));
            if (!confirmed) return;
        }
        onChange(content);
        triggerClearResults();
        setTemplatesAnchor(null);
    };

    const handleInsertSnippet = (snippet: MediatorSnippet) => {
        editorHandleRef.current?.insertSnippet(snippet.body);
        triggerClearResults();
    };

    const handleUnwrap = () => {
        onChange(unwrapSequenceRoot(value || ''));
        triggerClearResults();
    };

    const startDrag = () => {
        draggingRef.current = true;
        const handleMove = (event: MouseEvent) => {
            if (!draggingRef.current || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const percent = ((event.clientX - rect.left) / rect.width) * 100;
            setLeftPercent(Math.min(MAX_LEFT_PERCENT, Math.max(MIN_LEFT_PERCENT, percent)));
        };
        const handleUp = () => {
            draggingRef.current = false;
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
    };

    const startBottomDrag = () => {
        bottomDraggingRef.current = true;
        const maxBottomHeight = getMaxBottomHeight();
        const handleMove = (event: MouseEvent) => {
            if (!bottomDraggingRef.current) return;
            const newHeight = window.innerHeight - event.clientY;
            const clamped = Math.min(maxBottomHeight, Math.max(MIN_BOTTOM_HEIGHT, newHeight));
            lastBottomHeightRef.current = clamped;
            setBottomHeight(clamped);
            setBottomCollapsed(false);
        };
        const handleUp = () => {
            bottomDraggingRef.current = false;
            // Issue 1: remember the user's resize (sessionStorage, best effort) so reopening the
            // workspace keeps their preferred split instead of resetting to the 45% default.
            savePersistedBottomHeight(lastBottomHeightRef.current);
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
    };

    // Issue 3: when the panel is collapsed and the user clicks "Run test" inside `testPanel`
    // (built and owned by the caller, e.g. SourceDetails), expand it straight to ~40% instead of
    // waiting for the result - a collapsed panel would otherwise hide the running/last-status
    // chip the user just asked for. `testPanel` is cloned (not modified in place) so callers that
    // don't care about this never need to know it exists.
    const handleTestRunStart = () => {
        setBottomCollapsed((prevCollapsed) => {
            if (prevCollapsed) {
                setBottomHeight(getRunExpandBottomHeight());
                savePersistedBottomCollapsed(false);
            }
            return false;
        });
    };
    // Issue 3: `testPanel` stays mounted at all times (collapsed or not) so its own sticky
    // toolbar (env selector / Run / last-run status chip) IS the "slim bar" collapsed view - but
    // the inputs/results content below the toolbar is toggled with `display: none` (via the
    // `collapsed` prop), not just visually clipped by a fixed-height/overflow:hidden ancestor.
    // Clipping alone left the (still in-flow, still hit-testable) content intercepting clicks
    // meant for the toolbar above it; `display: none` removes it from layout and hit-testing
    // entirely, so a collapsed panel is genuinely just its toolbar, nothing more.
    const testPanelWithRunHook = testPanel && React.isValidElement(testPanel)
        ? React.cloneElement(testPanel as React.ReactElement<{
            onRunStart?: () => void; collapsed?: boolean; resetSignal?: number;
        }>, {
            onRunStart: () => {
                const existing = (testPanel.props as { onRunStart?: () => void }).onRunStart;
                if (existing) existing();
                handleTestRunStart();
            },
            collapsed: bottomCollapsed,
            resetSignal,
        })
        : testPanel;

    const toggleBottomCollapsed = () => {
        setBottomCollapsed((prev) => {
            const next = !prev;
            savePersistedBottomCollapsed(next);
            return next;
        });
    };

    const errorCount = parseResult.errors.length + render.remoteMarkers.filter(
        (m) => m.severity !== 'warning',
    ).length;
    const warningCount = render.warnings.length + render.remoteMarkers.filter(
        (m) => m.severity === 'warning',
    ).length;

    return (
        <Dialog fullScreen open={open} onClose={onClose} data-testid='policy-editor-workspace'>
            <AppBar position='static' color='default' elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Toolbar variant='dense'>
                    <Box sx={{ flexGrow: 1 }}>
                        <Typography variant='h6' sx={{ lineHeight: 1.2 }}>
                            <FormattedMessage
                                id='Apis.Details.Policies.PolicyForm.Editor.PolicyEditorWorkspace.title'
                                defaultMessage='Policy Editor'
                            />
                        </Typography>
                        {(policyName || policyVersion) && (
                            <Typography variant='caption' color='text.secondary'>
                                {[policyName, policyVersion].filter(Boolean).join(' · ')}
                            </Typography>
                        )}
                    </Box>
                    <Tooltip
                        title={intl.formatMessage({
                            id: 'Apis.Details.Policies.PolicyForm.Editor.PolicyEditorWorkspace'
                                + '.back.tooltip',
                            defaultMessage: 'Your code is kept',
                        })}
                    >
                        <Button
                            variant='outlined'
                            startIcon={<ArrowBackIcon />}
                            onClick={onClose}
                            aria-label='close-policy-editor-workspace'
                            data-testid='policy-editor-back-to-form-btn'
                            sx={{ mr: onSavePolicy ? 1 : 0 }}
                        >
                            <FormattedMessage
                                id='Apis.Details.Policies.PolicyForm.Editor.PolicyEditorWorkspace.back'
                                defaultMessage='Back to form'
                            />
                        </Button>
                    </Tooltip>
                    {onSavePolicy && (
                        <Button
                            variant='contained'
                            color='primary'
                            disableElevation
                            startIcon={saving ? undefined : <SaveIcon />}
                            onClick={onSavePolicy}
                            disabled={Boolean(saving)}
                            aria-label='save-policy-from-editor'
                            data-testid='policy-editor-save-policy-btn'
                        >
                            {saving ? (
                                <CircularProgress size={16} color='inherit' />
                            ) : (
                                <FormattedMessage
                                    id='Apis.Details.Policies.PolicyForm.Editor.PolicyEditorWorkspace.save'
                                    defaultMessage='Save policy'
                                />
                            )}
                        </Button>
                    )}
                </Toolbar>
                <Toolbar variant='dense' sx={{ gap: 1, flexWrap: 'wrap' }}>
                    <Button
                        size='small'
                        startIcon={<DescriptionOutlinedIcon />}
                        onClick={(e: ReactMouseEvent<HTMLElement>) => setTemplatesAnchor(e.currentTarget)}
                        data-testid='policy-editor-templates-btn'
                    >
                        <FormattedMessage
                            id='Apis.Details.Policies.PolicyForm.Editor.PolicyEditorWorkspace.templates'
                            defaultMessage='Templates'
                        />
                    </Button>
                    <Menu
                        anchorEl={templatesAnchor}
                        open={Boolean(templatesAnchor)}
                        onClose={() => setTemplatesAnchor(null)}
                        sx={{ zIndex: (theme) => theme.zIndex.modal + 10 }}
                    >
                        {STARTER_TEMPLATES.map((template) => (
                            <MenuItem key={template.id} onClick={() => applyTemplate(template.content)}>
                                <ListItemText primary={template.label} secondary={template.description} />
                            </MenuItem>
                        ))}
                    </Menu>
                    <Button
                        size='small'
                        startIcon={<ExtensionOutlinedIcon />}
                        onClick={() => setPaletteOpen((prev) => !prev)}
                        color={paletteOpen ? 'primary' : 'inherit'}
                        data-testid='policy-editor-palette-btn'
                    >
                        <FormattedMessage
                            id='Apis.Details.Policies.PolicyForm.Editor.PolicyEditorWorkspace.palette'
                            defaultMessage='Mediators'
                        />
                    </Button>
                    {parseResult.hasSequenceRoot && (
                        <Tooltip
                            title={intl.formatMessage({
                                id: 'Apis.Details.Policies.PolicyForm.Editor.PolicyEditorWorkspace.unwrap.tooltip',
                                defaultMessage: 'Removes the wrapping <sequence> element (it is added '
                                    + 'automatically at deploy time)',
                            })}
                        >
                            <Button
                                size='small'
                                color='warning'
                                startIcon={<BuildCircleOutlinedIcon />}
                                onClick={handleUnwrap}
                                data-testid='policy-editor-unwrap-btn'
                            >
                                <FormattedMessage
                                    id='Apis.Details.Policies.PolicyForm.Editor.PolicyEditorWorkspace.unwrap'
                                    defaultMessage='Unwrap root <sequence>'
                                />
                            </Button>
                        </Tooltip>
                    )}
                    <Box sx={{ flexGrow: 1 }} />
                    {errorCount > 0 && (
                        <Chip
                            size='small'
                            color='error'
                            label={intl.formatMessage(
                                {
                                    id: 'Apis.Details.Policies.PolicyForm.Editor.PolicyEditorWorkspace.errors',
                                    defaultMessage: '{count} error(s)',
                                },
                                { count: errorCount },
                            )}
                        />
                    )}
                    {warningCount > 0 && (
                        <Chip
                            size='small'
                            color='warning'
                            label={intl.formatMessage(
                                {
                                    id: 'Apis.Details.Policies.PolicyForm.Editor.PolicyEditorWorkspace.warnings',
                                    defaultMessage: '{count} warning(s)',
                                },
                                { count: warningCount },
                            )}
                        />
                    )}
                    {errorCount === 0 && warningCount === 0 && (
                        <Chip
                            size='small'
                            color='success'
                            label={intl.formatMessage({
                                id: 'Apis.Details.Policies.PolicyForm.Editor.PolicyEditorWorkspace.valid',
                                defaultMessage: 'No issues found',
                            })}
                        />
                    )}
                </Toolbar>
                {(missingAttributeChips.length > 0 || unusedAttributeChips.length > 0) && (
                    <Toolbar variant='dense' sx={{ gap: 1, flexWrap: 'wrap', minHeight: 40 }}>
                        {missingAttributeChips.map((name) => (
                            <Chip
                                key={`missing-${name}`}
                                size='small'
                                icon={<AddCircleOutlineIcon />}
                                label={intl.formatMessage(
                                    {
                                        id: 'Apis.Details.Policies.PolicyForm.Editor.PolicyEditorWorkspace'
                                            + '.chip.addAsAttribute',
                                        defaultMessage: 'Add "{name}" as attribute',
                                    },
                                    { name },
                                )}
                                onClick={() => onAddAttribute && onAddAttribute(name)}
                                data-testid={`variable-chip-add-${name}`}
                            />
                        ))}
                        {unusedAttributeChips.map((name) => (
                            <Chip
                                key={`unused-${name}`}
                                size='small'
                                color='default'
                                variant='outlined'
                                label={intl.formatMessage(
                                    {
                                        id: 'Apis.Details.Policies.PolicyForm.Editor.PolicyEditorWorkspace'
                                            + '.chip.unusedAttribute',
                                        defaultMessage: 'Unused attribute: {name}',
                                    },
                                    { name },
                                )}
                                data-testid={`variable-chip-unused-${name}`}
                            />
                        ))}
                    </Toolbar>
                )}
            </AppBar>
            <Box
                ref={containerRef}
                sx={{
                    display: 'flex', flexDirection: 'row', flexGrow: 1, height: 0, minHeight: 0,
                }}
            >
                <Box
                    sx={{
                        width: paletteOpen ? 260 : 0,
                        flexShrink: 0,
                        height: '100%',
                        overflow: 'hidden',
                        borderRight: paletteOpen ? 1 : 0,
                        borderColor: 'divider',
                        transition: 'width 0.15s ease',
                    }}
                    data-testid='policy-editor-palette-panel'
                >
                    {paletteOpen && (
                        <Box sx={{ width: 260, height: '100%' }}>
                            <MediatorPalette onInsert={handleInsertSnippet} />
                        </Box>
                    )}
                </Box>
                <Box
                    sx={{ width: `${leftPercent}%`, height: '100%', minWidth: 0 }}
                    data-testid='policy-editor-code-editor-pane'
                >
                    <PolicyCodeEditor
                        ref={editorHandleRef}
                        value={value || ''}
                        onChange={onChange}
                        localErrors={parseResult.errors}
                        remoteMarkers={render.remoteMarkers}
                        attributeNames={attributeNames}
                        onCursorLineChange={handleCursorLineChange}
                    />
                </Box>
                <Box
                    role='separator'
                    aria-orientation='vertical'
                    onMouseDown={startDrag}
                    sx={{
                        width: 6, cursor: 'col-resize', bgcolor: 'divider', '&:hover': { bgcolor: 'primary.main' },
                    }}
                />
                <Box sx={{ width: `${100 - leftPercent}%`, height: '100%', minWidth: 380 }}>
                    <FlowDiagram
                        nodes={diagramNodes}
                        selectedNodeId={selectedNodeId}
                        onNodeClick={handleNodeClick}
                        trace={trace}
                        endedAtNodeId={endedAtNodeId}
                        faultNodeId={faultNodeId}
                        staleBanner={staleBanner}
                    />
                </Box>
            </Box>
            <Box
                role='separator'
                aria-orientation='horizontal'
                onMouseDown={startBottomDrag}
                sx={{
                    height: 6, cursor: 'row-resize', bgcolor: 'divider', '&:hover': { bgcolor: 'primary.main' },
                }}
            />
            <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
                <Toolbar variant='dense' sx={{ minHeight: 40 }}>
                    <Tabs value={bottomTab} onChange={(_e, v) => setBottomTab(v)} sx={{ flexGrow: 1, minHeight: 40 }}>
                        {testPanel ? (
                            <Tab
                                label={intl.formatMessage({
                                    id: 'Apis.Details.Policies.PolicyForm.Editor.PolicyEditorWorkspace'
                                        + '.test.tab.enabled',
                                    defaultMessage: 'Test',
                                })}
                                data-testid='policy-editor-test-tab'
                            />
                        ) : (
                            <Tab
                                label={(
                                    <Tooltip title={testDisabledReason || ''}>
                                        <span>
                                            {intl.formatMessage({
                                                id: 'Apis.Details.Policies.PolicyForm.Editor.'
                                                    + 'PolicyEditorWorkspace.test.tab',
                                                defaultMessage: 'Test (coming soon)',
                                            })}
                                        </span>
                                    </Tooltip>
                                )}
                                disabled
                                data-testid='policy-editor-test-tab-disabled'
                            />
                        )}
                    </Tabs>
                    {testPanel && trace && trace.length > 0 && onClearResults && (
                        <Button
                            size='small'
                            startIcon={<ClearIcon />}
                            onClick={triggerClearResults}
                            data-testid='policy-editor-clear-results-btn'
                        >
                            <FormattedMessage
                                id='Apis.Details.Policies.PolicyForm.Editor.PolicyEditorWorkspace.clearResults'
                                defaultMessage='Clear results'
                            />
                        </Button>
                    )}
                    {testPanel && (
                        <Tooltip
                            title={intl.formatMessage(bottomCollapsed ? {
                                id: 'Apis.Details.Policies.PolicyForm.Editor.PolicyEditorWorkspace'
                                    + '.test.expand',
                                defaultMessage: 'Expand test panel',
                            } : {
                                id: 'Apis.Details.Policies.PolicyForm.Editor.PolicyEditorWorkspace'
                                    + '.test.collapse',
                                defaultMessage: 'Collapse test panel',
                            })}
                        >
                            <IconButton
                                size='small'
                                onClick={toggleBottomCollapsed}
                                aria-label='toggle-test-panel-collapse'
                                data-testid='policy-editor-test-panel-collapse-btn'
                            >
                                {bottomCollapsed
                                    ? <UnfoldMoreIcon fontSize='small' />
                                    : <UnfoldLessIcon fontSize='small' />}
                            </IconButton>
                        </Tooltip>
                    )}
                </Toolbar>
                {/* Fase 5: TestPanel. Issue 1: no `overflowY` here anymore - TestPanel now owns its
                    own scrolling (separate Inputs/Results panes) and a sticky Run/Cancel toolbar,
                    so double-scrolling this wrapper would clip its sticky positioning. Issue 3:
                    stays mounted at all times (never unmounted on collapse) so the Test panel's
                    own sticky toolbar - env selector, Run/Cancel button, last-run status chip -
                    doubles as the "slim bar" collapsed view; its inputs/results content below is
                    `display: none` (via the `collapsed` prop, not a clipped ancestor height) so
                    this container's own height only needs to fit whatever TestPanel actually
                    renders - the toolbar's natural height while collapsed, `bottomHeight` once
                    expanded. */}
                {testPanel ? (
                    <Box sx={{
                        height: bottomCollapsed ? 'auto' : bottomHeight,
                        overflow: bottomCollapsed ? 'visible' : 'hidden',
                    }}
                    data-testid='policy-editor-test-panel-container'
                    >
                        {testPanelWithRunHook}
                    </Box>
                ) : null}
            </Box>
        </Dialog>
    );
});

PolicyEditorWorkspace.displayName = 'PolicyEditorWorkspace';

export default PolicyEditorWorkspace;
